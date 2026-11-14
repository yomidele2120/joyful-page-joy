-- =====================================================================
-- 1. SERVER-SIDE CALL WAITING QUEUE   2. ADMIN AUDIT LOG
-- Layered on the existing call system (call_logs, start_call, finish_call, call_quota_for_user, call_peer_check).
-- Nothing existing is changed except one new trigger on call_logs. Safe to run more than once.
--
-- Queue model: a buyer who finds a supplier busy joins a queue (if there is room for their supplier's plan). When the
-- supplier becomes free, the database OFFERS the turn to the oldest waiting buyer for `offer_seconds`. The buyer accepts
-- (their app then starts the call through start_call, so every existing quota and permission check still applies).
-- If they do not accept in time the offer lapses and the next buyer is offered. All of it happens in the database, so it
-- does not depend on anyone's browser staying open. Expiry is applied whenever the queue is touched, and also by
-- cq_sweep() for a scheduler (optional).
-- =====================================================================

-- ---------------------------------------------------------------- settings (admin-editable, no code change)
CREATE TABLE IF NOT EXISTS public.call_queue_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  queue_enabled boolean NOT NULL DEFAULT true,
  offer_seconds smallint NOT NULL DEFAULT 30 CHECK (offer_seconds BETWEEN 10 AND 300),
  entry_ttl_minutes smallint NOT NULL DEFAULT 30 CHECK (entry_ttl_minutes BETWEEN 1 AND 720),
  max_queues_per_buyer smallint NOT NULL DEFAULT 3 CHECK (max_queues_per_buyer BETWEEN 1 AND 20),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.call_queue_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.call_queue_capacity (
  plan_slug text PRIMARY KEY,
  max_waiting smallint NOT NULL DEFAULT 3 CHECK (max_waiting BETWEEN 0 AND 100),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- Starting values from the specification (free 3, silver 5, premium 10). Admins change them in the dashboard.
INSERT INTO public.call_queue_capacity (plan_slug, max_waiting) VALUES ('free', 3), ('silver', 5), ('premium', 10)
ON CONFLICT (plan_slug) DO NOTHING;

-- ---------------------------------------------------------------- queue
CREATE TABLE IF NOT EXISTS public.call_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caller_id uuid NOT NULL,                      -- the waiting buyer (auth user)
  callee_id uuid NOT NULL,                      -- the supplier's auth user
  call_type text NOT NULL CHECK (call_type IN ('voice', 'video')),
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'offered', 'completed', 'cancelled', 'expired', 'missed')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  offered_at timestamptz,
  offer_expires_at timestamptz,
  finished_at timestamptz,
  call_id uuid,
  CHECK (caller_id <> callee_id)
);
-- One active entry per buyer per supplier (stops double-clicks and duplicate joins).
CREATE UNIQUE INDEX IF NOT EXISTS uq_call_queue_active ON public.call_queue (caller_id, callee_id) WHERE status IN ('waiting', 'offered');
CREATE INDEX IF NOT EXISTS idx_call_queue_callee ON public.call_queue (callee_id, created_at) WHERE status IN ('waiting', 'offered');
CREATE INDEX IF NOT EXISTS idx_call_queue_caller ON public.call_queue (caller_id) WHERE status IN ('waiting', 'offered');

ALTER TABLE public.call_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_queue_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_queue_capacity ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Queue participants and admins read" ON public.call_queue;
CREATE POLICY "Queue participants and admins read" ON public.call_queue FOR SELECT TO authenticated
  USING (auth.uid() = caller_id OR auth.uid() = callee_id OR public.has_role(auth.uid(), 'admin'));
-- No write policies: rows change only through the functions below.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.call_queue FROM anon, authenticated;
REVOKE ALL ON public.call_queue FROM anon;
DROP POLICY IF EXISTS "Read queue settings" ON public.call_queue_settings;
CREATE POLICY "Read queue settings" ON public.call_queue_settings FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Admins manage queue settings" ON public.call_queue_settings;
CREATE POLICY "Admins manage queue settings" ON public.call_queue_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Read queue capacity" ON public.call_queue_capacity;
CREATE POLICY "Read queue capacity" ON public.call_queue_capacity FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Admins manage queue capacity" ON public.call_queue_capacity;
CREATE POLICY "Admins manage queue capacity" ON public.call_queue_capacity FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Realtime: participants receive changes to their own rows only (Realtime applies the SELECT policy above).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'call_queue') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.call_queue;
  END IF;
END $$;

-- ---------------------------------------------------------------- internals
-- Is this user on a call right now? (same notion of "active" as call_quota_for_user: not ended, and not a stale ring)
CREATE OR REPLACE FUNCTION public.cq_user_busy(_user uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.call_logs
                  WHERE ended_at IS NULL AND (caller_id = _user OR callee_id = _user)
                    AND (answered_at IS NOT NULL OR created_at > now() - interval '2 minutes'));
$$;

-- Expires old waiting entries and lapsed offers. Returns the suppliers whose queue needs promoting.
CREATE OR REPLACE FUNCTION public.cq_expire() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _s public.call_queue_settings%ROWTYPE; _callee uuid;
BEGIN
  SELECT * INTO _s FROM public.call_queue_settings WHERE id;
  UPDATE public.call_queue SET status = 'expired', finished_at = now()
   WHERE status = 'waiting' AND created_at < now() - make_interval(mins => _s.entry_ttl_minutes);
  FOR _callee IN
    WITH lapsed AS (UPDATE public.call_queue SET status = 'missed', finished_at = now()
                     WHERE status = 'offered' AND offer_expires_at < now() RETURNING callee_id)
    SELECT DISTINCT callee_id FROM lapsed
  LOOP
    PERFORM public.cq_promote(_callee);
  END LOOP;
END $$;

-- Offers the turn to the oldest eligible waiting buyer, if the supplier is free and nobody holds an open offer.
CREATE OR REPLACE FUNCTION public.cq_promote(_callee uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _s public.call_queue_settings%ROWTYPE; _next record; _id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('cq:' || _callee::text, 0));
  SELECT * INTO _s FROM public.call_queue_settings WHERE id;
  IF NOT _s.queue_enabled THEN RETURN NULL; END IF;
  IF public.cq_user_busy(_callee) THEN RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM public.call_queue WHERE callee_id = _callee AND status = 'offered' AND offer_expires_at >= now()) THEN RETURN NULL; END IF;
  FOR _next IN SELECT id, caller_id FROM public.call_queue WHERE callee_id = _callee AND status = 'waiting' ORDER BY created_at, id LOOP
    IF public.cq_user_busy(_next.caller_id) THEN CONTINUE; END IF;   -- skip a buyer who is on another call; they keep their place
    UPDATE public.call_queue SET status = 'offered', offered_at = now(), offer_expires_at = now() + make_interval(secs => _s.offer_seconds)
     WHERE id = _next.id RETURNING id INTO _id;
    RETURN _id;
  END LOOP;
  RETURN NULL;
END $$;

-- ---------------------------------------------------------------- buyer functions
CREATE OR REPLACE FUNCTION public.join_call_queue(_callee uuid, _type text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _me uuid := auth.uid(); _s public.call_queue_settings%ROWTYPE; _check jsonb; _vendor uuid; _plan text; _cap integer; _waiting integer;
  _mine integer; _quota jsonb; _id uuid; _existing uuid; _pos integer;
BEGIN
  IF _me IS NULL THEN RAISE EXCEPTION 'Please sign in.'; END IF;
  IF _type NOT IN ('voice', 'video') THEN RAISE EXCEPTION 'Unknown call type.'; END IF;
  IF _callee IS NULL OR _callee = _me THEN RAISE EXCEPTION 'This call is not allowed.'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('cq:' || _callee::text, 0));
  PERFORM public.cq_expire();
  SELECT * INTO _s FROM public.call_queue_settings WHERE id;
  IF NOT _s.queue_enabled THEN RETURN jsonb_build_object('action', 'unavailable', 'reason', 'queue_off'); END IF;

  -- Same permission rule as a normal call (calls on, existing chat, never buyer-to-buyer, ...).
  _check := public.call_peer_check(_callee);
  IF NOT (_check ->> 'allowed')::boolean THEN RETURN jsonb_build_object('action', 'unavailable', 'reason', _check ->> 'reason'); END IF;

  SELECT id INTO _vendor FROM public.vendors WHERE user_id = _callee AND is_approved;
  IF _vendor IS NULL THEN RETURN jsonb_build_object('action', 'unavailable', 'reason', 'vendor_not_available'); END IF;

  -- No queue if the buyer cannot call at all, or the supplier has used up their allowance.
  _quota := public.call_quota_for_user(_me);
  IF NOT coalesce((_quota ->> 'allowed')::boolean, false) AND _quota ->> 'reason' <> 'concurrent_call_limit' THEN
    RETURN jsonb_build_object('action', 'unavailable', 'reason', 'your_allowance_used'); END IF;
  _quota := public.call_quota_for_user(_callee);
  IF NOT coalesce((_quota ->> 'allowed')::boolean, false) AND _quota ->> 'reason' <> 'concurrent_call_limit' THEN
    RETURN jsonb_build_object('action', 'unavailable', 'reason', 'vendor_allowance_used'); END IF;

  SELECT id INTO _existing FROM public.call_queue WHERE caller_id = _me AND callee_id = _callee AND status IN ('waiting', 'offered');
  IF _existing IS NOT NULL THEN RETURN jsonb_build_object('action', 'already_queued', 'id', _existing); END IF;

  SELECT count(*) INTO _waiting FROM public.call_queue WHERE callee_id = _callee AND status IN ('waiting', 'offered');
  IF NOT public.cq_user_busy(_callee) AND _waiting = 0 THEN RETURN jsonb_build_object('action', 'call_now'); END IF;

  SELECT count(*) INTO _mine FROM public.call_queue WHERE caller_id = _me AND status IN ('waiting', 'offered');
  IF _mine >= _s.max_queues_per_buyer THEN RETURN jsonb_build_object('action', 'unavailable', 'reason', 'too_many_queues'); END IF;

  _plan := public.effective_supplier_plan(_vendor);
  SELECT max_waiting INTO _cap FROM public.call_queue_capacity WHERE plan_slug = _plan;
  IF coalesce(_cap, 0) <= 0 THEN RETURN jsonb_build_object('action', 'unavailable', 'reason', 'queue_not_available'); END IF;
  IF _waiting >= _cap THEN RETURN jsonb_build_object('action', 'queue_full', 'capacity', _cap); END IF;

  INSERT INTO public.call_queue (caller_id, callee_id, call_type) VALUES (_me, _callee, _type) RETURNING id INTO _id;
  PERFORM public.cq_promote(_callee);   -- if the supplier happens to be free, the first in line is offered the turn straight away
  SELECT count(*) + 1 INTO _pos FROM public.call_queue q WHERE q.callee_id = _callee AND q.status IN ('waiting', 'offered')
     AND (q.created_at, q.id) < (SELECT created_at, id FROM public.call_queue WHERE id = _id);
  RETURN jsonb_build_object('action', 'queued', 'id', _id, 'position', _pos, 'capacity', _cap);
END $$;

CREATE OR REPLACE FUNCTION public.leave_call_queue(_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _me uuid := auth.uid(); _row public.call_queue%ROWTYPE;
BEGIN
  IF _me IS NULL THEN RAISE EXCEPTION 'Please sign in.'; END IF;
  SELECT * INTO _row FROM public.call_queue WHERE id = _id AND caller_id = _me FOR UPDATE;
  IF NOT FOUND OR _row.status NOT IN ('waiting', 'offered') THEN RETURN false; END IF;
  UPDATE public.call_queue SET status = 'cancelled', finished_at = now() WHERE id = _id;
  PERFORM public.cq_promote(_row.callee_id);   -- a cancelled offer passes straight to the next buyer
  RETURN true;
END $$;

-- The buyer's own entries with live positions. VOLATILE because it applies expiry first.
CREATE OR REPLACE FUNCTION public.my_call_queue() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _me uuid := auth.uid();
BEGIN
  IF _me IS NULL THEN RETURN '[]'::jsonb; END IF;
  PERFORM public.cq_expire();
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id', q.id, 'callee_id', q.callee_id, 'call_type', q.call_type, 'status', q.status, 'joined_at', q.created_at,
      'offer_expires_at', q.offer_expires_at,
      'store_name', (SELECT v.store_name FROM public.vendors v WHERE v.user_id = q.callee_id),
      'position', (SELECT count(*) + 1 FROM public.call_queue o WHERE o.callee_id = q.callee_id AND o.status IN ('waiting', 'offered')
                      AND (o.created_at, o.id) < (q.created_at, q.id))) ORDER BY q.created_at)
    FROM public.call_queue q WHERE q.caller_id = _me AND q.status IN ('waiting', 'offered')), '[]'::jsonb);
END $$;

-- Taking a turn is two steps so the app can reuse its existing call screen (and so a failed start loses nothing):
--   1. begin_queue_offer(id)    checks the offer is still valid and yours; returns who to call. The entry stays "offered".
--   2. the app calls start_call() as usual (all quota/permission checks apply)
--   3. complete_queue_offer(id) links the new call and closes the entry.
CREATE OR REPLACE FUNCTION public.begin_queue_offer(_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _me uuid := auth.uid(); _row public.call_queue%ROWTYPE;
BEGIN
  IF _me IS NULL THEN RAISE EXCEPTION 'Please sign in.'; END IF;
  PERFORM public.cq_expire();
  SELECT * INTO _row FROM public.call_queue WHERE id = _id AND caller_id = _me;
  IF NOT FOUND OR _row.status <> 'offered' OR _row.offer_expires_at < now() THEN RAISE EXCEPTION 'This turn is no longer available.'; END IF;
  RETURN jsonb_build_object('callee_id', _row.callee_id, 'call_type', _row.call_type,
    'store_name', (SELECT v.store_name FROM public.vendors v WHERE v.user_id = _row.callee_id));
END $$;

CREATE OR REPLACE FUNCTION public.complete_queue_offer(_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _me uuid := auth.uid(); _row public.call_queue%ROWTYPE; _call uuid;
BEGIN
  IF _me IS NULL THEN RAISE EXCEPTION 'Please sign in.'; END IF;
  SELECT * INTO _row FROM public.call_queue WHERE id = _id AND caller_id = _me FOR UPDATE;
  IF NOT FOUND OR _row.status <> 'offered' THEN RETURN false; END IF;
  SELECT id INTO _call FROM public.call_logs
   WHERE caller_id = _me AND callee_id = _row.callee_id AND created_at >= _row.offered_at ORDER BY created_at DESC LIMIT 1;
  IF _call IS NULL THEN RETURN false; END IF;     -- the call did not start: the buyer keeps the offer until it lapses
  UPDATE public.call_queue SET status = 'completed', finished_at = now(), call_id = _call WHERE id = _id;
  RETURN true;
END $$;

-- ---------------------------------------------------------------- supplier / admin views
CREATE OR REPLACE FUNCTION public.my_vendor_call_queue() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _me uuid := auth.uid();
BEGIN
  IF _me IS NULL OR NOT EXISTS (SELECT 1 FROM public.vendors WHERE user_id = _me) THEN RETURN jsonb_build_object('waiting', 0); END IF;
  PERFORM public.cq_expire();
  RETURN jsonb_build_object('waiting', (SELECT count(*) FROM public.call_queue WHERE callee_id = _me AND status IN ('waiting', 'offered')),
    'offered', (SELECT count(*) FROM public.call_queue WHERE callee_id = _me AND status = 'offered'));
END $$;

CREATE OR REPLACE FUNCTION public.admin_call_queue_overview() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admins only.'; END IF;
  PERFORM public.cq_expire();
  RETURN jsonb_build_object(
    'waiting_now', (SELECT count(*) FROM public.call_queue WHERE status = 'waiting'),
    'offered_now', (SELECT count(*) FROM public.call_queue WHERE status = 'offered'),
    'today', (SELECT coalesce(jsonb_object_agg(status, c), '{}'::jsonb) FROM (SELECT status, count(*) c FROM public.call_queue
                WHERE created_at >= date_trunc('day', now() AT TIME ZONE 'Africa/Lagos') AT TIME ZONE 'Africa/Lagos' GROUP BY status) t),
    'busiest', coalesce((SELECT jsonb_agg(t) FROM (SELECT v.store_name, count(*) AS waiting FROM public.call_queue q
                JOIN public.vendors v ON v.user_id = q.callee_id WHERE q.status IN ('waiting', 'offered')
                GROUP BY v.store_name ORDER BY count(*) DESC LIMIT 10) t), '[]'::jsonb));
END $$;

-- For an optional scheduler (pg_cron every minute) so offers lapse and move on even if nobody opens the app.
CREATE OR REPLACE FUNCTION public.cq_sweep() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _c uuid;
BEGIN
  PERFORM public.cq_expire();
  FOR _c IN SELECT DISTINCT callee_id FROM public.call_queue WHERE status = 'waiting' LOOP PERFORM public.cq_promote(_c); END LOOP;
END $$;

-- When ANY call ends, whoever was on it may now be free: offer their queue's first buyer the turn.
CREATE OR REPLACE FUNCTION public.cq_on_call_end() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.cq_promote(NEW.callee_id);
  PERFORM public.cq_promote(NEW.caller_id);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_call_queue_on_end ON public.call_logs;
CREATE TRIGGER trg_call_queue_on_end AFTER UPDATE OF ended_at ON public.call_logs
  FOR EACH ROW WHEN (OLD.ended_at IS NULL AND NEW.ended_at IS NOT NULL) EXECUTE FUNCTION public.cq_on_call_end();

-- =====================================================================
-- ADMIN AUDIT LOG
-- Records what an ADMIN changed (who, when, which record, old and new values). Rows are written by triggers, so no
-- screen can forget to log, and nobody can edit or delete a row (admins can only read).
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_admin_audit_at ON public.admin_audit_logs (at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_entity ON public.admin_audit_logs (entity_type, at DESC);
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read audit logs" ON public.admin_audit_logs;
CREATE POLICY "Admins read audit logs" ON public.admin_audit_logs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.admin_audit_logs FROM anon, authenticated;
REVOKE ALL ON public.admin_audit_logs FROM anon;

CREATE OR REPLACE FUNCTION public.audit_admin_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _actor uuid := auth.uid(); _diff jsonb; _id text; _new jsonb; _old jsonb;
  _skip text[] := ARRAY['updated_at', 'impressions_count', 'clicks_count', 'shop_visits_count', 'product_visits_count', 'locked_at', 'last_attempt_at'];
BEGIN
  IF _actor IS NULL OR NOT public.has_role(_actor, 'admin') THEN IF TG_OP = 'DELETE' THEN RETURN OLD; END IF; RETURN NEW; END IF;   -- only admin actions are logged
  IF TG_OP = 'DELETE' THEN
    _old := to_jsonb(OLD); _id := coalesce(_old ->> 'id', _old ->> 'plan_slug');
    INSERT INTO public.admin_audit_logs (actor_id, action, entity_type, entity_id, details) VALUES (_actor, 'delete', TG_TABLE_NAME, _id, jsonb_build_object('row', left(_old::text, 2000)));
    RETURN OLD;
  END IF;
  _new := to_jsonb(NEW); _id := coalesce(_new ->> 'id', _new ->> 'plan_slug');
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.admin_audit_logs (actor_id, action, entity_type, entity_id, details) VALUES (_actor, 'create', TG_TABLE_NAME, _id, jsonb_build_object('row', left(_new::text, 2000)));
    RETURN NEW;
  END IF;
  _old := to_jsonb(OLD);
  SELECT jsonb_object_agg(n.key, jsonb_build_object('from', left(o.value::text, 200), 'to', left(n.value::text, 200))) INTO _diff
    FROM jsonb_each(_new) n JOIN jsonb_each(_old) o USING (key)
   WHERE o.value IS DISTINCT FROM n.value AND n.key <> ALL (_skip);
  IF _diff IS NULL THEN RETURN NEW; END IF;      -- only counters changed: nothing worth recording
  INSERT INTO public.admin_audit_logs (actor_id, action, entity_type, entity_id, details) VALUES (_actor, 'update', TG_TABLE_NAME, _id, jsonb_build_object('changes', _diff));
  RETURN NEW;
END $$;

DO $$
DECLARE _t text;
BEGIN
  FOREACH _t IN ARRAY ARRAY['advertising_settings', 'advertising_plan_features', 'vendor_advertising_campaigns', 'vendor_advertising_banners',
                            'external_ad_campaigns', 'vendor_social_profiles', 'call_queue_settings', 'call_queue_capacity', 'call_plan_quotas',
                            'buyer_call_quotas', 'supplier_membership_plans']
  LOOP
    IF to_regclass('public.' || _t) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%1$s ON public.%1$I', _t);
      EXECUTE format('CREATE TRIGGER trg_audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON public.%1$I FOR EACH ROW EXECUTE FUNCTION public.audit_admin_change()', _t);
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.admin_list_audit_logs(_entity text DEFAULT NULL, _limit integer DEFAULT 100, _before bigint DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admins only.'; END IF;
  RETURN coalesce((SELECT jsonb_agg(to_jsonb(t) || jsonb_build_object('actor_email', (SELECT u.email FROM auth.users u WHERE u.id = t.actor_id)) ORDER BY t.id DESC)
    FROM (SELECT * FROM public.admin_audit_logs WHERE (_entity IS NULL OR entity_type = _entity) AND (_before IS NULL OR id < _before)
           ORDER BY id DESC LIMIT least(greatest(coalesce(_limit, 100), 1), 300)) t), '[]'::jsonb);
END $$;

-- ---------------------------------------------------------------- permissions
DO $$
DECLARE _f text;
BEGIN
  FOREACH _f IN ARRAY ARRAY['cq_user_busy(uuid)', 'cq_expire()', 'cq_promote(uuid)', 'cq_sweep()', 'cq_on_call_end()', 'audit_admin_change()'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', _f);
  END LOOP;
  FOREACH _f IN ARRAY ARRAY['join_call_queue(uuid,text)', 'leave_call_queue(uuid)', 'my_call_queue()', 'begin_queue_offer(uuid)', 'complete_queue_offer(uuid)',
                            'my_vendor_call_queue()', 'admin_call_queue_overview()', 'admin_list_audit_logs(text,integer,bigint)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', _f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', _f);
  END LOOP;
END $$;

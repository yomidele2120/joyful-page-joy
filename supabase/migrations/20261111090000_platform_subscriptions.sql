-- =====================================================================
-- PLATFORM SUBSCRIPTIONS (admin only)
--   * platform_subscriptions   - the services the platform is paid up on: Vercel, Supabase (a term with an expiry date) and
--                                ZEGOCLOUD (a bundle of call minutes that are used up as people call)
--   * zego_minutes_used()      - minutes used so far = length of every connected call since "counts_from", rounded up per call
--   * subscription_overview()  - what the admin dashboard shows; also sends the admin a notification when a term is about to
--                                expire / has expired or the call minutes are running low / have run out
--   * call_peer_check()/start_call() - updated so new calls are refused once the call minutes are used up (can be switched off)
-- Safe to run more than once.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.platform_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]{2,40}$'),
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 80),
  kind text NOT NULL CHECK (kind IN ('term', 'minutes')),
  started_at timestamptz NOT NULL,
  expires_at timestamptz,
  total_minutes integer CHECK (total_minutes IS NULL OR total_minutes >= 0),
  counts_from timestamptz,
  participants_counted smallint NOT NULL DEFAULT 1 CHECK (participants_counted IN (1, 2)),
  block_when_exhausted boolean NOT NULL DEFAULT true,
  note text CHECK (note IS NULL OR char_length(note) <= 500),
  alert_stage text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT term_has_expiry CHECK (kind <> 'term' OR expires_at IS NOT NULL),
  CONSTRAINT minutes_has_total CHECK (kind <> 'minutes' OR (total_minutes IS NOT NULL AND counts_from IS NOT NULL))
);
ALTER TABLE public.platform_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage subscriptions" ON public.platform_subscriptions;
CREATE POLICY "Admins manage subscriptions" ON public.platform_subscriptions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
REVOKE ALL ON public.platform_subscriptions FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_subscriptions TO authenticated;

-- Editing the dates or the minutes (a renewal or a top-up) starts the alerts afresh.
CREATE OR REPLACE FUNCTION public.platform_subscriptions_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  IF TG_OP = 'UPDATE' AND (NEW.expires_at IS DISTINCT FROM OLD.expires_at OR NEW.total_minutes IS DISTINCT FROM OLD.total_minutes
                           OR NEW.counts_from IS DISTINCT FROM OLD.counts_from OR NEW.participants_counted IS DISTINCT FROM OLD.participants_counted) THEN
    NEW.alert_stage := NULL;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_platform_subscriptions_touch ON public.platform_subscriptions;
CREATE TRIGGER trg_platform_subscriptions_touch BEFORE INSERT OR UPDATE ON public.platform_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.platform_subscriptions_touch();

-- Starting entries. Vercel and Supabase: one year, bought 3 Nov 2026. ZEGOCLOUD: 10,000 minutes, counted from the moment this
-- update is run (calls made while testing before that are not counted; the admin can change the date on the dashboard).
INSERT INTO public.platform_subscriptions (slug, name, kind, started_at, expires_at, note) VALUES
  ('vercel', 'Vercel (website hosting)', 'term', '2026-11-03T00:00:00Z', '2027-11-03T00:00:00Z', '1 year'),
  ('supabase', 'Supabase (database and login)', 'term', '2026-11-03T00:00:00Z', '2027-11-03T00:00:00Z', '1 year')
ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.platform_subscriptions (slug, name, kind, started_at, total_minutes, counts_from, note) VALUES
  ('zegocloud', 'ZEGOCLOUD (voice and video calls)', 'minutes', now(), 10000, now(), '10,000 call minutes')
ON CONFLICT (slug) DO NOTHING;

-- Minutes used: every connected call, rounded up to whole minutes, since counts_from. If participants_counted is 2, both people on
-- the call are counted (ZEGOCLOUD bills per person per minute), so a 3 minute call uses 6.
CREATE OR REPLACE FUNCTION public.zego_minutes_stats(_sub public.platform_subscriptions)
RETURNS TABLE (used_minutes bigint, calls_counted bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(sum(ceil(c.duration_seconds / 60.0)), 0)::bigint * _sub.participants_counted, count(*)
  FROM public.call_logs c
  WHERE c.duration_seconds > 0 AND c.answered_at >= _sub.counts_from;
$$;
REVOKE ALL ON FUNCTION public.zego_minutes_stats(public.platform_subscriptions) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.zego_minutes_exhausted()
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _s public.platform_subscriptions%ROWTYPE; _used bigint;
BEGIN
  SELECT * INTO _s FROM public.platform_subscriptions WHERE slug = 'zegocloud' AND kind = 'minutes';
  IF NOT FOUND OR NOT _s.block_when_exhausted THEN RETURN false; END IF;
  SELECT used_minutes INTO _used FROM public.zego_minutes_stats(_s);
  RETURN _used >= _s.total_minutes;
END $$;
REVOKE ALL ON FUNCTION public.zego_minutes_exhausted() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.zego_minutes_exhausted() TO authenticated;

-- Where a subscription stands right now.
CREATE OR REPLACE FUNCTION public.subscription_stage(_kind text, _expires timestamptz, _total integer, _used bigint)
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN _kind = 'term' THEN
      CASE WHEN _expires <= now() THEN 'expired'
           WHEN _expires <= now() + interval '1 day' THEN 'd1'
           WHEN _expires <= now() + interval '7 days' THEN 'd7'
           WHEN _expires <= now() + interval '14 days' THEN 'd14'
           WHEN _expires <= now() + interval '30 days' THEN 'd30' END
    ELSE
      CASE WHEN _used >= _total THEN 'exhausted'
           WHEN _total > 0 AND _used * 100 >= _total * 95 THEN 'p95'
           WHEN _total > 0 AND _used * 100 >= _total * 90 THEN 'p90'
           WHEN _total > 0 AND _used * 100 >= _total * 80 THEN 'p80' END
  END;
$$;

-- Tell every admin when a subscription enters a new warning stage. One notification per stage, so nobody is spammed.
CREATE OR REPLACE FUNCTION public.check_subscription_alerts()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _s public.platform_subscriptions%ROWTYPE;
  _used bigint; _stage text; _msg text; _admin uuid; _sent integer := 0; _days integer;
BEGIN
  FOR _s IN SELECT * FROM public.platform_subscriptions LOOP
    _used := 0;
    IF _s.kind = 'minutes' THEN SELECT used_minutes INTO _used FROM public.zego_minutes_stats(_s); END IF;
    _stage := public.subscription_stage(_s.kind, _s.expires_at, _s.total_minutes, _used);
    IF _stage IS NOT DISTINCT FROM _s.alert_stage THEN CONTINUE; END IF;
    UPDATE public.platform_subscriptions SET alert_stage = _stage WHERE id = _s.id;
    IF _stage IS NULL THEN CONTINUE; END IF;
    _days := GREATEST(0, ceil(extract(epoch FROM (_s.expires_at - now())) / 86400))::integer;
    _msg := CASE _stage
      WHEN 'expired' THEN _s.name || ' subscription has EXPIRED. Renew it now so the website keeps working.'
      WHEN 'exhausted' THEN _s.name || ': all ' || _s.total_minutes || ' call minutes are used up. ' ||
                            CASE WHEN _s.block_when_exhausted THEN 'New calls are paused until you top up.' ELSE 'Top up soon.' END
      WHEN 'p80' THEN _s.name || ': 80% of the call minutes are used (' || (_s.total_minutes - _used) || ' left).'
      WHEN 'p90' THEN _s.name || ': 90% of the call minutes are used (' || (_s.total_minutes - _used) || ' left).'
      WHEN 'p95' THEN _s.name || ': only ' || (_s.total_minutes - _used) || ' call minutes left.'
      ELSE _s.name || ' subscription expires in ' || _days || CASE WHEN _days = 1 THEN ' day' ELSE ' days' END ||
           ' (' || to_char(_s.expires_at, 'DD Mon YYYY') || '). Renew it in time.' END;
    FOR _admin IN SELECT user_id FROM public.user_roles WHERE role = 'admin' LOOP
      PERFORM public.notify_user(_admin, 'account', _msg, '/admin?tab=subscriptions', NULL, NULL);
      _sent := _sent + 1;
    END LOOP;
  END LOOP;
  RETURN _sent;
END $$;
REVOKE ALL ON FUNCTION public.check_subscription_alerts() FROM PUBLIC, anon, authenticated;

-- What the dashboard shows. Opening the dashboard also sends any alert that is due.
CREATE OR REPLACE FUNCTION public.subscription_overview()
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE _out jsonb := '[]'::jsonb; _s public.platform_subscriptions%ROWTYPE; _used bigint; _calls bigint;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admins only.'; END IF;
  PERFORM public.check_subscription_alerts();
  FOR _s IN SELECT * FROM public.platform_subscriptions ORDER BY kind, name LOOP
    _used := 0; _calls := 0;
    IF _s.kind = 'minutes' THEN SELECT used_minutes, calls_counted INTO _used, _calls FROM public.zego_minutes_stats(_s); END IF;
    _out := _out || jsonb_build_object(
      'id', _s.id, 'slug', _s.slug, 'name', _s.name, 'kind', _s.kind, 'note', _s.note,
      'started_at', _s.started_at, 'expires_at', _s.expires_at,
      'days_left', CASE WHEN _s.kind = 'term' THEN floor(extract(epoch FROM (_s.expires_at - now())) / 86400) END,
      'total_minutes', _s.total_minutes, 'used_minutes', _used, 'calls_counted', _calls,
      'remaining_minutes', CASE WHEN _s.kind = 'minutes' THEN GREATEST(0, _s.total_minutes - _used) END,
      'counts_from', _s.counts_from, 'participants_counted', _s.participants_counted,
      'block_when_exhausted', _s.block_when_exhausted,
      'stage', public.subscription_stage(_s.kind, _s.expires_at, _s.total_minutes, _used));
  END LOOP;
  RETURN _out;
END $$;
REVOKE ALL ON FUNCTION public.subscription_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.subscription_overview() TO authenticated;

-- ------------------------------------------------------------------ calls stop when the minutes run out
CREATE OR REPLACE FUNCTION public.call_peer_check(_peer uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _me uuid := auth.uid();
  _on boolean;
  _convo uuid;
  _me_vendor boolean;
  _peer_vendor boolean;
  _name text;
BEGIN
  IF _me IS NULL THEN RETURN jsonb_build_object('allowed', false, 'reason', 'not_signed_in'); END IF;
  IF _peer IS NULL OR _peer = _me THEN RETURN jsonb_build_object('allowed', false, 'reason', 'invalid_peer'); END IF;

  SELECT calls_enabled INTO _on FROM public.marketplace_settings WHERE id = true;
  IF NOT COALESCE(_on, false) THEN RETURN jsonb_build_object('allowed', false, 'reason', 'calls_off'); END IF;
  IF public.zego_minutes_exhausted() THEN RETURN jsonb_build_object('allowed', false, 'reason', 'minutes_exhausted'); END IF;

  SELECT id INTO _convo FROM public.conversations
  WHERE (participant_1 = _me AND participant_2 = _peer) OR (participant_1 = _peer AND participant_2 = _me)
  LIMIT 1;
  IF _convo IS NULL THEN RETURN jsonb_build_object('allowed', false, 'reason', 'no_conversation'); END IF;

  _me_vendor := EXISTS (SELECT 1 FROM public.vendors WHERE user_id = _me);
  _peer_vendor := EXISTS (SELECT 1 FROM public.vendors WHERE user_id = _peer);
  IF NOT (_me_vendor OR _peer_vendor) THEN RETURN jsonb_build_object('allowed', false, 'reason', 'buyers_cannot_call_buyers'); END IF;

  IF _peer_vendor THEN SELECT store_name INTO _name FROM public.vendors WHERE user_id = _peer;
  ELSE SELECT full_name INTO _name FROM public.profiles WHERE user_id = _peer; END IF;

  RETURN jsonb_build_object('allowed', true, 'reason', 'ok', 'conversation_id', _convo,
                            'name', COALESCE(NULLIF(trim(_name), ''), 'Member'), 'peer_is_vendor', _peer_vendor);
END $$;

CREATE OR REPLACE FUNCTION public.start_call(_peer uuid, _type text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _me uuid := auth.uid();
  _check jsonb;
  _id uuid;
BEGIN
  IF _type NOT IN ('voice','video') THEN RAISE EXCEPTION 'Unknown call type'; END IF;
  _check := public.call_peer_check(_peer);
  IF NOT (_check->>'allowed')::boolean THEN
    RAISE EXCEPTION '%', CASE _check->>'reason'
      WHEN 'calls_off' THEN 'Calling is not switched on yet.'
      WHEN 'minutes_exhausted' THEN 'Calling is paused because the prepaid call minutes have run out. Please try again later.'
      WHEN 'no_conversation' THEN 'Send a message first, then you can call.'
      WHEN 'buyers_cannot_call_buyers' THEN 'Calls are only between buyers and suppliers, or between suppliers.'
      WHEN 'not_signed_in' THEN 'Please sign in to call.'
      ELSE 'This call is not allowed.' END;
  END IF;

  -- Tidy this person's abandoned calls (a closed tab never reports back): unanswered ones become "missed",
  -- connected ones that were never closed become "ended" (their length is unknown, so none is recorded).
  UPDATE public.call_logs SET status = 'missed', ended_at = created_at + interval '60 seconds'
   WHERE (caller_id = _me OR callee_id = _me) AND ended_at IS NULL AND answered_at IS NULL AND created_at < now() - interval '2 minutes';
  UPDATE public.call_logs SET status = 'ended', ended_at = now()
   WHERE (caller_id = _me OR callee_id = _me) AND ended_at IS NULL AND answered_at IS NOT NULL AND answered_at < now() - interval '4 hours';

  IF (SELECT count(*) FROM public.call_logs WHERE caller_id = _me AND created_at > now() - interval '1 hour') >= 20 THEN
    RAISE EXCEPTION 'You have made a lot of calls recently. Please try again a little later.';
  END IF;
  IF (SELECT count(*) FROM public.call_logs WHERE caller_id = _me AND callee_id = _peer
        AND created_at > now() - interval '10 minutes' AND answered_at IS NULL AND status <> 'failed') >= 3 THEN
    RAISE EXCEPTION 'They have not picked up. Send a message and try again later.';
  END IF;

  INSERT INTO public.call_logs (caller_id, callee_id, conversation_id, call_type)
  VALUES (_me, _peer, (_check->>'conversation_id')::uuid, _type)
  RETURNING id INTO _id;
  RETURN _id;
END $$;

REVOKE ALL ON FUNCTION public.call_peer_check(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.call_peer_check(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.start_call(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_call(uuid, text) TO authenticated;

CREATE TABLE IF NOT EXISTS public.call_plan_quotas (
  plan_slug text PRIMARY KEY REFERENCES public.supplier_membership_plans(slug) ON DELETE CASCADE,
  daily_minutes integer NOT NULL CHECK (daily_minutes BETWEEN 0 AND 100000),
  monthly_minutes integer NOT NULL CHECK (monthly_minutes BETWEEN 0 AND 1000000),
  max_concurrent_calls smallint NOT NULL DEFAULT 1 CHECK (max_concurrent_calls BETWEEN 0 AND 10),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.call_plan_quotas (plan_slug, daily_minutes, monthly_minutes, max_concurrent_calls)
VALUES ('free', 10, 30, 1), ('silver', 30, 300, 1), ('premium', 60, 1000, 1)
ON CONFLICT (plan_slug) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.buyer_call_quotas (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  daily_minutes integer NOT NULL DEFAULT 10 CHECK (daily_minutes BETWEEN 0 AND 100000),
  monthly_minutes integer NOT NULL DEFAULT 30 CHECK (monthly_minutes BETWEEN 0 AND 1000000),
  max_concurrent_calls smallint NOT NULL DEFAULT 1 CHECK (max_concurrent_calls BETWEEN 0 AND 10),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.buyer_call_quotas (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.call_platform_cost_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  cost_per_participant_minute_ngn numeric(12, 4) CHECK (cost_per_participant_minute_ngn IS NULL OR cost_per_participant_minute_ngn >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.call_platform_cost_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.call_plan_quotas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buyer_call_quotas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_platform_cost_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage call plan quotas" ON public.call_plan_quotas;
CREATE POLICY "Admins manage call plan quotas" ON public.call_plan_quotas
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Admins manage buyer call quotas" ON public.buyer_call_quotas;
CREATE POLICY "Admins manage buyer call quotas" ON public.buyer_call_quotas
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Admins manage call cost settings" ON public.call_platform_cost_settings;
CREATE POLICY "Admins manage call cost settings" ON public.call_platform_cost_settings
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

REVOKE ALL ON public.call_plan_quotas, public.buyer_call_quotas, public.call_platform_cost_settings FROM PUBLIC, anon;
GRANT SELECT, UPDATE ON public.call_plan_quotas, public.buyer_call_quotas, public.call_platform_cost_settings TO authenticated;

ALTER TABLE public.call_logs
  ADD COLUMN IF NOT EXISTS participant_minutes integer,
  ADD COLUMN IF NOT EXISTS estimated_cost_ngn numeric(12, 2);

CREATE OR REPLACE FUNCTION public.call_quota_for_user(_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _vendor_id uuid;
  _approved boolean;
  _plan text;
  _daily_limit integer;
  _monthly_limit integer;
  _concurrent_limit integer;
  _daily_used integer;
  _monthly_used integer;
  _active_calls integer;
  _day_start timestamptz := date_trunc('day', now() AT TIME ZONE 'Africa/Lagos') AT TIME ZONE 'Africa/Lagos';
  _month_start timestamptz := date_trunc('month', now() AT TIME ZONE 'Africa/Lagos') AT TIME ZONE 'Africa/Lagos';
BEGIN
  SELECT id, is_approved INTO _vendor_id, _approved FROM public.vendors WHERE user_id = _user_id;

  IF _vendor_id IS NOT NULL THEN
    IF _approved IS DISTINCT FROM true THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'vendor_not_approved', 'role', 'vendor');
    END IF;
    _plan := public.effective_supplier_plan(_vendor_id);
    SELECT daily_minutes, monthly_minutes, max_concurrent_calls
      INTO _daily_limit, _monthly_limit, _concurrent_limit
      FROM public.call_plan_quotas WHERE plan_slug = _plan;
  ELSE
    SELECT daily_minutes, monthly_minutes, max_concurrent_calls
      INTO _daily_limit, _monthly_limit, _concurrent_limit
      FROM public.buyer_call_quotas WHERE id = true;
    _plan := 'buyer';
  END IF;

  IF _daily_limit IS NULL OR _monthly_limit IS NULL OR _concurrent_limit IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'quota_configuration_missing', 'role', _plan);
  END IF;

  SELECT COALESCE(sum(ceil(COALESCE(duration_seconds::numeric, extract(epoch FROM (now() - answered_at))) / 60.0)), 0)::integer INTO _daily_used
  FROM public.call_logs
  WHERE (caller_id = _user_id OR callee_id = _user_id)
    AND answered_at >= _day_start
    AND (duration_seconds IS NOT NULL OR ended_at IS NULL);
  SELECT COALESCE(sum(ceil(COALESCE(duration_seconds::numeric, extract(epoch FROM (now() - answered_at))) / 60.0)), 0)::integer INTO _monthly_used
  FROM public.call_logs
  WHERE (caller_id = _user_id OR callee_id = _user_id)
    AND answered_at >= _month_start
    AND (duration_seconds IS NOT NULL OR ended_at IS NULL);
  SELECT count(*)::integer INTO _active_calls
  FROM public.call_logs
  WHERE ended_at IS NULL AND (caller_id = _user_id OR callee_id = _user_id);

  RETURN jsonb_build_object(
    'allowed', _daily_used < _daily_limit AND _monthly_used < _monthly_limit AND _active_calls < _concurrent_limit,
    'reason', CASE
      WHEN _active_calls >= _concurrent_limit THEN 'concurrent_call_limit'
      WHEN _daily_used >= _daily_limit THEN 'daily_quota_exhausted'
      WHEN _monthly_used >= _monthly_limit THEN 'monthly_quota_exhausted'
      ELSE 'ok' END,
    'role', _plan,
    'daily_limit_minutes', _daily_limit,
    'daily_used_minutes', _daily_used,
    'daily_remaining_minutes', GREATEST(0, _daily_limit - _daily_used),
    'monthly_limit_minutes', _monthly_limit,
    'monthly_used_minutes', _monthly_used,
    'monthly_remaining_minutes', GREATEST(0, _monthly_limit - _monthly_used),
    'max_concurrent_calls', _concurrent_limit,
    'active_calls', _active_calls
  );
END $$;
REVOKE ALL ON FUNCTION public.call_quota_for_user(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.my_call_quota()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in.'; END IF;
  RETURN public.call_quota_for_user(auth.uid());
END $$;
REVOKE ALL ON FUNCTION public.my_call_quota() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_call_quota() TO authenticated;

CREATE OR REPLACE FUNCTION public.start_call(_peer uuid, _type text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _me uuid := auth.uid();
  _check jsonb;
  _caller_quota jsonb;
  _peer_quota jsonb;
  _id uuid;
  _reason text;
BEGIN
  IF _me IS NULL THEN RAISE EXCEPTION 'Please sign in to call.'; END IF;
  IF _peer IS NULL OR _peer = _me THEN RAISE EXCEPTION 'This call is not allowed.'; END IF;
  IF _type NOT IN ('voice','video') THEN RAISE EXCEPTION 'Unknown call type'; END IF;

  IF _me::text < _peer::text THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(_me::text, 0));
    PERFORM pg_advisory_xact_lock(hashtextextended(_peer::text, 0));
  ELSE
    PERFORM pg_advisory_xact_lock(hashtextextended(_peer::text, 0));
    PERFORM pg_advisory_xact_lock(hashtextextended(_me::text, 0));
  END IF;

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

  UPDATE public.call_logs SET status = 'missed', ended_at = created_at + interval '60 seconds'
   WHERE (caller_id IN (_me, _peer) OR callee_id IN (_me, _peer))
     AND ended_at IS NULL AND answered_at IS NULL AND created_at < now() - interval '2 minutes';
  WITH stale_calls AS (
    SELECT id, GREATEST(0, round(extract(epoch FROM (now() - answered_at)))::integer) AS duration_seconds
    FROM public.call_logs
    WHERE (caller_id IN (_me, _peer) OR callee_id IN (_me, _peer))
      AND ended_at IS NULL AND answered_at IS NOT NULL AND answered_at < now() - interval '4 hours'
  ), cost AS (
    SELECT cost_per_participant_minute_ngn FROM public.call_platform_cost_settings WHERE id = true
  )
  UPDATE public.call_logs AS call SET status = 'ended', ended_at = now(),
    duration_seconds = stale_calls.duration_seconds,
    participant_minutes = ceil(stale_calls.duration_seconds / 60.0)::integer * 2,
    estimated_cost_ngn = CASE WHEN cost.cost_per_participant_minute_ngn IS NULL THEN NULL
      ELSE round(ceil(stale_calls.duration_seconds / 60.0) * 2 * cost.cost_per_participant_minute_ngn, 2) END
  FROM stale_calls CROSS JOIN cost WHERE call.id = stale_calls.id;

  _caller_quota := public.call_quota_for_user(_me);
  _peer_quota := public.call_quota_for_user(_peer);
  IF NOT COALESCE((_caller_quota->>'allowed')::boolean, false) THEN
    _reason := _caller_quota->>'reason';
    RAISE EXCEPTION '%', CASE _reason
      WHEN 'daily_quota_exhausted' THEN 'You have used your daily call allowance.'
      WHEN 'monthly_quota_exhausted' THEN 'You have used your monthly call allowance.'
      WHEN 'concurrent_call_limit' THEN 'You are already on a call.'
      WHEN 'vendor_not_approved' THEN 'Only approved suppliers can use supplier calling.'
      ELSE 'Your calling allowance is not available.' END;
  END IF;
  IF NOT COALESCE((_peer_quota->>'allowed')::boolean, false) THEN
    _reason := _peer_quota->>'reason';
    RAISE EXCEPTION '%', CASE _reason
      WHEN 'daily_quota_exhausted' THEN 'The other person has used their daily call allowance.'
      WHEN 'monthly_quota_exhausted' THEN 'The other person has used their monthly call allowance.'
      WHEN 'concurrent_call_limit' THEN 'The other person is already on a call.'
      WHEN 'vendor_not_approved' THEN 'This supplier cannot receive calls right now.'
      ELSE 'The other person cannot receive a call right now.' END;
  END IF;

  INSERT INTO public.call_logs (caller_id, callee_id, conversation_id, call_type)
  VALUES (_me, _peer, (_check->>'conversation_id')::uuid, _type)
  RETURNING id INTO _id;
  RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.start_call(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_call(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.finish_call(_call uuid, _outcome text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _me uuid := auth.uid();
  _c public.call_logs%ROWTYPE;
  _duration integer;
  _minutes integer;
  _rate numeric(12, 4);
BEGIN
  IF _outcome NOT IN ('answered','ended','declined','missed','cancelled','busy','failed') THEN RAISE EXCEPTION 'Unknown outcome'; END IF;
  SELECT * INTO _c FROM public.call_logs WHERE id = _call FOR UPDATE;
  IF NOT FOUND OR _me NOT IN (_c.caller_id, _c.callee_id) THEN RAISE EXCEPTION 'Call not found'; END IF;
  IF _c.ended_at IS NOT NULL THEN RETURN; END IF;

  IF _outcome = 'answered' THEN
    UPDATE public.call_logs SET status = 'answered', answered_at = COALESCE(answered_at, now()) WHERE id = _call;
  ELSIF _c.answered_at IS NOT NULL THEN
    _duration := GREATEST(0, round(extract(epoch FROM (now() - _c.answered_at)))::integer);
    _minutes := ceil(_duration / 60.0)::integer * 2;
    SELECT cost_per_participant_minute_ngn INTO _rate FROM public.call_platform_cost_settings WHERE id = true;
    UPDATE public.call_logs SET status = 'ended', ended_at = now(), duration_seconds = _duration,
      participant_minutes = _minutes,
      estimated_cost_ngn = CASE WHEN _rate IS NULL THEN NULL ELSE round(_minutes * _rate, 2) END
    WHERE id = _call;
  ELSE
    UPDATE public.call_logs SET status = CASE WHEN _outcome = 'ended' THEN 'missed' ELSE _outcome END, ended_at = now() WHERE id = _call;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.finish_call(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finish_call(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.call_usage_overview()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _out jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admins only.'; END IF;
  SELECT jsonb_build_object(
    'calls_30d', count(*) FILTER (WHERE created_at >= now() - interval '30 days'),
    'conversation_minutes_30d', round(COALESCE(sum(duration_seconds) FILTER (WHERE ended_at >= now() - interval '30 days'), 0) / 60.0, 2),
    'participant_minutes_30d', COALESCE(sum(participant_minutes) FILTER (WHERE ended_at >= now() - interval '30 days'), 0),
    'estimated_cost_ngn_30d', round(COALESCE(sum(estimated_cost_ngn) FILTER (WHERE ended_at >= now() - interval '30 days'), 0), 2)
  ) INTO _out FROM public.call_logs;
  RETURN _out;
END $$;
REVOKE ALL ON FUNCTION public.call_usage_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.call_usage_overview() TO authenticated;
CREATE TABLE IF NOT EXISTS public.zego_call_quota_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  enabled boolean NOT NULL DEFAULT false,
  daily_minutes integer NOT NULL DEFAULT 30 CHECK (daily_minutes >= 0),
  monthly_minutes integer NOT NULL DEFAULT 300 CHECK (monthly_minutes >= 0),
  max_concurrent_sessions smallint NOT NULL DEFAULT 1 CHECK (max_concurrent_sessions BETWEEN 0 AND 20),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.zego_call_quota_settings (id, enabled, daily_minutes, monthly_minutes, max_concurrent_sessions)
VALUES (true, false, 30, 300, 1)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.zego_call_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vendor_id uuid REFERENCES public.vendors(id) ON DELETE SET NULL,
  conversation_id uuid,
  session_id text,
  call_type text NOT NULL CHECK (call_type IN ('voice', 'video')),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  duration_seconds integer NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended', 'failed', 'cancelled', 'missed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_zego_call_usage_user_time
  ON public.zego_call_usage (user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_zego_call_usage_vendor_time
  ON public.zego_call_usage (vendor_id, started_at DESC);

ALTER TABLE public.zego_call_quota_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zego_call_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage Zego quota settings" ON public.zego_call_quota_settings;
CREATE POLICY "Admins manage Zego quota settings" ON public.zego_call_quota_settings
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Users read own Zego usage" ON public.zego_call_usage;
CREATE POLICY "Users read own Zego usage" ON public.zego_call_usage
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Service role manages Zego usage" ON public.zego_call_usage;
CREATE POLICY "Service role manages Zego usage" ON public.zego_call_usage
  FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON public.zego_call_quota_settings, public.zego_call_usage FROM PUBLIC, anon;
GRANT SELECT ON public.zego_call_quota_settings TO authenticated;
GRANT SELECT ON public.zego_call_usage TO authenticated;

CREATE OR REPLACE FUNCTION public.zego_quota_for_user(_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _settings public.zego_call_quota_settings%ROWTYPE;
  _daily_used integer := 0;
  _monthly_used integer := 0;
  _active integer := 0;
  _day_start timestamptz := date_trunc('day', now() AT TIME ZONE 'Africa/Lagos') AT TIME ZONE 'Africa/Lagos';
  _month_start timestamptz := date_trunc('month', now() AT TIME ZONE 'Africa/Lagos') AT TIME ZONE 'Africa/Lagos';
BEGIN
  SELECT * INTO _settings FROM public.zego_call_quota_settings WHERE id = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'quota_configuration_missing', 'enabled', false);
  END IF;

  SELECT COALESCE(sum(duration_seconds), 0)::integer INTO _daily_used
  FROM public.zego_call_usage
  WHERE user_id = _user_id
    AND started_at >= _day_start
    AND status IN ('ended', 'active');

  SELECT COALESCE(sum(duration_seconds), 0)::integer INTO _monthly_used
  FROM public.zego_call_usage
  WHERE user_id = _user_id
    AND started_at >= _month_start
    AND status IN ('ended', 'active');

  SELECT count(*)::integer INTO _active
  FROM public.zego_call_usage
  WHERE user_id = _user_id
    AND ended_at IS NULL
    AND status = 'active';

  RETURN jsonb_build_object(
    'allowed', COALESCE(_settings.enabled, false)
      AND _daily_used < COALESCE(_settings.daily_minutes, 0) * 60
      AND _monthly_used < COALESCE(_settings.monthly_minutes, 0) * 60
      AND _active < COALESCE(_settings.max_concurrent_sessions, 0),
    'reason', CASE
      WHEN NOT COALESCE(_settings.enabled, false) THEN 'zego_disabled'
      WHEN _active >= COALESCE(_settings.max_concurrent_sessions, 0) THEN 'concurrent_session_limit'
      WHEN _daily_used >= COALESCE(_settings.daily_minutes, 0) * 60 THEN 'daily_quota_exhausted'
      WHEN _monthly_used >= COALESCE(_settings.monthly_minutes, 0) * 60 THEN 'monthly_quota_exhausted'
      ELSE 'ok'
    END,
    'enabled', COALESCE(_settings.enabled, false),
    'daily_limit_minutes', COALESCE(_settings.daily_minutes, 0),
    'daily_used_minutes', ROUND(_daily_used / 60.0, 2),
    'monthly_limit_minutes', COALESCE(_settings.monthly_minutes, 0),
    'monthly_used_minutes', ROUND(_monthly_used / 60.0, 2),
    'max_concurrent_sessions', COALESCE(_settings.max_concurrent_sessions, 0),
    'active_sessions', _active
  );
END $$;
REVOKE ALL ON FUNCTION public.zego_quota_for_user(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.zego_quota_for_user(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_zego_call_usage(
  _user_id uuid,
  _vendor_id uuid,
  _conversation_id uuid,
  _session_id text,
  _call_type text,
  _started_at timestamptz,
  _ended_at timestamptz DEFAULT NULL,
  _duration_seconds integer DEFAULT 0,
  _status text DEFAULT 'active'
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _id uuid;
BEGIN
  INSERT INTO public.zego_call_usage (
    user_id, vendor_id, conversation_id, session_id, call_type,
    started_at, ended_at, duration_seconds, status
  )
  VALUES (
    _user_id, _vendor_id, _conversation_id, _session_id, _call_type,
    COALESCE(_started_at, now()), COALESCE(_ended_at, NULL), GREATEST(COALESCE(_duration_seconds, 0), 0),
    COALESCE(_status, 'active')
  )
  RETURNING id INTO _id;
  RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.record_zego_call_usage(uuid, uuid, uuid, text, text, timestamptz, timestamptz, integer, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_zego_call_usage(uuid, uuid, uuid, text, text, timestamptz, timestamptz, integer, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.zego_call_usage_overview()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _out jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admins only.';
  END IF;

  SELECT jsonb_build_object(
    'sessions_30d', count(*) FILTER (WHERE created_at >= now() - interval '30 days'),
    'minutes_30d', round(COALESCE(sum(duration_seconds) FILTER (WHERE created_at >= now() - interval '30 days'), 0) / 60.0, 2),
    'active_sessions', count(*) FILTER (WHERE ended_at IS NULL AND status = 'active')
  ) INTO _out FROM public.zego_call_usage;
  RETURN _out;
END $$;
REVOKE ALL ON FUNCTION public.zego_call_usage_overview() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.zego_call_usage_overview() TO authenticated;

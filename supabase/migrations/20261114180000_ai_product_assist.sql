-- AI product assistant: usage log, admin limits, and the check the edge function calls before every AI request.
-- Reuses the existing ai_feature_settings switches (description_generation_enabled for listings, search_enhancement_enabled for search).
-- Run after 20261114150000_ad_boost_payments.sql.

CREATE TABLE IF NOT EXISTS public.ai_assist_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  vendor_daily_limit integer NOT NULL DEFAULT 30 CHECK (vendor_daily_limit BETWEEN 0 AND 1000),
  shopper_daily_limit integer NOT NULL DEFAULT 20 CHECK (shopper_daily_limit BETWEEN 0 AND 1000),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.ai_assist_settings (id) VALUES (true) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.ai_usage_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  vendor_id uuid REFERENCES public.vendors(id) ON DELETE SET NULL,
  feature text NOT NULL CHECK (feature IN ('listing', 'search')),
  status text NOT NULL DEFAULT 'started' CHECK (status IN ('started', 'succeeded', 'failed', 'blocked')),
  model text,
  note text CHECK (note IS NULL OR char_length(note) <= 300),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_usage_user_day ON public.ai_usage_logs (user_id, feature, created_at DESC);

ALTER TABLE public.ai_assist_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage ai assist settings" ON public.ai_assist_settings;
CREATE POLICY "Admins manage ai assist settings" ON public.ai_assist_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Admins read ai usage" ON public.ai_usage_logs;
CREATE POLICY "Admins read ai usage" ON public.ai_usage_logs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
REVOKE ALL ON public.ai_assist_settings, public.ai_usage_logs FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON public.ai_assist_settings TO authenticated;
GRANT SELECT ON public.ai_usage_logs TO authenticated;

-- Called only by the edge function (service role). Returns the log id to finish later, or raises a readable error.
-- Counts a rolling 24 hours. The feature must be switched on by an admin, and the user must be under the daily limit.
CREATE OR REPLACE FUNCTION public.ai_assist_begin(_user uuid, _feature text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _on boolean; _limit integer; _used integer; _vendor uuid; _id uuid;
BEGIN
  IF _feature NOT IN ('listing', 'search') THEN RAISE EXCEPTION 'Unknown feature'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('ai_assist:' || _user::text, 0));
  IF _feature = 'listing' THEN
    SELECT description_generation_enabled INTO _on FROM public.ai_feature_settings LIMIT 1;
    SELECT vendor_daily_limit INTO _limit FROM public.ai_assist_settings WHERE id;
    SELECT id INTO _vendor FROM public.vendors WHERE user_id = _user AND is_approved;
    IF _vendor IS NULL THEN RAISE EXCEPTION 'Only approved suppliers can use the listing assistant.'; END IF;
  ELSE
    SELECT search_enhancement_enabled INTO _on FROM public.ai_feature_settings LIMIT 1;
    SELECT shopper_daily_limit INTO _limit FROM public.ai_assist_settings WHERE id;
  END IF;
  IF NOT coalesce(_on, false) THEN RAISE EXCEPTION 'This AI feature is switched off.'; END IF;
  SELECT count(*) INTO _used FROM public.ai_usage_logs
   WHERE user_id = _user AND feature = _feature AND status <> 'blocked' AND created_at > now() - interval '24 hours';
  IF _used >= coalesce(_limit, 0) THEN RAISE EXCEPTION 'Daily AI limit reached. Try again tomorrow.'; END IF;
  INSERT INTO public.ai_usage_logs (user_id, vendor_id, feature) VALUES (_user, _vendor, _feature) RETURNING id INTO _id;
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.ai_assist_finish(_id uuid, _status text, _model text, _note text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.ai_usage_logs SET status = CASE WHEN _status IN ('succeeded', 'failed', 'blocked') THEN _status ELSE 'failed' END,
    model = left(_model, 80), note = left(_note, 300) WHERE id = _id;
$$;

REVOKE ALL ON FUNCTION public.ai_assist_begin(uuid, text), public.ai_assist_finish(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_assist_begin(uuid, text), public.ai_assist_finish(uuid, text, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_ai_usage_summary(_days integer DEFAULT 30) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admin only'; END IF;
  RETURN jsonb_build_object('by_feature', coalesce((SELECT jsonb_agg(x) FROM (
    SELECT feature, status, count(*) AS n FROM public.ai_usage_logs
     WHERE created_at > now() - make_interval(days => greatest(1, least(_days, 365))) GROUP BY 1, 2 ORDER BY 1, 2) x), '[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.admin_ai_usage_summary(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_ai_usage_summary(integer) TO authenticated, service_role;

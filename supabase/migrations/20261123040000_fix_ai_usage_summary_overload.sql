-- Two functions shared the name admin_ai_usage_summary (one with no inputs, one with _days). Calling it with no
-- inputs then failed with "Could not choose the best candidate function". The screen uses the no-input one.
-- The _days version is the "by feature" summary, so it gets its own name.
DROP FUNCTION IF EXISTS public.admin_ai_usage_summary(integer);

CREATE OR REPLACE FUNCTION public.admin_ai_feature_usage(_days integer DEFAULT 30) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admin only'; END IF;
  RETURN jsonb_build_object('by_feature', coalesce((SELECT jsonb_agg(x) FROM (
    SELECT feature, status, count(*) AS n FROM public.ai_usage_logs
     WHERE created_at > now() - make_interval(days => greatest(1, least(_days, 365))) GROUP BY 1, 2 ORDER BY 1, 2) x), '[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.admin_ai_feature_usage(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_ai_feature_usage(integer) TO authenticated, service_role;

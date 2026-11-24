-- Every failed call is recorded with the time, the caller and the callee, and where and why it failed. Admin reads it.
CREATE TABLE IF NOT EXISTS public.call_failures (
  id bigserial PRIMARY KEY,
  failed_at timestamptz NOT NULL DEFAULT now(),
  call_id uuid,
  caller_id uuid,
  callee_id uuid,
  reported_by uuid,
  side text NOT NULL DEFAULT 'caller' CHECK (side IN ('caller', 'callee')),
  stage text NOT NULL,
  error text,
  device text
);
CREATE INDEX IF NOT EXISTS idx_call_failures_time ON public.call_failures (failed_at DESC);
ALTER TABLE public.call_failures ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read call failures" ON public.call_failures;
CREATE POLICY "Admins read call failures" ON public.call_failures FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.log_call_failure(_call uuid, _peer uuid, _side text, _stage text, _error text, _device text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _me uuid := auth.uid(); _c public.call_logs%ROWTYPE; _caller uuid; _callee uuid;
BEGIN
  IF _me IS NULL THEN RETURN; END IF;
  IF _call IS NOT NULL THEN
    SELECT * INTO _c FROM public.call_logs WHERE id = _call;
    IF FOUND AND (_c.caller_id = _me OR _c.callee_id = _me) THEN _caller := _c.caller_id; _callee := _c.callee_id; END IF;
  END IF;
  IF _caller IS NULL THEN
    IF _side = 'callee' THEN _caller := _peer; _callee := _me; ELSE _caller := _me; _callee := _peer; END IF;
  END IF;
  INSERT INTO public.call_failures (call_id, caller_id, callee_id, reported_by, side, stage, error, device)
  VALUES (_call, _caller, _callee, _me, CASE WHEN _side = 'callee' THEN 'callee' ELSE 'caller' END,
          left(COALESCE(_stage, 'unknown'), 60), left(_error, 500), left(_device, 200));
END $$;
REVOKE ALL ON FUNCTION public.log_call_failure(uuid, uuid, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_call_failure(uuid, uuid, text, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_call_failures(_limit integer DEFAULT 100)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admins only'; END IF;
  RETURN COALESCE((SELECT jsonb_agg(r ORDER BY r.failed_at DESC) FROM (
    SELECT f.id, f.failed_at, f.call_id, f.caller_id, f.callee_id, f.side, f.stage, f.error, f.device,
           COALESCE(cv.store_name, cp.full_name) AS caller_name, COALESCE(ev.store_name, ep.full_name) AS callee_name
    FROM public.call_failures f
    LEFT JOIN public.vendors cv ON cv.user_id = f.caller_id LEFT JOIN public.profiles cp ON cp.user_id = f.caller_id
    LEFT JOIN public.vendors ev ON ev.user_id = f.callee_id LEFT JOIN public.profiles ep ON ep.user_id = f.callee_id
    ORDER BY f.failed_at DESC LIMIT LEAST(GREATEST(COALESCE(_limit, 100), 1), 500)) r), '[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.admin_call_failures(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_call_failures(integer) TO authenticated;

NOTIFY pgrst, 'reload schema';

ALTER TABLE public.email_notification_jobs
  DROP CONSTRAINT IF EXISTS email_notification_jobs_status_check;
ALTER TABLE public.email_notification_jobs
  ADD CONSTRAINT email_notification_jobs_status_check
  CHECK (status IN ('pending', 'sending', 'sent', 'delivery_delayed', 'delivered', 'bounced', 'complained', 'failed'));
CREATE INDEX IF NOT EXISTS idx_email_jobs_resend_id ON public.email_notification_jobs (resend_id) WHERE resend_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.email_notification_events (
  provider_event_id text PRIMARY KEY,
  job_id uuid REFERENCES public.email_notification_jobs(id) ON DELETE SET NULL,
  resend_id text,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_email_events_job ON public.email_notification_events (job_id, received_at DESC);
ALTER TABLE public.email_notification_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read email provider events" ON public.email_notification_events;
CREATE POLICY "Admins read email provider events" ON public.email_notification_events
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
REVOKE ALL ON public.email_notification_events FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.email_notification_events FROM authenticated;
GRANT SELECT ON public.email_notification_events TO authenticated;

CREATE OR REPLACE FUNCTION public.apply_resend_email_event(
  _provider_event_id text,
  _event_type text,
  _resend_id text,
  _job_id uuid,
  _payload jsonb
)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _job public.email_notification_jobs%ROWTYPE;
  _next_status text;
  _inserted text;
BEGIN
  IF _event_type NOT IN ('email.sent', 'email.delivered', 'email.delivery_delayed', 'email.bounced',
                         'email.complained', 'email.failed', 'email.suppressed', 'email.opened', 'email.clicked') THEN
    RETURN 'ignored';
  END IF;
  IF NULLIF(_provider_event_id, '') IS NULL THEN RETURN 'missing_event_id'; END IF;

  SELECT * INTO _job FROM public.email_notification_jobs j
  WHERE (_job_id IS NOT NULL AND j.id = _job_id)
     OR (_resend_id IS NOT NULL AND j.resend_id = _resend_id)
  ORDER BY CASE WHEN j.id = _job_id THEN 0 ELSE 1 END
  LIMIT 1;

  INSERT INTO public.email_notification_events (provider_event_id, job_id, resend_id, event_type, payload)
  VALUES (_provider_event_id, _job.id, _resend_id, _event_type, COALESCE(_payload, '{}'::jsonb))
  ON CONFLICT (provider_event_id) DO NOTHING
  RETURNING provider_event_id INTO _inserted;
  IF _inserted IS NULL THEN RETURN 'duplicate'; END IF;
  IF _job.id IS NULL THEN RETURN 'unmatched'; END IF;

  _next_status := CASE _event_type
    WHEN 'email.sent' THEN 'sent'
    WHEN 'email.delivery_delayed' THEN 'delivery_delayed'
    WHEN 'email.delivered' THEN 'delivered'
    WHEN 'email.bounced' THEN 'bounced'
    WHEN 'email.complained' THEN 'complained'
    WHEN 'email.failed' THEN 'failed'
    WHEN 'email.suppressed' THEN 'failed'
    ELSE NULL END;

  IF _next_status IS NOT NULL THEN
    UPDATE public.email_notification_jobs
    SET status = CASE
          WHEN _next_status = 'complained' THEN 'complained'
          WHEN status = 'complained' THEN status
          WHEN _next_status = 'bounced' AND status = 'delivered' THEN status
          WHEN _next_status = 'bounced' THEN 'bounced'
          WHEN _next_status = 'delivered' AND status = 'bounced' THEN status
          WHEN _next_status = 'delivered' THEN 'delivered'
          WHEN _next_status IN ('sent', 'delivery_delayed', 'failed') AND status IN ('delivered', 'bounced', 'complained') THEN status
          ELSE _next_status END,
        resend_id = COALESCE(_resend_id, resend_id),
        sent_at = CASE WHEN _next_status IN ('sent', 'delivered', 'delivery_delayed', 'bounced', 'complained') THEN COALESCE(sent_at, now()) ELSE sent_at END,
        last_error = CASE WHEN _next_status IN ('bounced', 'complained', 'failed') THEN left(COALESCE(_payload->>'message', _payload->>'reason', _event_type), 2000) ELSE last_error END,
        locked_at = NULL,
        updated_at = now()
    WHERE id = _job.id;
  END IF;
  RETURN COALESCE(_next_status, 'recorded');
END $$;
REVOKE ALL ON FUNCTION public.apply_resend_email_event(text, text, text, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_resend_email_event(text, text, text, uuid, jsonb) TO service_role;
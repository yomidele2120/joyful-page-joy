-- Welcome email for new buyers.
-- When an account is created a welcome email is queued, due 3 minutes later. The delay is deliberate: sellers sign up
-- the same way and only get their seller record a moment afterwards. When the sender picks the job up, a welcome for an
-- account that turned out to be a seller is skipped, so only buyers receive it. Existing accounts get nothing.

CREATE OR REPLACE FUNCTION public.email_welcome_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.email_notification_jobs (event_key, event_type, recipient_user_id, payload, next_attempt_at)
  VALUES ('welcome:' || NEW.user_id::text, 'user.welcome', NEW.user_id, '{}'::jsonb, now() + interval '3 minutes')
  ON CONFLICT (event_key) DO NOTHING;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_email_welcome ON public.profiles;
CREATE TRIGGER trg_email_welcome AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.email_welcome_event();

-- Same claim function as before, with one extra first step: skip welcomes for sellers and admins.
CREATE OR REPLACE FUNCTION public.claim_email_notification_jobs(_limit integer DEFAULT 20)
RETURNS TABLE (
  id uuid, event_key text, event_type text, recipient_user_id uuid, recipient_email text,
  payload jsonb, attempts integer, max_attempts integer
)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.email_notification_jobs j
  SET status = 'failed', last_error = 'Skipped: the buyer welcome email is not sent to sellers or admins', updated_at = now()
  WHERE j.event_type = 'user.welcome' AND j.status = 'pending' AND j.next_attempt_at <= now()
    AND (EXISTS (SELECT 1 FROM public.vendors v WHERE v.user_id = j.recipient_user_id)
         OR EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = j.recipient_user_id AND r.role = 'admin'));

  RETURN QUERY
  WITH candidates AS (
    SELECT j.id
    FROM public.email_notification_jobs j
    WHERE j.attempts < j.max_attempts
      AND ((j.status = 'pending' AND j.next_attempt_at <= now())
        OR (j.status = 'sending' AND j.locked_at < now() - interval '10 minutes'))
    ORDER BY j.next_attempt_at, j.created_at
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(1, LEAST(COALESCE(_limit, 20), 100))
  )
  UPDATE public.email_notification_jobs j
  SET status = 'sending', attempts = j.attempts + 1,
      locked_at = now(), updated_at = now(), last_error = NULL
  FROM candidates c
  WHERE j.id = c.id
  RETURNING j.id, j.event_key, j.event_type, j.recipient_user_id, j.recipient_email,
            j.payload, j.attempts, j.max_attempts;
END $$;
REVOKE ALL ON FUNCTION public.claim_email_notification_jobs(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_email_notification_jobs(integer) TO service_role;

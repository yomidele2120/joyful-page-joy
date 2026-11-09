-- =====================================================================
-- CALL ALERTS WHEN THE SITE IS CLOSED (Web Push)
--   * push_subscriptions       - one row per browser/device that allowed call alerts
--   * save_push_subscription() / remove_push_subscription() - the only ways a member touches that table
--   * call_logs.push_sent_at   - makes sure one call sends one alert
-- Nobody can read or write push_subscriptions directly; only the call-push function (service role) reads it.
-- Safe to run more than once.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh_key text NOT NULL,
  auth_key text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx ON public.push_subscriptions (user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_subscriptions FROM anon, authenticated;

ALTER TABLE public.call_logs ADD COLUMN IF NOT EXISTS push_sent_at timestamptz;

-- Save (or move to this member) the subscription of the browser they are using. A device that was used by someone else
-- before is reassigned to the member who is signed in now. At most 10 devices are kept per member.
CREATE OR REPLACE FUNCTION public.save_push_subscription(_endpoint text, _p256dh text, _auth text, _ua text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _me uuid := auth.uid();
BEGIN
  IF _me IS NULL THEN RAISE EXCEPTION 'Please sign in.'; END IF;
  IF _endpoint IS NULL OR length(_endpoint) < 10 OR length(_endpoint) > 1500
     OR _p256dh IS NULL OR length(_p256dh) > 300 OR _auth IS NULL OR length(_auth) > 100 THEN
    RAISE EXCEPTION 'Invalid subscription.';
  END IF;
  INSERT INTO public.push_subscriptions (user_id, endpoint, p256dh_key, auth_key, user_agent)
  VALUES (_me, _endpoint, _p256dh, _auth, left(_ua, 200))
  ON CONFLICT (endpoint) DO UPDATE
    SET user_id = _me, p256dh_key = EXCLUDED.p256dh_key, auth_key = EXCLUDED.auth_key,
        user_agent = EXCLUDED.user_agent, last_seen_at = now();
  DELETE FROM public.push_subscriptions
   WHERE user_id = _me
     AND id NOT IN (SELECT id FROM public.push_subscriptions WHERE user_id = _me ORDER BY last_seen_at DESC LIMIT 10);
END $$;
REVOKE ALL ON FUNCTION public.save_push_subscription(text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_push_subscription(text, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.remove_push_subscription(_endpoint text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM public.push_subscriptions WHERE endpoint = _endpoint AND user_id = auth.uid();
$$;
REVOKE ALL ON FUNCTION public.remove_push_subscription(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_push_subscription(text) TO authenticated;

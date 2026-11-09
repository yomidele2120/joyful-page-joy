-- =====================================================================
-- VOICE AND VIDEO CALLS (ZEGOCLOUD)
--   * marketplace_settings.calls_enabled - the admin on/off switch (OFF by default)
--   * call_logs                          - who called whom, how it ended, how long
--   * call_peer_check()                  - THE permission rule, used by both the caller and the person being called
--   * start_call() / finish_call()       - the only ways a call row is created or closed (with rate limits)
-- Rules: a call needs an existing chat between the two people, and at least one of them must be a supplier
-- (buyer <-> supplier, supplier <-> supplier). Buyer <-> buyer is never allowed.
-- Safe to run more than once.
-- =====================================================================

ALTER TABLE public.marketplace_settings ADD COLUMN IF NOT EXISTS calls_enabled boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.call_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caller_id uuid NOT NULL,
  callee_id uuid NOT NULL,
  conversation_id uuid,
  call_type text NOT NULL CHECK (call_type IN ('voice','video')),
  status text NOT NULL DEFAULT 'ringing' CHECK (status IN ('ringing','answered','ended','declined','missed','cancelled','busy','failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  answered_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer
);
CREATE INDEX IF NOT EXISTS call_logs_caller_idx ON public.call_logs (caller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS call_logs_callee_idx ON public.call_logs (callee_id, created_at DESC);

ALTER TABLE public.call_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Participants and admins read call logs" ON public.call_logs;
CREATE POLICY "Participants and admins read call logs" ON public.call_logs FOR SELECT TO authenticated
  USING (auth.uid() = caller_id OR auth.uid() = callee_id OR public.has_role(auth.uid(), 'admin'));
-- No insert / update / delete policies on purpose: rows are written only by the functions below.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.call_logs FROM anon, authenticated;
REVOKE ALL ON public.call_logs FROM anon;

-- ---------------------------------------------------------------------
-- The permission rule. Returns { allowed, reason, conversation_id, name, peer_is_vendor }.
-- ---------------------------------------------------------------------
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
REVOKE ALL ON FUNCTION public.call_peer_check(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.call_peer_check(uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- Start a call: checks the rule, limits abuse, records a "ringing" row and returns its id.
-- ---------------------------------------------------------------------
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
      WHEN 'no_conversation' THEN 'Send a message first, then you can call.'
      WHEN 'buyers_cannot_call_buyers' THEN 'Calls are only between buyers and suppliers, or between suppliers.'
      WHEN 'not_signed_in' THEN 'Please sign in to call.'
      ELSE 'This call is not allowed.' END;
  END IF;

  IF (SELECT count(*) FROM public.call_logs WHERE caller_id = _me AND created_at > now() - interval '1 hour') >= 20 THEN
    RAISE EXCEPTION 'You have made a lot of calls recently. Please try again a little later.';
  END IF;
  IF (SELECT count(*) FROM public.call_logs WHERE caller_id = _me AND callee_id = _peer
        AND created_at > now() - interval '10 minutes' AND answered_at IS NULL) >= 3 THEN
    RAISE EXCEPTION 'They have not picked up. Send a message and try again later.';
  END IF;

  INSERT INTO public.call_logs (caller_id, callee_id, conversation_id, call_type)
  VALUES (_me, _peer, (_check->>'conversation_id')::uuid, _type)
  RETURNING id INTO _id;
  RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.start_call(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_call(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------
-- Close or update a call. Either person in the call may report; terminal states are never overwritten.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finish_call(_call uuid, _outcome text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _me uuid := auth.uid();
  _c public.call_logs%ROWTYPE;
BEGIN
  IF _outcome NOT IN ('answered','ended','declined','missed','cancelled','busy','failed') THEN RAISE EXCEPTION 'Unknown outcome'; END IF;
  SELECT * INTO _c FROM public.call_logs WHERE id = _call FOR UPDATE;
  IF NOT FOUND OR _me NOT IN (_c.caller_id, _c.callee_id) THEN RAISE EXCEPTION 'Call not found'; END IF;
  IF _c.ended_at IS NOT NULL THEN RETURN; END IF;

  IF _outcome = 'answered' THEN
    UPDATE public.call_logs SET status = 'answered', answered_at = COALESCE(answered_at, now()) WHERE id = _call;
  ELSIF _c.answered_at IS NOT NULL THEN
    -- it was connected, so however it ended it counts as a completed call
    UPDATE public.call_logs SET status = 'ended', ended_at = now(),
      duration_seconds = GREATEST(0, round(extract(epoch FROM (now() - _c.answered_at)))::int) WHERE id = _call;
  ELSE
    UPDATE public.call_logs SET status = CASE WHEN _outcome = 'ended' THEN 'missed' ELSE _outcome END, ended_at = now() WHERE id = _call;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.finish_call(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finish_call(uuid, text) TO authenticated;

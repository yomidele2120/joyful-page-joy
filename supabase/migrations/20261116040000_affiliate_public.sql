-- =====================================================================
-- PHASE 6: public affiliate page data + affiliate applications.
-- Run after 20261116030000_referral_wallet.sql. Safe to run twice.
-- * referral_public_info(): the facts the public /affiliate page may show. The standard rate is hidden unless an admin turns it on.
-- * affiliate applications: a signed-in user applies; an admin approves (which creates the affiliate account) or rejects.
-- Nothing here changes how commissions are calculated or paid.
-- =====================================================================

ALTER TABLE public.referral_settings ADD COLUMN IF NOT EXISTS show_rate_publicly boolean NOT NULL DEFAULT false;
ALTER TABLE public.referral_settings ADD COLUMN IF NOT EXISTS applications_open boolean NOT NULL DEFAULT true;

-- ---------- what the public page may show ----------
CREATE OR REPLACE FUNCTION public.referral_public_info() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'programme_enabled', s.programme_enabled,
    'applications_open', s.applications_open AND s.programme_enabled,
    'hold_days', s.hold_days,
    'min_withdrawal_kobo', s.min_withdrawal_kobo,
    'withdrawal_fee_kobo', s.withdrawal_fee_kobo,
    'terms_note', s.terms_note,
    'rate_percent', CASE WHEN s.show_rate_publicly THEN (SELECT a.rate_percent FROM public.referral_agreements a WHERE a.is_default LIMIT 1) ELSE NULL END
  )
  FROM public.referral_settings s WHERE s.id;
$$;
REVOKE ALL ON FUNCTION public.referral_public_info() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.referral_public_info() TO anon, authenticated;

-- ---------- admin: the two public switches ----------
CREATE OR REPLACE FUNCTION public.admin_set_referral_public_options(_show_rate boolean, _applications_open boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.referral_require_admin();
  UPDATE public.referral_settings SET show_rate_publicly = COALESCE(_show_rate, false), applications_open = COALESCE(_applications_open, true), updated_at = now(), updated_by = auth.uid() WHERE id;
  PERFORM public.referral_log('settings.public_options', 'settings', 'referral', jsonb_build_object('show_rate', _show_rate, 'applications_open', _applications_open));
END $$;
REVOKE ALL ON FUNCTION public.admin_set_referral_public_options(boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_referral_public_options(boolean, boolean) TO authenticated;

-- ---------- applications ----------
CREATE TABLE IF NOT EXISTS public.referral_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text NOT NULL CHECK (char_length(full_name) BETWEEN 2 AND 80),
  phone text CHECK (phone IS NULL OR char_length(phone) <= 30),
  platform text NOT NULL CHECK (char_length(platform) BETWEEN 2 AND 60),
  profile_url text NOT NULL CHECK (char_length(profile_url) BETWEEN 3 AND 300),
  audience_size text CHECK (audience_size IS NULL OR char_length(audience_size) <= 40),
  message text CHECK (message IS NULL OR char_length(message) <= 1000),
  requested_code text CHECK (requested_code IS NULL OR requested_code ~ '^[A-Z0-9_-]{4,32}$'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  review_note text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- one open application per person
CREATE UNIQUE INDEX IF NOT EXISTS uq_referral_application_pending ON public.referral_applications (user_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_referral_applications_status ON public.referral_applications (status, created_at DESC);

ALTER TABLE public.referral_applications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Own or admin applications" ON public.referral_applications;
CREATE POLICY "Own or admin applications" ON public.referral_applications FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
REVOKE ALL ON public.referral_applications FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.referral_applications TO authenticated;

-- apply (signed-in users only; one pending application at a time; rejected applicants may apply again after 30 days)
CREATE OR REPLACE FUNCTION public.submit_affiliate_application(
  _full_name text, _phone text, _platform text, _profile_url text, _audience_size text, _message text, _requested_code text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _email text; _s public.referral_settings%ROWTYPE; _code text; _id uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Sign in to apply'; END IF;
  SELECT * INTO _s FROM public.referral_settings WHERE id;
  IF NOT _s.programme_enabled OR NOT _s.applications_open THEN RAISE EXCEPTION 'Applications are closed right now'; END IF;
  IF EXISTS (SELECT 1 FROM public.referral_profiles WHERE user_id = _uid AND kind = 'affiliate') THEN RAISE EXCEPTION 'You already have an affiliate account'; END IF;
  IF EXISTS (SELECT 1 FROM public.referral_applications WHERE user_id = _uid AND status = 'pending') THEN RAISE EXCEPTION 'You already have an application waiting for review'; END IF;
  IF EXISTS (SELECT 1 FROM public.referral_applications WHERE user_id = _uid AND status = 'rejected' AND reviewed_at > now() - interval '30 days') THEN
    RAISE EXCEPTION 'Your last application was not approved. You can apply again 30 days after it was reviewed';
  END IF;
  SELECT email INTO _email FROM auth.users WHERE id = _uid;
  _code := NULLIF(upper(btrim(COALESCE(_requested_code, ''))), '');
  IF _code IS NOT NULL AND _code !~ '^[A-Z0-9_-]{4,32}$' THEN RAISE EXCEPTION 'Code must be 4 to 32 letters, numbers, - or _'; END IF;
  INSERT INTO public.referral_applications (user_id, email, full_name, phone, platform, profile_url, audience_size, message, requested_code)
  VALUES (_uid, COALESCE(_email, ''), btrim(_full_name), NULLIF(btrim(COALESCE(_phone, '')), ''), btrim(_platform), btrim(_profile_url),
          NULLIF(btrim(COALESCE(_audience_size, '')), ''), NULLIF(btrim(COALESCE(_message, '')), ''), _code)
  RETURNING id INTO _id;
  PERFORM public.referral_log('application.submitted', 'application', _id::text, '{}'::jsonb);
  RETURN jsonb_build_object('ok', true, 'id', _id);
END $$;
REVOKE ALL ON FUNCTION public.submit_affiliate_application(text, text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_affiliate_application(text, text, text, text, text, text, text) TO authenticated;

-- the applicant's latest application (status only; the admin's private note is not returned)
CREATE OR REPLACE FUNCTION public.my_affiliate_application() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('id', a.id, 'status', a.status, 'created_at', a.created_at, 'reviewed_at', a.reviewed_at,
    'is_affiliate', EXISTS (SELECT 1 FROM public.referral_profiles p WHERE p.user_id = auth.uid() AND p.kind = 'affiliate'))
  FROM public.referral_applications a WHERE a.user_id = auth.uid() ORDER BY a.created_at DESC LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.my_affiliate_application() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_affiliate_application() TO authenticated;

-- admin: list
CREATE OR REPLACE FUNCTION public.admin_affiliate_applications(_status text DEFAULT NULL) RETURNS SETOF public.referral_applications
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.referral_require_admin();
  RETURN QUERY SELECT * FROM public.referral_applications WHERE _status IS NULL OR status = _status ORDER BY (status = 'pending') DESC, created_at DESC LIMIT 200;
END $$;
REVOKE ALL ON FUNCTION public.admin_affiliate_applications(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_affiliate_applications(text) TO authenticated;

-- admin: approve (creates or upgrades the affiliate account with the rate you choose) or reject
CREATE OR REPLACE FUNCTION public.admin_review_affiliate_application(_id uuid, _decision text, _rate numeric, _code text, _note text, _public_page boolean DEFAULT true) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _a public.referral_applications%ROWTYPE; _use_code text; _use_rate numeric; _res jsonb;
BEGIN
  PERFORM public.referral_require_admin();
  IF _decision NOT IN ('approved', 'rejected') THEN RAISE EXCEPTION 'Choose approved or rejected'; END IF;
  SELECT * INTO _a FROM public.referral_applications WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Application not found'; END IF;
  IF _a.status <> 'pending' THEN RAISE EXCEPTION 'This application was already reviewed'; END IF;
  IF _decision = 'approved' THEN
    _use_code := upper(btrim(COALESCE(NULLIF(btrim(COALESCE(_code, '')), ''), _a.requested_code, '')));
    IF _use_code = '' THEN RAISE EXCEPTION 'Choose a referral code for this affiliate'; END IF;
    SELECT COALESCE(_rate, rate_percent) INTO _use_rate FROM public.referral_agreements WHERE is_default LIMIT 1;
    _use_rate := COALESCE(_rate, _use_rate);
    IF EXISTS (SELECT 1 FROM public.referral_profiles WHERE code = _use_code AND user_id <> _a.user_id) THEN RAISE EXCEPTION 'That code is already taken'; END IF;
    _res := public.admin_create_affiliate(_a.email, _use_code, _a.full_name, _use_rate, NULL, COALESCE(_public_page, true));   -- the applicant's message is private; the public bio is written by the admin afterwards
  END IF;
  UPDATE public.referral_applications SET status = _decision, review_note = NULLIF(btrim(COALESCE(_note, '')), ''), reviewed_by = auth.uid(), reviewed_at = now() WHERE id = _id;
  PERFORM public.referral_log('application.' || _decision, 'application', _id::text, jsonb_build_object('code', _use_code, 'rate', _use_rate));
  RETURN jsonb_build_object('ok', true, 'status', _decision, 'affiliate', _res);
END $$;
REVOKE ALL ON FUNCTION public.admin_review_affiliate_application(uuid, text, numeric, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_review_affiliate_application(uuid, text, numeric, text, text, boolean) TO authenticated;

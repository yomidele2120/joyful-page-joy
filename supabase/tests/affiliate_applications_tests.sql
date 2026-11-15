-- Affiliate application tests. RUN ONLY ON STAGING. Runs in one transaction and ends with ROLLBACK.
-- Needs the migrations up to 20261116040000_affiliate_public.sql. Any failed check raises an exception naming the test.
-- Written without being run against a database. A failure may be test setup (extra NOT NULL columns on auth.users) rather than a bug.
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.as_user(_uid uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', _uid::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _uid, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END $$;
CREATE OR REPLACE FUNCTION pg_temp.as_admin() RETURNS void LANGUAGE plpgsql AS $$ BEGIN EXECUTE 'RESET ROLE'; END $$;
GRANT EXECUTE ON FUNCTION pg_temp.as_user(uuid), pg_temp.as_admin() TO PUBLIC;

DO $$
DECLARE
  u_adm uuid := gen_random_uuid(); u_a uuid := gen_random_uuid(); u_b uuid := gen_random_uuid();
  _r jsonb; _id uuid; _failed boolean; _n int; _info jsonb;
BEGIN
  INSERT INTO auth.users (id, email) VALUES (u_adm, 'adm@test.local'), (u_a, 'infl@test.local'), (u_b, 'other@test.local');
  INSERT INTO public.user_roles (user_id, role) VALUES (u_adm, 'admin');
  UPDATE public.referral_settings SET programme_enabled = true, applications_open = true, show_rate_publicly = false;
  UPDATE public.referral_agreements SET rate_percent = 13 WHERE is_default;

  -- A1 public info: works for anyone, hides the rate by default, shows it after the admin switches it on
  PERFORM pg_temp.as_user(u_b);
  _info := public.referral_public_info();
  PERFORM pg_temp.as_admin();
  IF _info->>'rate_percent' IS NOT NULL THEN RAISE EXCEPTION 'A1 rate shown while hidden: %', _info; END IF;
  IF (_info->>'hold_days')::int IS NULL THEN RAISE EXCEPTION 'A1 hold days missing'; END IF;
  PERFORM pg_temp.as_user(u_adm);
  PERFORM public.admin_set_referral_public_options(true, true);
  PERFORM pg_temp.as_admin();
  IF (public.referral_public_info()->>'rate_percent')::numeric <> 13 THEN RAISE EXCEPTION 'A1 rate not shown after switch on'; END IF;
  PERFORM pg_temp.as_user(u_a);
  _failed := false;
  BEGIN PERFORM public.admin_set_referral_public_options(false, false); EXCEPTION WHEN OTHERS THEN _failed := true; END;
  PERFORM pg_temp.as_admin();
  IF NOT _failed THEN RAISE EXCEPTION 'A1 non-admin changed public options'; END IF;

  -- A2 apply: signed-in only; one pending at a time
  PERFORM pg_temp.as_user(u_a);
  _r := public.submit_affiliate_application('Test Influencer', '08000000000', 'Instagram', 'https://instagram.com/test', '20k', 'hello', 'TESTINFL');
  IF NOT (_r->>'ok')::boolean THEN RAISE EXCEPTION 'A2 apply failed: %', _r; END IF;
  _id := (_r->>'id')::uuid;
  _failed := false;
  BEGIN PERFORM public.submit_affiliate_application('Test Influencer', NULL, 'Instagram', 'https://instagram.com/test', NULL, NULL, NULL); EXCEPTION WHEN OTHERS THEN _failed := true; END;
  IF NOT _failed THEN RAISE EXCEPTION 'A2 a second pending application was allowed'; END IF;
  IF (public.my_affiliate_application()->>'status') <> 'pending' THEN RAISE EXCEPTION 'A2 status not pending'; END IF;
  -- other users cannot read it
  PERFORM pg_temp.as_user(u_b);
  SELECT count(*) INTO _n FROM public.referral_applications;
  PERFORM pg_temp.as_admin();
  IF _n <> 0 THEN RAISE EXCEPTION 'A2 another user can read applications (%)', _n; END IF;

  -- A3 non-admin cannot list or review
  PERFORM pg_temp.as_user(u_a);
  _failed := false;
  BEGIN PERFORM public.admin_review_affiliate_application(_id, 'approved', 25, 'TESTINFL', 'self approve', true); EXCEPTION WHEN OTHERS THEN _failed := true; END;
  IF NOT _failed THEN RAISE EXCEPTION 'A3 applicant approved their own application'; END IF;
  _failed := false;
  BEGIN PERFORM * FROM public.admin_affiliate_applications(NULL); EXCEPTION WHEN OTHERS THEN _failed := true; END;
  PERFORM pg_temp.as_admin();
  IF NOT _failed THEN RAISE EXCEPTION 'A3 non-admin listed applications'; END IF;

  -- A4 admin approves with a special rate: affiliate account created with that rate; public page works
  PERFORM pg_temp.as_user(u_adm);
  _r := public.admin_review_affiliate_application(_id, 'approved', 25, NULL, 'welcome', true);
  PERFORM pg_temp.as_admin();
  IF (SELECT status FROM public.referral_applications WHERE id = _id) <> 'approved' THEN RAISE EXCEPTION 'A4 not approved'; END IF;
  IF (SELECT kind FROM public.referral_profiles WHERE user_id = u_a) <> 'affiliate' THEN RAISE EXCEPTION 'A4 affiliate profile not created'; END IF;
  IF (SELECT code FROM public.referral_profiles WHERE user_id = u_a) <> 'TESTINFL' THEN RAISE EXCEPTION 'A4 requested code not used'; END IF;
  IF (SELECT a.rate_percent FROM public.referral_profiles p JOIN public.referral_agreements a ON a.id = p.agreement_id WHERE p.user_id = u_a) <> 25 THEN RAISE EXCEPTION 'A4 special rate not applied'; END IF;
  IF public.referral_public_profile('TESTINFL') IS NULL THEN RAISE EXCEPTION 'A4 public profile missing'; END IF;
  IF (public.referral_public_info()->>'rate_percent')::numeric <> 13 THEN RAISE EXCEPTION 'A4 default rate changed by affiliate approval'; END IF;
  -- already reviewed cannot be reviewed again
  PERFORM pg_temp.as_user(u_adm);
  _failed := false;
  BEGIN PERFORM public.admin_review_affiliate_application(_id, 'rejected', NULL, NULL, 'again', false); EXCEPTION WHEN OTHERS THEN _failed := true; END;
  PERFORM pg_temp.as_admin();
  IF NOT _failed THEN RAISE EXCEPTION 'A4 reviewed twice'; END IF;

  -- A5 an existing affiliate cannot apply again; closed applications are refused; rejection blocks re-apply for 30 days
  PERFORM pg_temp.as_user(u_a);
  _failed := false;
  BEGIN PERFORM public.submit_affiliate_application('Test Influencer', NULL, 'Instagram', 'https://instagram.com/test', NULL, NULL, NULL); EXCEPTION WHEN OTHERS THEN _failed := true; END;
  PERFORM pg_temp.as_admin();
  IF NOT _failed THEN RAISE EXCEPTION 'A5 an affiliate could apply again'; END IF;
  PERFORM pg_temp.as_user(u_adm);
  PERFORM public.admin_set_referral_public_options(false, false);
  PERFORM pg_temp.as_user(u_b);
  _failed := false;
  BEGIN PERFORM public.submit_affiliate_application('Other Person', NULL, 'Blog', 'https://example.com', NULL, NULL, NULL); EXCEPTION WHEN OTHERS THEN _failed := true; END;
  PERFORM pg_temp.as_admin();
  IF NOT _failed THEN RAISE EXCEPTION 'A5 applied while applications were closed'; END IF;
  PERFORM pg_temp.as_user(u_adm);
  PERFORM public.admin_set_referral_public_options(false, true);
  PERFORM pg_temp.as_user(u_b);
  _r := public.submit_affiliate_application('Other Person', NULL, 'Blog', 'https://example.com', NULL, NULL, NULL);
  PERFORM pg_temp.as_user(u_adm);
  PERFORM public.admin_review_affiliate_application((_r->>'id')::uuid, 'rejected', NULL, NULL, 'not a fit', false);
  PERFORM pg_temp.as_user(u_b);
  _failed := false;
  BEGIN PERFORM public.submit_affiliate_application('Other Person', NULL, 'Blog', 'https://example.com', NULL, NULL, NULL); EXCEPTION WHEN OTHERS THEN _failed := true; END;
  PERFORM pg_temp.as_admin();
  IF NOT _failed THEN RAISE EXCEPTION 'A5 re-applied right after a rejection'; END IF;

  RAISE NOTICE 'ALL AFFILIATE APPLICATION TESTS PASSED';
END $$;
ROLLBACK;

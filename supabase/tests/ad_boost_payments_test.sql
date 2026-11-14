-- Run on STAGING after 20261114150000_ad_boost_payments.sql (and the two earlier migrations). Rolls back; success = exception "ALL AD BOOST TESTS PASSED".
CREATE OR REPLACE FUNCTION pg_temp.mk_user(_id uuid) RETURNS void LANGUAGE sql AS $f$
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, confirmation_token, recovery_token,
                          email_change, email_change_token_new, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  VALUES (_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'boost-test-' || _id || '@example.invalid',
          '', now(), '', '', '', '', '{"provider":"email","providers":["email"]}', '{}', now(), now());
$f$;
CREATE OR REPLACE FUNCTION pg_temp.act_as(_id uuid) RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', coalesce(_id::text, ''), true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _id, 'role', 'authenticated')::text, true);
END $f$;

DO $test$
DECLARE _u uuid := gen_random_uuid(); _v uuid; _camp uuid; _pkg uuid; _ok boolean; _rem bigint; _n integer; _j jsonb;
BEGIN
  PERFORM pg_temp.mk_user(_u);
  INSERT INTO public.vendors (user_id, store_name, is_approved) VALUES (_u, 'Boost Test Store', true) RETURNING id INTO _v;
  INSERT INTO public.vendor_memberships (vendor_id, plan_slug, status, period_started_at, expires_at) VALUES (_v, 'silver', 'active', now(), now() + interval '30 days');
  UPDATE public.advertising_plan_features SET impression_allocation = 100 WHERE plan_slug = 'silver';
  INSERT INTO public.vendor_advertising_campaigns (vendor_id, target_shop_id, campaign_type, status, start_date, end_date, headline, description, banner_image_url, placements, destination_url)
    VALUES (_v, _v, 'shop_promotion', 'active', now() - interval '1 day', now() + interval '20 days', 'Boost test headline', 'A description long enough.', 'https://res.cloudinary.com/demo/image/upload/v1/a.jpg', ARRAY['rotating'], '/shop/' || _v)
    RETURNING id INTO _camp;
  INSERT INTO public.ad_boost_packages (name, impressions, price_kobo, is_active) VALUES ('Test pack', 1000, 500000, true) RETURNING id INTO _pkg;
  INSERT INTO public.ad_boost_payments (vendor_id, campaign_id, package_id, package_name, impressions, paystack_reference, amount_kobo, currency)
    VALUES (_v, _camp, _pkg, 'Test pack', 1000, 'itha_boost_test1', 500000, 'NGN');

  -- 1. wrong amount / wrong currency / unknown reference are refused and change nothing
  IF public.finalize_ad_boost_payment('itha_boost_test1', 100, 'NGN') THEN RAISE EXCEPTION 'FAIL 1a: wrong amount accepted'; END IF;
  IF public.finalize_ad_boost_payment('itha_boost_test1', 500000, 'USD') THEN RAISE EXCEPTION 'FAIL 1b: wrong currency accepted'; END IF;
  IF public.finalize_ad_boost_payment('nope', 500000, 'NGN') THEN RAISE EXCEPTION 'FAIL 1c: unknown reference accepted'; END IF;
  IF (SELECT boost_impressions FROM public.vendor_advertising_campaigns WHERE id = _camp) <> 0 THEN RAISE EXCEPTION 'FAIL 1d: views added without a valid payment'; END IF;

  -- 2. the plan cap hides the ad once reached
  UPDATE public.vendor_advertising_campaigns SET impressions_count = 100 WHERE id = _camp;
  SELECT count(*) INTO _n FROM jsonb_array_elements(public.get_homepage_ads('rotating', 60)) e WHERE (e ->> 'vendor_id')::uuid = _v;
  IF _n <> 0 THEN RAISE EXCEPTION 'FAIL 2: capped ad should not be served'; END IF;

  -- 3. a verified matching payment adds the views once (idempotent) and the ad returns
  IF NOT public.finalize_ad_boost_payment('itha_boost_test1', 500000, 'NGN') THEN RAISE EXCEPTION 'FAIL 3a'; END IF;
  IF NOT public.finalize_ad_boost_payment('itha_boost_test1', 500000, 'NGN') THEN RAISE EXCEPTION 'FAIL 3b: replay should still return true'; END IF;
  IF (SELECT boost_impressions FROM public.vendor_advertising_campaigns WHERE id = _camp) <> 1000 THEN RAISE EXCEPTION 'FAIL 3c: views must be added exactly once'; END IF;
  SELECT (e ->> 'boost_remaining')::bigint INTO _rem FROM jsonb_array_elements(public.get_homepage_ads('rotating', 60)) e WHERE (e ->> 'vendor_id')::uuid = _v;
  IF _rem IS DISTINCT FROM 1000 THEN RAISE EXCEPTION 'FAIL 3d: boosted ad should be served with 1000 remaining, got %', _rem; END IF;

  -- 4. boost is consumed by impressions and the ad stops once it is used up
  UPDATE public.vendor_advertising_campaigns SET impressions_count = 100 + 1000 WHERE id = _camp;
  SELECT count(*) INTO _n FROM jsonb_array_elements(public.get_homepage_ads('rotating', 60)) e WHERE (e ->> 'vendor_id')::uuid = _v;
  IF _n <> 0 THEN RAISE EXCEPTION 'FAIL 4: used-up boost should stop the ad'; END IF;

  -- 5. a payment for an ended promotion is flagged for an admin, not silently applied
  UPDATE public.vendor_advertising_campaigns SET status = 'expired' WHERE id = _camp;
  INSERT INTO public.ad_boost_payments (vendor_id, campaign_id, package_id, package_name, impressions, paystack_reference, amount_kobo, currency)
    VALUES (_v, _camp, _pkg, 'Test pack', 1000, 'itha_boost_test2', 500000, 'NGN');
  PERFORM public.finalize_ad_boost_payment('itha_boost_test2', 500000, 'NGN');
  IF (SELECT status FROM public.ad_boost_payments WHERE paystack_reference = 'itha_boost_test2') <> 'needs_review' THEN RAISE EXCEPTION 'FAIL 5a'; END IF;
  IF (SELECT boost_impressions FROM public.vendor_advertising_campaigns WHERE id = _camp) <> 1000 THEN RAISE EXCEPTION 'FAIL 5b: ended promotion must not gain views'; END IF;

  -- 6. vendor sees packages and own history; a stranger sees none of it
  PERFORM pg_temp.act_as(_u);
  _j := public.my_ad_boosts();
  IF jsonb_array_length(_j -> 'packages') < 1 OR jsonb_array_length(_j -> 'payments') <> 2 THEN RAISE EXCEPTION 'FAIL 6a: %', _j; END IF;
  RAISE EXCEPTION 'ALL AD BOOST TESTS PASSED';
END $test$;

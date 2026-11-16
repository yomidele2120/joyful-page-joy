-- Run after 20261114090000_vendor_advertising.sql, against a Supabase/Postgres database (psql or the SQL editor
-- of a STAGING project, never production). Everything is rolled back: a passing run ends with the exception
-- "ALL VENDOR ADVERTISING TESTS PASSED"; any other message is a failure.
--
-- Not covered here (they need the running edge functions / real providers): the Gemini call, the Cloudinary upload,
-- the Paystack API and browser rendering. See VENDOR_ADVERTISING_SETUP.md for those manual checks.

CREATE OR REPLACE FUNCTION pg_temp.mk_user(_id uuid) RETURNS void LANGUAGE sql AS $f$
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, confirmation_token,
                          recovery_token, email_change, email_change_token_new, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  VALUES (_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ad-test-' || _id || '@example.invalid',
          '', now(), '', '', '', '', '{"provider":"email","providers":["email"]}', '{}', now(), now());
$f$;

CREATE OR REPLACE FUNCTION pg_temp.act_as(_id uuid) RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', coalesce(_id::text, ''), true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _id, 'role', 'authenticated')::text, true);
END $f$;

CREATE OR REPLACE FUNCTION pg_temp.ads_for(_placement text, _vendor uuid) RETURNS integer LANGUAGE sql AS $f$
  SELECT count(*)::integer FROM jsonb_array_elements(public.get_homepage_ads(_placement, 60)) e WHERE (e ->> 'vendor_id')::uuid = _vendor;
$f$;

DO $test$
DECLARE
  _ua uuid := gen_random_uuid(); _ub uuid := gen_random_uuid(); _uadmin uuid := gen_random_uuid();
  _va uuid; _vb uuid; _camp uuid; _camp2 uuid; _job jsonb; _banner uuid; _n integer; _msg text; _ok boolean;
  _p1 uuid; _p2 uuid; _p3 uuid; _pb uuid; _ent jsonb; _res jsonb; _new_camp uuid; _img text;
BEGIN
  PERFORM pg_temp.mk_user(_ua); PERFORM pg_temp.mk_user(_ub); PERFORM pg_temp.mk_user(_uadmin);
  INSERT INTO public.user_roles (user_id, role) VALUES (_uadmin, 'admin');
  INSERT INTO public.vendors (user_id, store_name, is_approved) VALUES (_ua, 'TechWorld Nigeria', true) RETURNING id INTO _va;
  INSERT INTO public.vendors (user_id, store_name, is_approved) VALUES (_ub, 'Other Vendor Store', true) RETURNING id INTO _vb;
  INSERT INTO public.vendor_memberships (vendor_id, plan_slug, status) VALUES (_va, 'free', 'active'), (_vb, 'free', 'active');
  INSERT INTO public.products (name, slug, price, stock_quantity, vendor_id) VALUES ('Ad test 1', 'adt-1-' || _va, 1000, 5, _va) RETURNING id INTO _p1;
  INSERT INTO public.products (name, slug, price, stock_quantity, vendor_id) VALUES ('Ad test 2', 'adt-2-' || _va, 1000, 5, _va) RETURNING id INTO _p2;
  INSERT INTO public.products (name, slug, price, stock_quantity, vendor_id) VALUES ('Ad test 3', 'adt-3-' || _va, 1000, 5, _va) RETURNING id INTO _p3;
  INSERT INTO public.products (name, slug, price, stock_quantity, vendor_id) VALUES ('Other vendor product', 'adt-b-' || _vb, 1000, 5, _vb) RETURNING id INTO _pb;
  UPDATE public.advertising_settings SET require_approval = true, regen_cooldown_minutes = 0, ai_daily_limit = 1000, ai_monthly_budget_usd = 1000;
  UPDATE public.advertising_generation_jobs SET status = 'cancelled' WHERE status IN ('queued', 'running');   -- so the worker tests only see their own jobs (rolled back)

  -- 1. A free plan gets no campaign ----------------------------------------------------------------
  SELECT count(*) INTO _n FROM public.vendor_advertising_campaigns WHERE vendor_id = _va;
  IF _n <> 0 THEN RAISE EXCEPTION 'FAIL 1: a free vendor must not get a campaign'; END IF;

  -- 2. A verified payment creates exactly one campaign + one job ------------------------------------
  INSERT INTO public.supplier_membership_payments (vendor_id, plan_slug, paystack_reference, amount_kobo, currency, period_days, status)
  VALUES (_va, 'silver', 'adtest-ref-' || _va, 500000, 'NGN', 30, 'pending');
  IF NOT public.finalize_supplier_membership_payment('adtest-ref-' || _va, 500000, 'NGN') THEN
    RAISE EXCEPTION 'FAIL 2a: finalize should accept the matching payment'; END IF;
  SELECT id INTO _camp FROM public.vendor_advertising_campaigns WHERE vendor_id = _va;
  IF _camp IS NULL THEN RAISE EXCEPTION 'FAIL 2b: payment did not create a campaign'; END IF;
  IF (SELECT status FROM public.vendor_advertising_campaigns WHERE id = _camp) <> 'pending_generation' THEN RAISE EXCEPTION 'FAIL 2c: campaign should wait for its banner'; END IF;
  IF (SELECT destination_url FROM public.vendor_advertising_campaigns WHERE id = _camp) <> '/shop/' || _va THEN RAISE EXCEPTION 'FAIL 2d: destination must be the vendor''s own shop'; END IF;
  IF (SELECT end_date FROM public.vendor_advertising_campaigns WHERE id = _camp) > (SELECT expires_at FROM public.vendor_memberships WHERE vendor_id = _va) THEN
    RAISE EXCEPTION 'FAIL 2e: campaign must not outlive the subscription'; END IF;
  SELECT count(*) INTO _n FROM public.advertising_generation_jobs WHERE campaign_id = _camp AND status = 'queued';
  IF _n <> 1 THEN RAISE EXCEPTION 'FAIL 2f: expected one queued job, got %', _n; END IF;

  -- 3. Replaying the same payment changes nothing ---------------------------------------------------
  PERFORM public.finalize_supplier_membership_payment('adtest-ref-' || _va, 500000, 'NGN');
  SELECT count(*) INTO _n FROM public.vendor_advertising_campaigns WHERE vendor_id = _va;
  IF _n <> 1 THEN RAISE EXCEPTION 'FAIL 3a: replay created a second campaign'; END IF;
  SELECT count(*) INTO _n FROM public.advertising_generation_jobs WHERE campaign_id = _camp;
  IF _n <> 1 THEN RAISE EXCEPTION 'FAIL 3b: replay created a second job'; END IF;

  -- 4. Worker success with approval required -> pending_review, nothing public ---------------------
  _job := public.claim_advertising_job('test');
  IF _job IS NULL THEN RAISE EXCEPTION 'FAIL 4a: worker could not claim the job'; END IF;
  IF public.claim_advertising_job('test') IS NOT NULL THEN RAISE EXCEPTION 'FAIL 4b: a running job must not be claimed twice'; END IF;
  _banner := public.finish_advertising_job_success((_job ->> 'id')::uuid, 'https://res.cloudinary.com/demo/image/upload/ad-test.jpg',
      'ad-test', 1600, 500, 'Discover Premium Electronics', 'Explore quality devices from a trusted marketplace shop.', 'electronics',
      'gemini', 'test-model', 'abc123', '{}'::jsonb, 0.04, '{}');
  IF (SELECT status FROM public.vendor_advertising_campaigns WHERE id = _camp) <> 'pending_review' THEN RAISE EXCEPTION 'FAIL 4c: should be pending_review'; END IF;
  IF pg_temp.ads_for('rotating', _va) <> 0 THEN RAISE EXCEPTION 'FAIL 4d: unapproved banner must not be public'; END IF;

  -- 5. Admin approves -> live on the homepage ------------------------------------------------------
  PERFORM pg_temp.act_as(_ua);
  _ok := false;
  BEGIN PERFORM public.admin_review_banner(_banner, true, NULL); EXCEPTION WHEN OTHERS THEN _ok := true; END;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL 5a: a vendor must not be able to approve banners'; END IF;
  PERFORM pg_temp.act_as(_uadmin);
  PERFORM public.admin_review_banner(_banner, true, 'ok');
  IF (SELECT status FROM public.vendor_advertising_campaigns WHERE id = _camp) <> 'active' THEN RAISE EXCEPTION 'FAIL 5b: campaign should be active'; END IF;
  IF pg_temp.ads_for('rotating', _va) <> 1 THEN RAISE EXCEPTION 'FAIL 5c: expected the live campaign in rotation'; END IF;
  IF (SELECT e ->> 'store_name' FROM jsonb_array_elements(public.get_homepage_ads('rotating', 60)) e WHERE (e ->> 'vendor_id')::uuid = _va) <> 'TechWorld Nigeria' THEN
    RAISE EXCEPTION 'FAIL 5c2: the ad must show the real shop name'; END IF;
  IF pg_temp.ads_for('featured', _va) <> 0 THEN RAISE EXCEPTION 'FAIL 5d: silver has no featured placement'; END IF;

  -- 6. Tracking: de-duplication, own-view and bad input --------------------------------------------
  PERFORM pg_temp.act_as(NULL);
  IF NOT public.record_ad_event('impression', _camp, 'rotating', 'visitor-aaaaaaaa', NULL, NULL, 'desktop') THEN RAISE EXCEPTION 'FAIL 6a: first impression should count'; END IF;
  IF public.record_ad_event('impression', _camp, 'rotating', 'visitor-aaaaaaaa', NULL, NULL, 'desktop') THEN RAISE EXCEPTION 'FAIL 6b: repeat impression must not count'; END IF;
  IF NOT public.record_ad_event('impression', _camp, 'rotating', 'visitor-bbbbbbbb') THEN RAISE EXCEPTION 'FAIL 6c: another visitor counts'; END IF;
  IF public.record_ad_event('impression', _camp, 'rotating', 'short') THEN RAISE EXCEPTION 'FAIL 6d: malformed visitor id must be rejected'; END IF;
  IF public.record_ad_event('banner_click', gen_random_uuid(), 'rotating', 'visitor-aaaaaaaa') THEN RAISE EXCEPTION 'FAIL 6e: unknown campaign must be rejected'; END IF;
  IF NOT public.record_ad_event('banner_click', _camp, 'rotating', 'visitor-aaaaaaaa') THEN RAISE EXCEPTION 'FAIL 6f: click should count'; END IF;
  IF public.record_ad_event('banner_click', _camp, 'rotating', 'visitor-aaaaaaaa') THEN RAISE EXCEPTION 'FAIL 6g: repeat click must not count'; END IF;
  IF NOT public.record_ad_event('shop_visit', _camp, 'shop_page', 'visitor-aaaaaaaa') THEN RAISE EXCEPTION 'FAIL 6h: shop visit should count'; END IF;
  IF public.record_ad_event('product_visit', _camp, 'product_page', 'visitor-aaaaaaaa', NULL, _pb) THEN RAISE EXCEPTION 'FAIL 6i: another vendor''s product must not be attributed'; END IF;
  IF NOT public.record_ad_event('product_visit', _camp, 'product_page', 'visitor-aaaaaaaa', NULL, _p1) THEN RAISE EXCEPTION 'FAIL 6j: own product visit should count'; END IF;
  PERFORM pg_temp.act_as(_ua);   -- the vendor viewing their own ad
  IF public.record_ad_event('impression', _camp, 'rotating', 'visitor-cccccccc') THEN RAISE EXCEPTION 'FAIL 6k: vendors must not inflate their own numbers'; END IF;
  PERFORM pg_temp.act_as(NULL);
  SELECT impressions_count INTO _n FROM public.vendor_advertising_campaigns WHERE id = _camp;
  IF _n <> 2 THEN RAISE EXCEPTION 'FAIL 6l: expected 2 impressions, got %', _n; END IF;
  IF (SELECT clicks_count FROM public.vendor_advertising_campaigns WHERE id = _camp) <> 1 THEN RAISE EXCEPTION 'FAIL 6m: expected 1 click'; END IF;
  IF (SELECT shop_visits_count FROM public.vendor_advertising_campaigns WHERE id = _camp) <> 1 THEN RAISE EXCEPTION 'FAIL 6n: expected 1 shop visit'; END IF;

  -- 7. Product limits are enforced server-side -----------------------------------------------------
  UPDATE public.advertising_plan_features SET max_advertised_products = 2 WHERE plan_slug = 'silver';
  PERFORM pg_temp.act_as(_ua);
  IF public.vendor_set_campaign_products(_camp, ARRAY[_p1, _p2]) <> 2 THEN RAISE EXCEPTION 'FAIL 7a: two products fit the plan'; END IF;
  _ok := false;
  BEGIN PERFORM public.vendor_set_campaign_products(_camp, ARRAY[_p1, _p2, _p3]); EXCEPTION WHEN OTHERS THEN _ok := true; _msg := SQLERRM; END;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL 7b: three products must exceed the plan limit'; END IF;
  _ok := false;
  BEGIN PERFORM public.vendor_set_campaign_products(_camp, ARRAY[_pb]); EXCEPTION WHEN OTHERS THEN _ok := true; END;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL 7c: another vendor''s product must be refused'; END IF;
  _ok := false;
  BEGIN INSERT INTO public.vendor_advertising_products (campaign_id, vendor_id, product_id) VALUES (_camp, _va, _p3); EXCEPTION WHEN OTHERS THEN _ok := true; END;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL 7d: the guard trigger must stop a direct third insert (limit 2)'; END IF;

  -- 8. Regeneration: duplicate guard, quota, admin revisions free ------------------------------------
  UPDATE public.advertising_plan_features SET banner_generations_allowed = 2 WHERE plan_slug = 'silver';
  _res := public.vendor_request_banner_regeneration(_camp);
  IF (_res ->> 'generations_remaining')::integer <> 0 THEN RAISE EXCEPTION 'FAIL 8a: expected 0 remaining (initial + 1 of 2), got %', _res; END IF;
  _ok := false;
  BEGIN PERFORM public.vendor_request_banner_regeneration(_camp); EXCEPTION WHEN OTHERS THEN _ok := true; END;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL 8b: a second open job for the same campaign must be refused'; END IF;
  UPDATE public.advertising_generation_jobs SET status = 'succeeded' WHERE campaign_id = _camp AND status = 'queued';
  _ok := false;
  BEGIN PERFORM public.vendor_request_banner_regeneration(_camp); EXCEPTION WHEN OTHERS THEN _ok := true; _msg := SQLERRM; END;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL 8c: quota (2) must stop a third generation'; END IF;
  PERFORM pg_temp.act_as(_uadmin);
  PERFORM public.admin_request_banner_revision(_camp, 'please retry');
  IF (SELECT counts_toward_quota FROM public.advertising_generation_jobs WHERE campaign_id = _camp AND status = 'queued') THEN
    RAISE EXCEPTION 'FAIL 8d: admin revisions must not use the vendor''s quota'; END IF;
  UPDATE public.advertising_generation_jobs SET status = 'cancelled' WHERE campaign_id = _camp AND status = 'queued';

  -- 9. Job failure: retry with back-off, then final failure -------------------------------------------
  INSERT INTO public.vendor_advertising_campaigns (vendor_id, campaign_type, status, end_date, target_shop_id, destination_url)
  VALUES (_vb, 'shop_promotion', 'pending_generation', now() + interval '10 days', _vb, '/shop/' || _vb) RETURNING id INTO _camp2;
  PERFORM public.ad_enqueue_job(_camp2, _vb, 'initial', true, 'initial:' || _camp2);
  _job := public.claim_advertising_job('test');
  IF public.finish_advertising_job_failure((_job ->> 'id')::uuid, 'timeout', 'timeout', true, 0.01) <> 'retry' THEN RAISE EXCEPTION 'FAIL 9a: first failure should retry'; END IF;
  IF (SELECT run_after FROM public.advertising_generation_jobs WHERE id = (_job ->> 'id')::uuid) <= now() THEN RAISE EXCEPTION 'FAIL 9b: retry must be delayed'; END IF;
  UPDATE public.advertising_generation_jobs SET run_after = now(), attempts = max_attempts - 1 WHERE id = (_job ->> 'id')::uuid;
  _job := public.claim_advertising_job('test');
  IF public.finish_advertising_job_failure((_job ->> 'id')::uuid, 'still failing', 'provider_error', true, 0.01) <> 'failed' THEN RAISE EXCEPTION 'FAIL 9c: attempts used up should fail the job'; END IF;
  IF (SELECT status FROM public.vendor_advertising_campaigns WHERE id = _camp2) <> 'failed' THEN RAISE EXCEPTION 'FAIL 9d: campaign should be marked failed'; END IF;
  DELETE FROM public.vendor_advertising_campaigns WHERE id = _camp2;

  -- 10. Admin usage limits pause the queue without failing jobs ----------------------------------------
  PERFORM public.ad_enqueue_job(_camp, _va, 'admin_revision', false, 'limit-test:' || _camp);
  UPDATE public.advertising_settings SET ai_daily_limit = 0;
  IF public.claim_advertising_job('test') IS NOT NULL THEN RAISE EXCEPTION 'FAIL 10a: daily limit 0 must stop claims'; END IF;
  UPDATE public.advertising_settings SET ai_daily_limit = 1000, ai_monthly_budget_usd = 0;
  IF public.claim_advertising_job('test') IS NOT NULL THEN RAISE EXCEPTION 'FAIL 10b: exhausted budget must stop claims'; END IF;
  UPDATE public.advertising_settings SET ai_monthly_budget_usd = 1000;
  UPDATE public.advertising_generation_jobs SET status = 'cancelled' WHERE campaign_id = _camp AND status = 'queued';

  -- 11. Permissions -------------------------------------------------------------------------------------
  PERFORM pg_temp.act_as(_ub);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO _n FROM public.vendor_advertising_campaigns WHERE vendor_id = _va;
  IF _n <> 0 THEN RAISE EXCEPTION 'FAIL 11a: vendor B can read vendor A''s campaign'; END IF;
  _ok := false;
  BEGIN INSERT INTO public.vendor_advertising_campaigns (vendor_id, campaign_type, status, end_date, target_shop_id, destination_url)
        VALUES (_vb, 'shop_promotion', 'active', now() + interval '30 days', _vb, '/shop/' || _vb);
  EXCEPTION WHEN OTHERS THEN _ok := true; END;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL 11b: a vendor must not be able to insert an active campaign (no payment)'; END IF;
  UPDATE public.vendor_advertising_campaigns SET priority = 100, status = 'active' WHERE vendor_id = _va;
  GET DIAGNOSTICS _n = ROW_COUNT;
  IF _n <> 0 THEN RAISE EXCEPTION 'FAIL 11c: vendor B changed vendor A''s campaign'; END IF;
  RESET ROLE;
  PERFORM pg_temp.act_as(_ua);
  EXECUTE 'SET LOCAL ROLE authenticated';
  UPDATE public.vendor_advertising_campaigns SET priority = 100 WHERE id = _camp;
  GET DIAGNOSTICS _n = ROW_COUNT;
  IF _n <> 0 THEN RAISE EXCEPTION 'FAIL 11d: a vendor must not set their own priority'; END IF;
  _ok := false;
  BEGIN PERFORM public.admin_set_campaign_priority(_camp, 100); EXCEPTION WHEN OTHERS THEN _ok := true; END;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL 11e: vendors must not reach admin functions'; END IF;
  _ok := false;
  BEGIN UPDATE public.vendor_advertising_campaigns SET target_shop_id = _vb, vendor_id = _vb WHERE id = _camp; EXCEPTION WHEN OTHERS THEN _ok := true; END;
  GET DIAGNOSTICS _n = ROW_COUNT;
  IF NOT _ok AND _n <> 0 THEN RAISE EXCEPTION 'FAIL 11f: a vendor redirected a campaign to another shop'; END IF;
  RESET ROLE;
  PERFORM pg_temp.act_as(NULL);
  EXECUTE 'SET LOCAL ROLE anon';
  _ok := false;
  BEGIN PERFORM public.ad_entitlement(_va); EXCEPTION WHEN insufficient_privilege THEN _ok := true; END;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL 11g: anonymous users must not call ad_entitlement'; END IF;
  _ok := false;
  BEGIN PERFORM public.claim_advertising_job('x'); EXCEPTION WHEN insufficient_privilege THEN _ok := true; END;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL 11h: only the service role may claim jobs'; END IF;
  _ok := false;
  BEGIN PERFORM count(*) FROM public.advertising_impressions; EXCEPTION WHEN insufficient_privilege THEN _ok := true; END;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL 11i: anonymous users must not read analytics events'; END IF;
  PERFORM public.get_homepage_ads('rotating', 5);   -- the public read must still work
  RESET ROLE;
  PERFORM pg_temp.act_as(_uadmin);
  PERFORM public.admin_set_campaign_priority(_camp, 40);
  _ok := false;
  BEGIN PERFORM public.admin_set_campaign_priority(_camp, 500); EXCEPTION WHEN OTHERS THEN _ok := true; END;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL 11j: out-of-range priority must be refused'; END IF;

  -- 12. Social profile validation, verification and banner eligibility -------------------------------------
  PERFORM pg_temp.act_as(_ua);
  IF (public.ad_normalize_social('instagram', 'https://instagram.com/techworld.ng', NULL) ->> 'url') <> 'https://www.instagram.com/techworld.ng/' THEN RAISE EXCEPTION 'FAIL 12a: instagram canonical url'; END IF;
  IF (public.ad_normalize_social('tiktok', 'https://www.tiktok.com/@techworld', '@TechWorld') ->> 'handle') <> 'techworld' THEN RAISE EXCEPTION 'FAIL 12b: tiktok handle'; END IF;
  FOREACH _msg IN ARRAY ARRAY[
    'http://instagram.com/techworld', 'https://evil.com/techworld', 'https://user:pw@instagram.com/techworld',
    'https://instagram.com:8080/techworld', 'javascript:alert(1)', 'https://instagram.com/', 'https://instagram.com/p/abc',
    'https://instagram.com/a/b', 'https://instagram.com.evil.com/techworld', 'https://facebook.com/sharer', 'https://tiktok.com/techworld'] LOOP
    _ok := false;
    BEGIN PERFORM public.ad_normalize_social(CASE WHEN _msg LIKE '%facebook%' THEN 'facebook' WHEN _msg LIKE '%tiktok%' THEN 'tiktok' ELSE 'instagram' END, _msg, NULL);
    EXCEPTION WHEN OTHERS THEN _ok := true; END;
    IF NOT _ok THEN RAISE EXCEPTION 'FAIL 12c: link should have been rejected: %', _msg; END IF;
  END LOOP;
  _ok := false;
  BEGIN PERFORM public.vendor_upsert_social_profile('instagram', 'https://instagram.com/techworld.ng', 'someoneelse', 'TechWorld', true); EXCEPTION WHEN OTHERS THEN _ok := true; END;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL 12d: handle that does not match the link must be refused'; END IF;
  _res := public.vendor_upsert_social_profile('instagram', 'https://instagram.com/techworld.ng', '@techworld.ng', 'TechWorld Nigeria', true);
  IF (_res ->> 'verification_status') <> 'unverified' THEN RAISE EXCEPTION 'FAIL 12e: new profiles start unverified'; END IF;
  IF (public.get_shop_social_banner(_va) -> 'accounts' -> 0 ->> 'handle') <> 'techworld.ng' THEN RAISE EXCEPTION 'FAIL 12f: social banner should be offered'; END IF;
  IF public.get_shop_social_banner(_vb) IS NOT NULL THEN RAISE EXCEPTION 'FAIL 12g: no banner without a plan + profile'; END IF;
  PERFORM public.vendor_upsert_social_profile('instagram', 'https://instagram.com/techworld.ng', NULL, 'TechWorld Nigeria', false);
  IF public.get_shop_social_banner(_va) IS NOT NULL THEN RAISE EXCEPTION 'FAIL 12h: disabled profile must not show a banner'; END IF;
  PERFORM public.vendor_upsert_social_profile('instagram', 'https://instagram.com/techworld.ng', NULL, 'TechWorld Nigeria', true);
  PERFORM pg_temp.act_as(_uadmin);
  PERFORM public.admin_set_social_verification((SELECT id FROM public.vendor_social_profiles WHERE vendor_id = _va), 'verified');
  PERFORM pg_temp.act_as(NULL);
  IF NOT public.record_ad_event('social_click', NULL, 'social_banner', 'visitor-aaaaaaaa', (SELECT id FROM public.vendor_social_profiles WHERE vendor_id = _va)) THEN
    RAISE EXCEPTION 'FAIL 12i: social click should count'; END IF;

  -- 13. Expiry: benefits vanish immediately, history stays -----------------------------------------------------
  UPDATE public.vendor_memberships SET expires_at = now() - interval '1 minute' WHERE vendor_id = _va;
  IF pg_temp.ads_for('rotating', _va) <> 0 THEN RAISE EXCEPTION 'FAIL 13a: expired plan must stop the ad at once (before any sweep)'; END IF;
  IF public.get_shop_social_banner(_va) IS NOT NULL THEN RAISE EXCEPTION 'FAIL 13b: expired plan must stop the social banner'; END IF;
  PERFORM pg_temp.act_as(_uadmin);
  _ok := false;
  BEGIN PERFORM public.admin_set_campaign_status(_camp, 'active', NULL); EXCEPTION WHEN OTHERS THEN _ok := true; END;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL 13c: admins must not activate a campaign for an expired plan'; END IF;
  IF public.expire_advertising_campaigns() < 1 THEN RAISE EXCEPTION 'FAIL 13d: sweep should expire the campaign'; END IF;
  IF (SELECT status FROM public.vendor_advertising_campaigns WHERE id = _camp) <> 'expired' THEN RAISE EXCEPTION 'FAIL 13e: campaign should be expired'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.advertising_impressions WHERE campaign_id = _camp) THEN RAISE EXCEPTION 'FAIL 13f: analytics history must be preserved'; END IF;

  -- 14. Renewal reuses the approved banner (no new AI cost) ---------------------------------------------------------
  SELECT banner_image_url INTO _img FROM public.vendor_advertising_campaigns WHERE id = _camp;
  UPDATE public.vendor_memberships SET expires_at = now() + interval '30 days' WHERE vendor_id = _va;
  SELECT id INTO _new_camp FROM public.vendor_advertising_campaigns WHERE vendor_id = _va AND status = 'active';
  IF _new_camp IS NULL OR _new_camp = _camp THEN RAISE EXCEPTION 'FAIL 14a: renewal should start a new live campaign'; END IF;
  IF (SELECT banner_image_url FROM public.vendor_advertising_campaigns WHERE id = _new_camp) <> _img THEN RAISE EXCEPTION 'FAIL 14b: renewal should reuse the approved banner'; END IF;
  IF EXISTS (SELECT 1 FROM public.advertising_generation_jobs WHERE campaign_id = _new_camp) THEN RAISE EXCEPTION 'FAIL 14c: renewal must not queue a new AI job'; END IF;
  IF pg_temp.ads_for('rotating', _va) <> 1 THEN RAISE EXCEPTION 'FAIL 14d: renewed campaign should be public again'; END IF;
  -- A rejected campaign must NOT have its banner reused
  PERFORM public.admin_set_campaign_status(_new_camp, 'rejected', 'inappropriate');
  UPDATE public.vendor_memberships SET expires_at = now() + interval '31 days' WHERE vendor_id = _va;
  IF (SELECT status FROM public.vendor_advertising_campaigns WHERE vendor_id = _va ORDER BY created_at DESC LIMIT 1) <> 'pending_generation' THEN
    RAISE EXCEPTION 'FAIL 14e: after a rejection, a renewal must generate a fresh banner'; END IF;

  -- 15. Promotional copy rules ---------------------------------------------------------------------------------------
  IF NOT (public.ad_copy_is_safe('Discover Premium Electronics') AND public.ad_copy_is_safe('Shop the Latest Fashion')
          AND public.ad_copy_is_safe('Explore Quality Home Essentials') AND public.ad_copy_is_safe('Find Your Next Favourite Product')) THEN
    RAISE EXCEPTION 'FAIL 15a: the spec''s example headlines must be accepted'; END IF;
  FOREACH _msg IN ARRAY ARRAY['50% off today', 'Guaranteed best price', 'Free delivery on all orders', 'Certified authentic phones', 'Only 5 left in stock',
                              'Visit https://evil.com', 'Call @shop now', 'Big sale on laptops', 'Prices from N5000'] LOOP
    IF public.ad_copy_is_safe(_msg) THEN RAISE EXCEPTION 'FAIL 15b: copy should have been rejected: %', _msg; END IF;
  END LOOP;

  -- 16. External advertising is never shown as running ------------------------------------------------------------------
  PERFORM pg_temp.act_as(_ub);
  _ok := false;
  BEGIN PERFORM public.vendor_request_external_campaign('google_ads', 'shop', '{}', 'traffic', 5000, 14, true); EXCEPTION WHEN OTHERS THEN _ok := true; END;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL 16a: a free plan must not request external ads'; END IF;
  UPDATE public.vendor_memberships SET plan_slug = 'premium', expires_at = now() + interval '30 days' WHERE vendor_id = _va;
  PERFORM pg_temp.act_as(_ua);
  _ok := false;
  BEGIN PERFORM public.vendor_request_external_campaign('tiktok_ads', 'shop', '{}', 'traffic', NULL, 14, true); EXCEPTION WHEN OTHERS THEN _ok := true; END;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL 16b: authorising spend without a budget must be refused'; END IF;
  _ok := false;
  BEGIN PERFORM public.vendor_request_external_campaign('google_ads', 'shop', '{}', 'traffic', 5000, 14, true); EXCEPTION WHEN OTHERS THEN _ok := true; END;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL 16b2: submitting without a photo or video must be refused'; END IF;
  INSERT INTO storage.objects (bucket_id, name) VALUES ('ad-creatives', _va::text || '/test-ad.jpg') ON CONFLICT DO NOTHING;
  _res := to_jsonb((SELECT e FROM public.external_ad_campaigns e WHERE e.id = public.vendor_request_external_campaign('google_ads', 'shop', '{}', 'traffic', 5000, 14, true,
          jsonb_build_array(jsonb_build_object('kind', 'photo', 'path', _va::text || '/test-ad.jpg', 'name', 'test-ad.jpg', 'size', 1000)), NULL)));
  IF (_res ->> 'status') <> 'pending_integration' THEN RAISE EXCEPTION 'FAIL 16c: must be pending_integration, got %', _res ->> 'status'; END IF;
  IF (_res ->> 'status_detail') NOT LIKE '%no money has been spent%' THEN RAISE EXCEPTION 'FAIL 16d: status must say nothing is running'; END IF;
  PERFORM pg_temp.act_as(_uadmin);
  _ok := false;
  BEGIN PERFORM public.admin_set_external_status((_res ->> 'id')::uuid, 'active', NULL); EXCEPTION WHEN OTHERS THEN _ok := true; END;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL 16e: an admin must not be able to mark an external campaign active'; END IF;

  RAISE EXCEPTION 'ALL VENDOR ADVERTISING TESTS PASSED';
END $test$;

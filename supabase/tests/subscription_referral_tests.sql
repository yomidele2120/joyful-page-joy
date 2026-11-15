-- Subscription + referral tests. RUN ONLY ON A STAGING / BRANCH DATABASE, never production.
-- Everything runs in one transaction that ends with ROLLBACK, so nothing is kept.
-- Run in the Supabase SQL editor (role postgres). Each test raises an exception with its name if it fails;
-- if the script ends with "ALL TESTS PASSED" in the notices, every check held.
-- These tests were written without being run (no database was available when they were written). A failure may be a
-- test setup problem (for example a NOT NULL column on vendors/auth.users that your project added) rather than a bug.
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
  u_ref uuid := gen_random_uuid(); u_a uuid := gen_random_uuid(); u_b uuid := gen_random_uuid(); u_c uuid := gen_random_uuid(); u_admin uuid := gen_random_uuid();
  v_a uuid; v_b uuid; v_c uuid; _code text; _r jsonb; _n int; _amt bigint; _p1 uuid; _p2 uuid; _p3 uuid; _com public.referral_commissions%ROWTYPE;
  _exp1 timestamptz; _exp2 timestamptz; _bal bigint; _ok boolean; _failed boolean;
BEGIN
  -- ---- setup: users, vendors, referrer, plan credit ----
  INSERT INTO auth.users (id, email) VALUES (u_ref, 'ref@test.local'), (u_a, 'a@test.local'), (u_b, 'b@test.local'), (u_c, 'c@test.local'), (u_admin, 'admin@test.local');
  INSERT INTO public.user_roles (user_id, role) VALUES (u_admin, 'admin');
  INSERT INTO public.vendors (user_id, store_name) VALUES (u_a, 'Shop A') RETURNING id INTO v_a;
  INSERT INTO public.vendors (user_id, store_name) VALUES (u_b, 'Shop B') RETURNING id INTO v_b;
  INSERT INTO public.vendors (user_id, store_name) VALUES (u_c, 'Shop C') RETURNING id INTO v_c;
  INSERT INTO public.vendors (user_id, store_name) VALUES (u_ref, 'Referrer shop');   -- done here as postgres: the vendors table's RLS blocks inserts by a test user
  UPDATE public.supplier_membership_plans SET ad_credit_kobo = 100000 WHERE slug = 'silver';
  UPDATE public.referral_settings SET programme_enabled = true, hold_days = 30;
  UPDATE public.referral_agreements SET rate_percent = 13 WHERE is_default;

  PERFORM pg_temp.as_user(u_ref);
  _code := (public.get_or_create_my_referral_profile()).code;
  PERFORM pg_temp.as_admin();
  IF _code IS NULL THEN RAISE EXCEPTION 'T0 referral code was not created'; END IF;

  -- ---- T1 attribution + commission is 13% of the verified payment ----
  PERFORM pg_temp.as_user(u_a);
  _r := public.apply_referral_code(_code, 'link');
  PERFORM pg_temp.as_admin();
  IF NOT (_r->>'ok')::boolean THEN RAISE EXCEPTION 'T1 apply_referral_code refused: %', _r; END IF;
  INSERT INTO public.supplier_membership_payments (vendor_id, plan_slug, paystack_reference, amount_kobo, period_days, status, kind, billing_period)
  VALUES (v_a, 'silver', 'T-REF-1', 2500000, 365, 'pending', 'new', 'annual') RETURNING id INTO _p1;
  IF NOT public.finalize_supplier_membership_payment('T-REF-1', 2500000, 'NGN') THEN RAISE EXCEPTION 'T1 finalize returned false'; END IF;
  SELECT * INTO _com FROM public.referral_commissions WHERE payment_id = _p1;
  IF _com.amount_kobo <> 325000 OR _com.status <> 'pending' OR _com.referrer_user_id <> u_ref THEN RAISE EXCEPTION 'T1 wrong commission: %', row_to_json(_com); END IF;
  IF _com.available_at < now() + interval '29 days' THEN RAISE EXCEPTION 'T1 hold period not applied'; END IF;

  -- ---- T2 duplicate webhook/verify does not create a second commission or second ad credit ----
  PERFORM public.finalize_supplier_membership_payment('T-REF-1', 2500000, 'NGN');
  PERFORM public.finalize_supplier_membership_payment('T-REF-1', 2500000, 'NGN');
  SELECT count(*) INTO _n FROM public.referral_commissions WHERE payment_id = _p1;
  IF _n <> 1 THEN RAISE EXCEPTION 'T2 duplicate commission rows: %', _n; END IF;
  SELECT count(*) INTO _n FROM public.ad_wallet_ledger WHERE membership_payment_id = _p1;
  IF _n <> 1 THEN RAISE EXCEPTION 'T2 ad credit given % times', _n; END IF;

  -- ---- T3 wrong amount / unknown reference / failed payment: nothing activates, no commission ----
  INSERT INTO public.supplier_membership_payments (vendor_id, plan_slug, paystack_reference, amount_kobo, period_days, status, kind, billing_period)
  VALUES (v_b, 'silver', 'T-BAD-1', 2500000, 365, 'pending', 'new', 'annual');
  IF public.finalize_supplier_membership_payment('T-BAD-1', 100, 'NGN') THEN RAISE EXCEPTION 'T3 accepted a wrong amount'; END IF;
  IF public.finalize_supplier_membership_payment('NO-SUCH-REF', 2500000, 'NGN') THEN RAISE EXCEPTION 'T3 accepted an unknown reference'; END IF;
  UPDATE public.supplier_membership_payments SET status = 'failed' WHERE paystack_reference = 'T-BAD-1';
  IF public.finalize_supplier_membership_payment('T-BAD-1', 2500000, 'NGN') THEN RAISE EXCEPTION 'T3 accepted a failed payment'; END IF;
  SELECT count(*) INTO _n FROM public.referral_commissions WHERE vendor_id = v_b;
  IF _n <> 0 THEN RAISE EXCEPTION 'T3 commission created without a verified payment'; END IF;

  -- ---- T4 self-referral refused (function and table guard) ----
  PERFORM pg_temp.as_user(u_ref);
  _r := public.apply_referral_code(_code, 'code_manual');
  PERFORM pg_temp.as_admin();
  IF (_r->>'ok')::boolean THEN RAISE EXCEPTION 'T4 self-referral was accepted'; END IF;
  _failed := false;
  BEGIN
    INSERT INTO public.referral_attributions (vendor_id, referrer_user_id, code, agreement_id, rate_percent, source)
    SELECT v.id, u_ref, _code, public.referral_default_agreement(), 13, 'admin' FROM public.vendors v WHERE v.user_id = u_ref;
  EXCEPTION WHEN OTHERS THEN _failed := true; END;
  IF NOT _failed THEN RAISE EXCEPTION 'T4 table guard allowed self-attribution'; END IF;

  -- ---- T5 code manipulation: cannot attach a code after paying; cannot switch referrer; invalid code refused ----
  PERFORM pg_temp.as_user(u_a);
  _r := public.apply_referral_code(_code, 'code_manual');
  IF (_r->>'ok')::boolean OR _r->>'reason' <> 'already_referred' THEN RAISE EXCEPTION 'T5 re-apply not refused: %', _r; END IF;
  PERFORM pg_temp.as_admin();
  INSERT INTO public.supplier_membership_payments (vendor_id, plan_slug, paystack_reference, amount_kobo, period_days, status, kind, billing_period, paid_at)
  VALUES (v_c, 'silver', 'T-C-PAID', 2500000, 365, 'success', 'new', 'annual', now());
  PERFORM pg_temp.as_user(u_c);
  _r := public.apply_referral_code(_code, 'code_manual');
  IF (_r->>'ok')::boolean OR _r->>'reason' <> 'already_paid' THEN RAISE EXCEPTION 'T5 late code not refused: %', _r; END IF;
  _r := public.apply_referral_code('NOSUCHCODE', 'code_manual');
  IF (_r->>'ok')::boolean THEN RAISE EXCEPTION 'T5 invalid code accepted'; END IF;
  PERFORM pg_temp.as_admin();
  DELETE FROM public.supplier_membership_payments WHERE paystack_reference = 'T-C-PAID';

  -- ---- T6 renewal extends from the current expiry, not from today ----
  SELECT expires_at INTO _exp1 FROM public.vendor_memberships WHERE vendor_id = v_a;
  INSERT INTO public.supplier_membership_payments (vendor_id, plan_slug, paystack_reference, amount_kobo, period_days, status, kind, billing_period)
  VALUES (v_a, 'silver', 'T-REF-2', 2500000, 365, 'pending', 'renewal', 'annual') RETURNING id INTO _p2;
  PERFORM public.finalize_supplier_membership_payment('T-REF-2', 2500000, 'NGN');
  SELECT expires_at INTO _exp2 FROM public.vendor_memberships WHERE vendor_id = v_a;
  IF _exp2 < _exp1 + interval '364 days' THEN RAISE EXCEPTION 'T6 renewal did not extend from expiry (% -> %)', _exp1, _exp2; END IF;
  SELECT count(*) INTO _n FROM public.referral_commissions WHERE vendor_id = v_a AND status <> 'reversed';
  IF _n <> 2 THEN RAISE EXCEPTION 'T6 renewal should earn a commission too (lifetime), got %', _n; END IF;

  -- ---- T7 refund of a payment whose commission is still held: commission reversed, plan ended, ad credit taken back ----
  _r := public.reverse_subscription_payment(_p2, 'refunded', 'test refund');
  IF _r->>'commission' <> 'reversed' THEN RAISE EXCEPTION 'T7 expected reversed, got %', _r; END IF;
  SELECT status INTO _com.status FROM public.referral_commissions WHERE payment_id = _p2;
  IF _com.status <> 'reversed' THEN RAISE EXCEPTION 'T7 commission not reversed'; END IF;
  _r := public.reverse_subscription_payment(_p2, 'refunded', 'again');
  IF NOT COALESCE((_r->>'already')::boolean, false) THEN RAISE EXCEPTION 'T7 second refund should be a no-op'; END IF;
  IF EXISTS (SELECT 1 FROM public.vendor_memberships WHERE vendor_id = v_a AND expires_at > now()) THEN RAISE EXCEPTION 'T7 plan still active after refund of the newest payment'; END IF;

  -- ---- T8 chargeback AFTER the commission was paid out: debt recorded, deducted from the next withdrawal ----
  UPDATE public.referral_commissions SET status = 'paid' WHERE payment_id = _p1;
  _r := public.reverse_subscription_payment(_p1, 'chargeback', 'test chargeback');
  IF _r->>'commission' <> 'debt_recorded' THEN RAISE EXCEPTION 'T8 expected debt_recorded, got %', _r; END IF;
  SELECT count(*) INTO _n FROM public.referral_adjustments WHERE referrer_user_id = u_ref AND amount_kobo = 325000 AND settled_at IS NULL;
  IF _n <> 1 THEN RAISE EXCEPTION 'T8 debt not recorded'; END IF;

  -- ---- T9 hold release + withdrawal: available balance minus debt, minimum enforced, no double withdrawal ----
  INSERT INTO public.supplier_membership_payments (vendor_id, plan_slug, paystack_reference, amount_kobo, period_days, status, kind, billing_period)
  VALUES (v_b, 'silver', 'T-B-1', 10000000, 365, 'pending', 'new', 'annual');
  PERFORM pg_temp.as_user(u_b);
  PERFORM public.apply_referral_code(_code, 'link');
  PERFORM pg_temp.as_admin();
  PERFORM public.finalize_supplier_membership_payment('T-B-1', 10000000, 'NGN');   -- commission 1,300,000
  UPDATE public.referral_commissions SET available_at = now() - interval '1 day' WHERE status = 'pending';
  PERFORM public.release_referral_commissions();
  PERFORM pg_temp.as_user(u_ref);
  PERFORM public.save_my_payout_account('Test Bank', '0123456789', 'Ref Test');
  _r := public.request_referral_withdrawal();
  PERFORM pg_temp.as_admin();
  IF (_r->>'net_kobo')::bigint <> 1300000 - 325000 THEN RAISE EXCEPTION 'T9 net should be 975000 after the debt, got %', _r; END IF;
  PERFORM pg_temp.as_user(u_ref);
  _failed := false;
  BEGIN PERFORM public.request_referral_withdrawal(); EXCEPTION WHEN OTHERS THEN _failed := true; END;
  PERFORM pg_temp.as_admin();
  IF NOT _failed THEN RAISE EXCEPTION 'T9 a second open withdrawal was allowed'; END IF;

  -- ---- T10 admin approves and marks paid; a commission reversed before payout is excluded ----
  PERFORM pg_temp.as_user(u_admin);
  PERFORM public.admin_review_referral_withdrawal((SELECT id FROM public.referral_withdrawals WHERE referrer_user_id = u_ref), 'approved', 'ok');
  PERFORM public.admin_mark_referral_withdrawal_paid((SELECT id FROM public.referral_withdrawals WHERE referrer_user_id = u_ref), 'BANK-REF-1');
  PERFORM pg_temp.as_admin();
  IF (SELECT status FROM public.referral_withdrawals WHERE referrer_user_id = u_ref) <> 'paid' THEN RAISE EXCEPTION 'T10 not paid'; END IF;

  -- ---- T11 rate change: the existing cohort keeps 13%, new referrals use the new default ----
  PERFORM pg_temp.as_user(u_admin);
  PERFORM public.admin_set_default_rate(10, 'Test 10%', 'test change');
  PERFORM pg_temp.as_admin();
  IF (SELECT rate_percent FROM public.referral_attributions WHERE vendor_id = v_a) <> 13 THEN RAISE EXCEPTION 'T11 existing cohort rate changed'; END IF;
  PERFORM pg_temp.as_user(u_c);
  _r := public.apply_referral_code(_code, 'link');
  PERFORM pg_temp.as_admin();
  IF (SELECT rate_percent FROM public.referral_attributions WHERE vendor_id = v_c) <> 10 THEN RAISE EXCEPTION 'T11 new referral did not get the new default'; END IF;

  -- ---- T12 unauthorised access: non-admins cannot use admin functions; users cannot see each other's money ----
  PERFORM pg_temp.as_user(u_a);
  _failed := false;
  BEGIN PERFORM public.admin_set_default_rate(99, 'x', 'attack'); EXCEPTION WHEN OTHERS THEN _failed := true; END;
  IF NOT _failed THEN RAISE EXCEPTION 'T12 non-admin changed the default rate'; END IF;
  _failed := false;
  BEGIN PERFORM public.admin_reverse_commission(gen_random_uuid(), 'attack'); EXCEPTION WHEN OTHERS THEN _failed := true; END;
  IF NOT _failed THEN RAISE EXCEPTION 'T12 non-admin reached admin_reverse_commission'; END IF;
  _failed := false;
  BEGIN PERFORM public.reverse_subscription_payment(_p1, 'refunded', 'attack'); EXCEPTION WHEN OTHERS THEN _failed := true; END;
  IF NOT _failed THEN RAISE EXCEPTION 'T12 a user could call reverse_subscription_payment'; END IF;
  _failed := false;
  BEGIN PERFORM public.finalize_supplier_membership_payment('T-REF-1', 1, 'NGN'); EXCEPTION WHEN OTHERS THEN _failed := true; END;
  IF NOT _failed THEN RAISE EXCEPTION 'T12 a user could call finalize_supplier_membership_payment'; END IF;
  SELECT count(*) INTO _n FROM public.referral_commissions;           -- vendor A is not the referrer
  IF _n <> 0 THEN RAISE EXCEPTION 'T12 a vendor can read commissions that are not theirs (%)', _n; END IF;
  _failed := false;
  BEGIN UPDATE public.referral_commissions SET amount_kobo = 99999999; EXCEPTION WHEN OTHERS THEN _failed := true; END;
  IF NOT _failed THEN RAISE EXCEPTION 'T12 a user could write to referral_commissions'; END IF;
  PERFORM pg_temp.as_admin();

  -- ---- T13 the referrer's own overview matches the ledger ----
  PERFORM pg_temp.as_user(u_ref);
  _r := public.my_referral_overview();
  PERFORM pg_temp.as_admin();
  IF (_r->>'vendors_referred')::int <> 3 THEN RAISE EXCEPTION 'T13 vendors_referred wrong: %', _r; END IF;

  -- ---- T14 admin grant creates no payment and no commission ----
  PERFORM pg_temp.as_user(u_admin);
  PERFORM public.admin_grant_subscription(v_c, 'premium', 30, 'test grant');
  PERFORM pg_temp.as_admin();
  SELECT count(*) INTO _n FROM public.referral_commissions WHERE vendor_id = v_c;
  IF _n <> 0 THEN RAISE EXCEPTION 'T14 a manual grant earned a commission'; END IF;

  RAISE NOTICE 'ALL TESTS PASSED';
END $$;
ROLLBACK;

-- =====================================================================
-- PHASE 3c: referral commission wallet, withdrawals, admin controls and reports.
-- The commission wallet is its own ledger (referral_commissions / referral_adjustments / referral_withdrawals).
-- It never touches vendor sales proceeds, the ad wallet, BNPL or preorder money. Balances are always calculated from the ledger.
-- Run after 20261116020000_referral_core.sql. Safe to run twice.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.referral_withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_user_id uuid NOT NULL REFERENCES auth.users(id),
  gross_kobo bigint NOT NULL CHECK (gross_kobo > 0),
  debt_kobo bigint NOT NULL DEFAULT 0 CHECK (debt_kobo >= 0),
  fee_kobo bigint NOT NULL DEFAULT 0 CHECK (fee_kobo >= 0),
  net_kobo bigint NOT NULL CHECK (net_kobo > 0),
  method text NOT NULL DEFAULT 'bank_transfer',
  account jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'approved', 'rejected', 'paid', 'cancelled')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid,
  reviewed_at timestamptz,
  paid_at timestamptz,
  payout_reference text,
  admin_note text
);
CREATE INDEX IF NOT EXISTS idx_referral_wd_user ON public.referral_withdrawals (referrer_user_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_referral_wd_status ON public.referral_withdrawals (status, requested_at DESC);
ALTER TABLE public.referral_withdrawals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Own withdrawals" ON public.referral_withdrawals;
CREATE POLICY "Own withdrawals" ON public.referral_withdrawals FOR SELECT TO authenticated USING (referrer_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
REVOKE ALL ON public.referral_withdrawals FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.referral_withdrawals TO authenticated;

CREATE OR REPLACE FUNCTION public.referral_require_admin() RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admins only'; END IF; END $$;
REVOKE ALL ON FUNCTION public.referral_require_admin() FROM PUBLIC, anon, authenticated;

-- ---------- scheduled release: after the holding period a pending commission becomes withdrawable ----------
CREATE OR REPLACE FUNCTION public.release_referral_commissions() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _n integer;
BEGIN
  UPDATE public.referral_commissions c
     SET status = CASE WHEN p.status = 'active' THEN 'available' ELSE 'approved' END
    FROM public.referral_profiles p
   WHERE p.user_id = c.referrer_user_id AND c.status = 'pending' AND c.available_at <= now();
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END $$;
REVOKE ALL ON FUNCTION public.release_referral_commissions() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_referral_commissions() TO service_role;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'release-referral-commissions';
    PERFORM cron.schedule('release-referral-commissions', '7 * * * *', 'select public.release_referral_commissions()');
  END IF;
END $$;

-- ---------- the referrer's own screens ----------
CREATE OR REPLACE FUNCTION public.referral_withdrawable_kobo(_user uuid) RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT GREATEST(
    COALESCE((SELECT sum(amount_kobo) FROM public.referral_commissions WHERE referrer_user_id = _user AND status = 'available'), 0)
    - COALESCE((SELECT sum(amount_kobo) FROM public.referral_adjustments WHERE referrer_user_id = _user AND settled_at IS NULL), 0), 0)::bigint;
$$;
REVOKE ALL ON FUNCTION public.referral_withdrawable_kobo(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.my_referral_overview() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _p public.referral_profiles%ROWTYPE; _s public.referral_settings%ROWTYPE; _out jsonb;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  _p := public.get_or_create_my_referral_profile();
  SELECT * INTO _s FROM public.referral_settings WHERE id;
  SELECT jsonb_build_object(
    'code', _p.code, 'status', _p.status, 'kind', _p.kind, 'display_name', _p.display_name,
    'programme_enabled', _s.programme_enabled,
    'rate_percent', (SELECT rate_percent FROM public.referral_agreements WHERE id = COALESCE(_p.agreement_id, public.referral_default_agreement())),
    'vendors_referred', (SELECT count(*) FROM public.referral_attributions WHERE referrer_user_id = _uid),
    'active_subscriptions', (SELECT count(*) FROM public.referral_attributions a WHERE a.referrer_user_id = _uid AND public.effective_supplier_plan(a.vendor_id) <> 'free'),
    'expired_subscriptions', (SELECT count(*) FROM public.referral_attributions a WHERE a.referrer_user_id = _uid AND public.effective_supplier_plan(a.vendor_id) = 'free'
                               AND EXISTS (SELECT 1 FROM public.supplier_membership_payments x WHERE x.vendor_id = a.vendor_id AND x.status IN ('success', 'refunded', 'chargeback'))),
    'revenue_kobo', COALESCE((SELECT sum(base_amount_kobo) FROM public.referral_commissions WHERE referrer_user_id = _uid AND status <> 'reversed'), 0),
    'earned_kobo', COALESCE((SELECT sum(amount_kobo) FROM public.referral_commissions WHERE referrer_user_id = _uid AND status <> 'reversed'), 0),
    'pending_kobo', COALESCE((SELECT sum(amount_kobo) FROM public.referral_commissions WHERE referrer_user_id = _uid AND status = 'pending'), 0),
    'approved_kobo', COALESCE((SELECT sum(amount_kobo) FROM public.referral_commissions WHERE referrer_user_id = _uid AND status = 'approved'), 0),
    'available_kobo', COALESCE((SELECT sum(amount_kobo) FROM public.referral_commissions WHERE referrer_user_id = _uid AND status = 'available'), 0),
    'processing_kobo', COALESCE((SELECT sum(amount_kobo) FROM public.referral_commissions WHERE referrer_user_id = _uid AND status = 'processing'), 0),
    'paid_kobo', COALESCE((SELECT sum(amount_kobo) FROM public.referral_commissions WHERE referrer_user_id = _uid AND status = 'paid'), 0),
    'debt_kobo', COALESCE((SELECT sum(amount_kobo) FROM public.referral_adjustments WHERE referrer_user_id = _uid AND settled_at IS NULL), 0),
    'withdrawable_kobo', public.referral_withdrawable_kobo(_uid),
    'min_withdrawal_kobo', _s.min_withdrawal_kobo, 'withdrawal_fee_kobo', _s.withdrawal_fee_kobo, 'hold_days', _s.hold_days,
    'has_payout_account', EXISTS (SELECT 1 FROM public.referral_payout_accounts WHERE user_id = _uid)
  ) INTO _out;
  RETURN _out;
END $$;
REVOKE ALL ON FUNCTION public.my_referral_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_referral_overview() TO authenticated;

-- Referred vendors: shop name, plan state and join date only. No money, no contact details.
CREATE OR REPLACE FUNCTION public.my_referred_vendors() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'store_name', v.store_name, 'attributed_at', a.attributed_at,
    'status', CASE WHEN public.effective_supplier_plan(a.vendor_id) <> 'free' THEN 'active'
                   WHEN EXISTS (SELECT 1 FROM public.supplier_membership_payments x WHERE x.vendor_id = a.vendor_id AND x.status IN ('success', 'refunded', 'chargeback')) THEN 'expired'
                   ELSE 'not_subscribed' END,
    'plan_name', (SELECT name FROM public.supplier_membership_plans WHERE slug = public.effective_supplier_plan(a.vendor_id))
  ) ORDER BY a.attributed_at DESC), '[]'::jsonb)
  FROM public.referral_attributions a JOIN public.vendors v ON v.id = a.vendor_id
  WHERE a.referrer_user_id = auth.uid();
$$;
REVOKE ALL ON FUNCTION public.my_referred_vendors() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_referred_vendors() TO authenticated;

CREATE OR REPLACE FUNCTION public.my_commission_history(_limit integer DEFAULT 100) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb) FROM (
    SELECT c.id, v.store_name AS vendor, pay.paystack_reference AS payment_reference, pl.name AS plan_name,
           c.base_amount_kobo AS payment_kobo, c.rate_percent, c.amount_kobo AS commission_kobo, pay.paid_at, c.available_at, c.status, c.reversal_reason
    FROM public.referral_commissions c
    JOIN public.vendors v ON v.id = c.vendor_id
    JOIN public.supplier_membership_payments pay ON pay.id = c.payment_id
    LEFT JOIN public.supplier_membership_plans pl ON pl.slug = c.plan_slug
    WHERE c.referrer_user_id = auth.uid()
    ORDER BY c.created_at DESC LIMIT LEAST(GREATEST(COALESCE(_limit, 100), 1), 500)
  ) t;
$$;
REVOKE ALL ON FUNCTION public.my_commission_history(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_commission_history(integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.save_my_payout_account(_bank text, _number text, _name text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _number !~ '^[0-9]{10}$' THEN RAISE EXCEPTION 'Account number must be 10 digits'; END IF;
  INSERT INTO public.referral_payout_accounts (user_id, bank_name, account_number, account_name) VALUES (auth.uid(), btrim(_bank), _number, btrim(_name))
  ON CONFLICT (user_id) DO UPDATE SET bank_name = EXCLUDED.bank_name, account_number = EXCLUDED.account_number, account_name = EXCLUDED.account_name, updated_at = now();
  PERFORM public.referral_log('payout_account.saved', 'user', auth.uid()::text, '{}'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.save_my_payout_account(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_my_payout_account(text, text, text) TO authenticated;

-- Withdraw the whole available balance. Any debt (money owed back for a commission reversed after payout) and the fee come off first.
CREATE OR REPLACE FUNCTION public.request_referral_withdrawal() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _s public.referral_settings%ROWTYPE; _p public.referral_profiles%ROWTYPE; _acct public.referral_payout_accounts%ROWTYPE;
  _gross bigint; _debt bigint; _net bigint; _id uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('referral_wd:' || _uid::text));
  SELECT * INTO _s FROM public.referral_settings WHERE id;
  SELECT * INTO _p FROM public.referral_profiles WHERE user_id = _uid;
  IF NOT FOUND OR _p.status <> 'active' THEN RAISE EXCEPTION 'Your referral account is not active'; END IF;
  SELECT * INTO _acct FROM public.referral_payout_accounts WHERE user_id = _uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Add your bank details first'; END IF;
  IF EXISTS (SELECT 1 FROM public.referral_withdrawals WHERE referrer_user_id = _uid AND status IN ('requested', 'approved')) THEN
    RAISE EXCEPTION 'You already have a withdrawal in progress';
  END IF;
  SELECT COALESCE(sum(amount_kobo), 0) INTO _gross FROM public.referral_commissions WHERE referrer_user_id = _uid AND status = 'available';
  SELECT COALESCE(sum(amount_kobo), 0) INTO _debt FROM public.referral_adjustments WHERE referrer_user_id = _uid AND settled_at IS NULL;
  _net := _gross - _debt - _s.withdrawal_fee_kobo;
  IF _gross - _debt < _s.min_withdrawal_kobo OR _net <= 0 THEN
    RAISE EXCEPTION 'The minimum withdrawal is % naira after any amount owed', (_s.min_withdrawal_kobo / 100);
  END IF;
  INSERT INTO public.referral_withdrawals (referrer_user_id, gross_kobo, debt_kobo, fee_kobo, net_kobo, method, account)
  VALUES (_uid, _gross, _debt, _s.withdrawal_fee_kobo, _net, 'bank_transfer',
          jsonb_build_object('bank_name', _acct.bank_name, 'account_number', _acct.account_number, 'account_name', _acct.account_name))
  RETURNING id INTO _id;
  UPDATE public.referral_commissions SET status = 'processing', withdrawal_id = _id WHERE referrer_user_id = _uid AND status = 'available';
  UPDATE public.referral_adjustments SET settled_withdrawal_id = _id, settled_at = now() WHERE referrer_user_id = _uid AND settled_at IS NULL;
  PERFORM public.referral_log('withdrawal.requested', 'withdrawal', _id::text, jsonb_build_object('gross', _gross, 'debt', _debt, 'net', _net));
  RETURN jsonb_build_object('id', _id, 'net_kobo', _net);
END $$;
REVOKE ALL ON FUNCTION public.request_referral_withdrawal() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_referral_withdrawal() TO authenticated;

-- Put a withdrawal's commissions and debts back (used when it is cancelled or rejected).
CREATE OR REPLACE FUNCTION public.referral_release_withdrawal(_id uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.referral_commissions SET status = 'available', withdrawal_id = NULL WHERE withdrawal_id = _id AND status = 'processing';
  UPDATE public.referral_adjustments SET settled_withdrawal_id = NULL, settled_at = NULL WHERE settled_withdrawal_id = _id;
$$;
REVOKE ALL ON FUNCTION public.referral_release_withdrawal(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.cancel_my_referral_withdrawal(_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _w public.referral_withdrawals%ROWTYPE;
BEGIN
  SELECT * INTO _w FROM public.referral_withdrawals WHERE id = _id AND referrer_user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND OR _w.status <> 'requested' THEN RAISE EXCEPTION 'Only a waiting request can be cancelled'; END IF;
  UPDATE public.referral_withdrawals SET status = 'cancelled' WHERE id = _id;
  PERFORM public.referral_release_withdrawal(_id);
  PERFORM public.referral_log('withdrawal.cancelled', 'withdrawal', _id::text, '{}'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.cancel_my_referral_withdrawal(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_my_referral_withdrawal(uuid) TO authenticated;

-- ---------- admin: withdrawals ----------
CREATE OR REPLACE FUNCTION public.admin_review_referral_withdrawal(_id uuid, _decision text, _note text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _w public.referral_withdrawals%ROWTYPE;
BEGIN
  PERFORM public.referral_require_admin();
  IF _decision NOT IN ('approved', 'rejected') THEN RAISE EXCEPTION 'Choose approved or rejected'; END IF;
  SELECT * INTO _w FROM public.referral_withdrawals WHERE id = _id FOR UPDATE;
  IF NOT FOUND OR _w.status <> 'requested' THEN RAISE EXCEPTION 'This request is not waiting for review'; END IF;
  IF _decision = 'rejected' AND (_note IS NULL OR char_length(btrim(_note)) < 3) THEN RAISE EXCEPTION 'Give a reason for rejecting'; END IF;
  UPDATE public.referral_withdrawals SET status = _decision, reviewed_by = auth.uid(), reviewed_at = now(), admin_note = NULLIF(btrim(COALESCE(_note, '')), '') WHERE id = _id;
  IF _decision = 'rejected' THEN PERFORM public.referral_release_withdrawal(_id); END IF;
  PERFORM public.referral_log('withdrawal.' || _decision, 'withdrawal', _id::text, jsonb_build_object('note', _note));
END $$;

-- Payout is marked after the admin has actually sent the money. The amount is re-checked first: a commission reversed while
-- the request was waiting is left out, so a refunded subscription is never paid out.
CREATE OR REPLACE FUNCTION public.admin_mark_referral_withdrawal_paid(_id uuid, _reference text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _w public.referral_withdrawals%ROWTYPE; _gross bigint; _net bigint;
BEGIN
  PERFORM public.referral_require_admin();
  SELECT * INTO _w FROM public.referral_withdrawals WHERE id = _id FOR UPDATE;
  IF NOT FOUND OR _w.status <> 'approved' THEN RAISE EXCEPTION 'Approve the request first'; END IF;
  SELECT COALESCE(sum(amount_kobo), 0) INTO _gross FROM public.referral_commissions WHERE withdrawal_id = _id AND status = 'processing';
  _net := _gross - _w.debt_kobo - _w.fee_kobo;
  IF _net <= 0 THEN RAISE EXCEPTION 'Nothing is left to pay after reversals. Reject this request.'; END IF;
  UPDATE public.referral_commissions SET status = 'paid' WHERE withdrawal_id = _id AND status = 'processing';
  UPDATE public.referral_withdrawals SET status = 'paid', paid_at = now(), payout_reference = NULLIF(btrim(COALESCE(_reference, '')), ''), gross_kobo = _gross, net_kobo = _net WHERE id = _id;
  PERFORM public.referral_log('withdrawal.paid', 'withdrawal', _id::text, jsonb_build_object('net_kobo', _net, 'reference', _reference));
END $$;
REVOKE ALL ON FUNCTION public.admin_review_referral_withdrawal(uuid, text, text), public.admin_mark_referral_withdrawal_paid(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_review_referral_withdrawal(uuid, text, text), public.admin_mark_referral_withdrawal_paid(uuid, text) TO authenticated;

-- ---------- admin: rates, affiliates, accounts ----------
CREATE OR REPLACE FUNCTION public.admin_update_referral_settings(_enabled boolean, _hold_days integer, _min_kobo bigint, _fee_kobo bigint, _methods text[], _terms text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.referral_require_admin();
  IF _hold_days NOT BETWEEN 0 AND 365 OR _min_kobo < 0 OR _fee_kobo < 0 OR COALESCE(array_length(_methods, 1), 0) = 0 THEN RAISE EXCEPTION 'Check the settings values'; END IF;
  UPDATE public.referral_settings SET programme_enabled = _enabled, hold_days = _hold_days, min_withdrawal_kobo = _min_kobo, withdrawal_fee_kobo = _fee_kobo,
    withdrawal_methods = _methods, terms_note = NULLIF(btrim(COALESCE(_terms, '')), ''), updated_at = now(), updated_by = auth.uid() WHERE id;
  PERFORM public.referral_log('settings.updated', 'settings', 'referral', jsonb_build_object('enabled', _enabled, 'hold_days', _hold_days, 'min_kobo', _min_kobo, 'fee_kobo', _fee_kobo));
END $$;

-- New default rate: applies to referrals made AFTER this moment. Existing referral cohorts keep the rate they were given.
CREATE OR REPLACE FUNCTION public.admin_set_default_rate(_rate numeric, _name text, _reason text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _old numeric; _id uuid;
BEGIN
  PERFORM public.referral_require_admin();
  IF _rate IS NULL OR _rate < 0 OR _rate > 100 THEN RAISE EXCEPTION 'Rate must be between 0 and 100'; END IF;
  IF _reason IS NULL OR char_length(btrim(_reason)) < 3 THEN RAISE EXCEPTION 'Give a reason'; END IF;
  SELECT rate_percent INTO _old FROM public.referral_agreements WHERE is_default;
  UPDATE public.referral_agreements SET is_default = false WHERE is_default;
  INSERT INTO public.referral_agreements (name, rate_percent, is_default, note, created_by)
  VALUES (COALESCE(NULLIF(btrim(_name), ''), 'Standard ' || _rate || '%'), _rate, true, btrim(_reason), auth.uid()) RETURNING id INTO _id;
  INSERT INTO public.referral_rate_changes (actor_id, scope, agreement_id, old_rate, new_rate, affected_vendors, reason) VALUES (auth.uid(), 'default', _id, _old, _rate, 0, btrim(_reason));
  PERFORM public.referral_log('rate.default_changed', 'agreement', _id::text, jsonb_build_object('old', _old, 'new', _rate, 'reason', _reason));
  RETURN _id;
END $$;

-- Change the rate of an EXISTING cohort on purpose. Recorded with the reason and the number of vendors affected.
-- Commissions already created keep their rate; only commissions on future payments use the new one.
CREATE OR REPLACE FUNCTION public.admin_change_cohort_rate(_agreement uuid, _new_rate numeric, _reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _old public.referral_agreements%ROWTYPE; _new uuid; _n integer;
BEGIN
  PERFORM public.referral_require_admin();
  IF _new_rate IS NULL OR _new_rate < 0 OR _new_rate > 100 THEN RAISE EXCEPTION 'Rate must be between 0 and 100'; END IF;
  IF _reason IS NULL OR char_length(btrim(_reason)) < 3 THEN RAISE EXCEPTION 'Give a reason'; END IF;
  SELECT * INTO _old FROM public.referral_agreements WHERE id = _agreement FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Agreement not found'; END IF;
  INSERT INTO public.referral_agreements (name, rate_percent, is_default, note, created_by)
  VALUES (_old.name || ' (revised to ' || _new_rate || '%)', _new_rate, false, btrim(_reason), auth.uid()) RETURNING id INTO _new;
  UPDATE public.referral_attributions SET agreement_id = _new, rate_percent = _new_rate WHERE agreement_id = _agreement;
  GET DIAGNOSTICS _n = ROW_COUNT;
  UPDATE public.referral_profiles SET agreement_id = _new WHERE agreement_id = _agreement;
  INSERT INTO public.referral_rate_changes (actor_id, scope, agreement_id, old_rate, new_rate, affected_vendors, reason) VALUES (auth.uid(), 'cohort', _new, _old.rate_percent, _new_rate, _n, btrim(_reason));
  PERFORM public.referral_log('rate.cohort_changed', 'agreement', _agreement::text, jsonb_build_object('old', _old.rate_percent, 'new', _new_rate, 'vendors', _n, 'reason', _reason));
  RETURN jsonb_build_object('new_agreement', _new, 'affected_vendors', _n);
END $$;

CREATE OR REPLACE FUNCTION public.admin_create_affiliate(_email text, _code text, _display_name text, _rate numeric, _bio text, _public_page boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _norm text := upper(btrim(COALESCE(_code, ''))); _agr uuid; _existing public.referral_profiles%ROWTYPE; _final text;
BEGIN
  PERFORM public.referral_require_admin();
  IF _norm !~ '^[A-Z0-9_-]{4,32}$' THEN RAISE EXCEPTION 'Code must be 4 to 32 letters, numbers, - or _'; END IF;
  IF _rate IS NULL OR _rate < 0 OR _rate > 100 THEN RAISE EXCEPTION 'Rate must be between 0 and 100'; END IF;
  SELECT id INTO _uid FROM auth.users WHERE lower(email) = lower(btrim(_email)) LIMIT 1;
  IF _uid IS NULL THEN RAISE EXCEPTION 'No account found for that email. Ask them to create an account first.'; END IF;
  INSERT INTO public.referral_agreements (name, rate_percent, note, created_by) VALUES ('Affiliate ' || _norm, _rate, 'Special affiliate agreement', auth.uid()) RETURNING id INTO _agr;
  SELECT * INTO _existing FROM public.referral_profiles WHERE user_id = _uid;
  IF FOUND THEN
    _final := CASE WHEN _existing.code <> _norm AND EXISTS (SELECT 1 FROM public.referral_attributions WHERE referrer_user_id = _uid) THEN _existing.code ELSE _norm END;
    UPDATE public.referral_profiles SET code = _final, kind = 'affiliate', display_name = btrim(_display_name), bio = NULLIF(btrim(COALESCE(_bio, '')), ''),
      public_page_enabled = COALESCE(_public_page, false), agreement_id = _agr WHERE user_id = _uid;
  ELSE
    _final := _norm;
    INSERT INTO public.referral_profiles (user_id, code, kind, display_name, bio, public_page_enabled, agreement_id, created_by)
    VALUES (_uid, _norm, 'affiliate', btrim(_display_name), NULLIF(btrim(COALESCE(_bio, '')), ''), COALESCE(_public_page, false), _agr, auth.uid());
  END IF;
  INSERT INTO public.referral_rate_changes (actor_id, scope, agreement_id, old_rate, new_rate, affected_vendors, reason) VALUES (auth.uid(), 'affiliate', _agr, NULL, _rate, 0, 'Affiliate created: ' || _final);
  PERFORM public.referral_log('affiliate.saved', 'user', _uid::text, jsonb_build_object('code', _final, 'rate', _rate));
  RETURN jsonb_build_object('user_id', _uid, 'code', _final);
END $$;

CREATE OR REPLACE FUNCTION public.admin_set_referral_status(_user uuid, _status text, _reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.referral_require_admin();
  IF _status NOT IN ('active', 'suspended') THEN RAISE EXCEPTION 'Bad status'; END IF;
  IF _reason IS NULL OR char_length(btrim(_reason)) < 3 THEN RAISE EXCEPTION 'Give a reason'; END IF;
  UPDATE public.referral_profiles SET status = _status WHERE user_id = _user;
  IF NOT FOUND THEN RAISE EXCEPTION 'Referrer not found'; END IF;
  IF _status = 'active' THEN
    UPDATE public.referral_commissions SET status = 'available' WHERE referrer_user_id = _user AND status = 'approved';
  END IF;
  PERFORM public.referral_log('referrer.' || _status, 'user', _user::text, jsonb_build_object('reason', _reason));
END $$;

-- Reverse one commission by hand (for example after finding fraud). If it was already paid out it becomes a debt.
CREATE OR REPLACE FUNCTION public.admin_reverse_commission(_id uuid, _reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _c public.referral_commissions%ROWTYPE;
BEGIN
  PERFORM public.referral_require_admin();
  IF _reason IS NULL OR char_length(btrim(_reason)) < 3 THEN RAISE EXCEPTION 'Give a reason'; END IF;
  SELECT * INTO _c FROM public.referral_commissions WHERE id = _id FOR UPDATE;
  IF NOT FOUND OR _c.status = 'reversed' THEN RAISE EXCEPTION 'Nothing to reverse'; END IF;
  IF _c.status = 'paid' THEN
    INSERT INTO public.referral_adjustments (referrer_user_id, commission_id, amount_kobo, reason) VALUES (_c.referrer_user_id, _c.id, _c.amount_kobo, btrim(_reason)) ON CONFLICT DO NOTHING;
  END IF;
  UPDATE public.referral_commissions SET status = 'reversed', reversed_at = now(), reversal_reason = btrim(_reason) WHERE id = _id;
  PERFORM public.referral_log('commission.reversed', 'commission', _id::text, jsonb_build_object('reason', _reason, 'was', _c.status));
END $$;

CREATE OR REPLACE FUNCTION public.admin_approve_commission_now(_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.referral_require_admin();
  UPDATE public.referral_commissions c SET status = 'available', available_at = LEAST(available_at, now())
   FROM public.referral_profiles p WHERE c.id = _id AND c.status = 'pending' AND p.user_id = c.referrer_user_id AND p.status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'Only a pending commission of an active referrer can be approved early'; END IF;
  PERFORM public.referral_log('commission.approved_early', 'commission', _id::text, '{}'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.admin_update_referral_settings(boolean, integer, bigint, bigint, text[], text), public.admin_set_default_rate(numeric, text, text),
  public.admin_change_cohort_rate(uuid, numeric, text), public.admin_create_affiliate(text, text, text, numeric, text, boolean),
  public.admin_set_referral_status(uuid, text, text), public.admin_reverse_commission(uuid, text), public.admin_approve_commission_now(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_referral_settings(boolean, integer, bigint, bigint, text[], text), public.admin_set_default_rate(numeric, text, text),
  public.admin_change_cohort_rate(uuid, numeric, text), public.admin_create_affiliate(text, text, text, numeric, text, boolean),
  public.admin_set_referral_status(uuid, text, text), public.admin_reverse_commission(uuid, text), public.admin_approve_commission_now(uuid) TO authenticated;

-- ---------- admin: reports ----------
CREATE OR REPLACE FUNCTION public.admin_referrers() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.referral_require_admin();
  RETURN (SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.earned_kobo DESC), '[]'::jsonb) FROM (
    SELECT p.user_id, p.display_name, p.code, p.kind, p.status, p.public_page_enabled,
           (SELECT rate_percent FROM public.referral_agreements WHERE id = COALESCE(p.agreement_id, public.referral_default_agreement())) AS rate_percent,
           (SELECT count(*) FROM public.referral_attributions a WHERE a.referrer_user_id = p.user_id) AS vendors_referred,
           (SELECT count(*) FROM public.referral_attributions a WHERE a.referrer_user_id = p.user_id AND public.effective_supplier_plan(a.vendor_id) <> 'free') AS active_vendors,
           COALESCE((SELECT sum(base_amount_kobo) FROM public.referral_commissions c WHERE c.referrer_user_id = p.user_id AND c.status <> 'reversed'), 0) AS revenue_kobo,
           COALESCE((SELECT sum(amount_kobo) FROM public.referral_commissions c WHERE c.referrer_user_id = p.user_id AND c.status <> 'reversed'), 0) AS earned_kobo,
           COALESCE((SELECT sum(amount_kobo) FROM public.referral_commissions c WHERE c.referrer_user_id = p.user_id AND c.status IN ('pending', 'approved', 'available', 'processing')), 0) AS owed_kobo,
           COALESCE((SELECT sum(amount_kobo) FROM public.referral_commissions c WHERE c.referrer_user_id = p.user_id AND c.status = 'paid'), 0) AS paid_kobo
    FROM public.referral_profiles p
    WHERE EXISTS (SELECT 1 FROM public.referral_attributions a WHERE a.referrer_user_id = p.user_id) OR p.kind = 'affiliate'
  ) t);
END $$;

CREATE OR REPLACE FUNCTION public.admin_referral_overview() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _attr int; _paid_vendors int; _renewing int;
BEGIN
  PERFORM public.referral_require_admin();
  SELECT count(*) INTO _attr FROM public.referral_attributions;
  SELECT count(DISTINCT a.vendor_id) INTO _paid_vendors FROM public.referral_attributions a
    WHERE EXISTS (SELECT 1 FROM public.supplier_membership_payments x WHERE x.vendor_id = a.vendor_id AND x.status = 'success');
  SELECT count(*) INTO _renewing FROM (SELECT x.vendor_id FROM public.supplier_membership_payments x
    JOIN public.referral_attributions a ON a.vendor_id = x.vendor_id WHERE x.status = 'success' GROUP BY x.vendor_id HAVING count(*) >= 2) r;
  RETURN jsonb_build_object(
    'vendors_acquired', _attr, 'vendors_paying', _paid_vendors,
    'conversion_percent', CASE WHEN _attr = 0 THEN 0 ELSE round(100.0 * _paid_vendors / _attr, 1) END,
    'renewal_percent', CASE WHEN _paid_vendors = 0 THEN 0 ELSE round(100.0 * _renewing / _paid_vendors, 1) END,
    'revenue_kobo', COALESCE((SELECT sum(base_amount_kobo) FROM public.referral_commissions WHERE status <> 'reversed'), 0),
    'generated_kobo', COALESCE((SELECT sum(amount_kobo) FROM public.referral_commissions WHERE status <> 'reversed'), 0),
    'pending_kobo', COALESCE((SELECT sum(amount_kobo) FROM public.referral_commissions WHERE status = 'pending'), 0),
    'approved_kobo', COALESCE((SELECT sum(amount_kobo) FROM public.referral_commissions WHERE status IN ('approved', 'available')), 0),
    'processing_kobo', COALESCE((SELECT sum(amount_kobo) FROM public.referral_commissions WHERE status = 'processing'), 0),
    'paid_kobo', COALESCE((SELECT sum(amount_kobo) FROM public.referral_commissions WHERE status = 'paid'), 0),
    'reversed_kobo', COALESCE((SELECT sum(amount_kobo) FROM public.referral_commissions WHERE status = 'reversed'), 0),
    'debts_kobo', COALESCE((SELECT sum(amount_kobo) FROM public.referral_adjustments WHERE settled_at IS NULL), 0),
    'liability_kobo', COALESCE((SELECT sum(amount_kobo) FROM public.referral_commissions WHERE status IN ('pending', 'approved', 'available', 'processing')), 0),
    'cohorts', (SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.liability_kobo DESC), '[]'::jsonb) FROM (
        SELECT g.name, g.rate_percent,
               (SELECT count(*) FROM public.referral_attributions a WHERE a.agreement_id = g.id) AS vendors,
               COALESCE((SELECT sum(c.amount_kobo) FROM public.referral_commissions c WHERE c.agreement_id = g.id AND c.status IN ('pending', 'approved', 'available', 'processing')), 0) AS liability_kobo
        FROM public.referral_agreements g
        WHERE EXISTS (SELECT 1 FROM public.referral_attributions a WHERE a.agreement_id = g.id)) t)
  );
END $$;

CREATE OR REPLACE FUNCTION public.admin_referral_commissions(_status text DEFAULT NULL, _limit integer DEFAULT 200) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.referral_require_admin();
  RETURN (SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb) FROM (
    SELECT c.id, rp.display_name AS referrer, rp.code, v.store_name AS vendor, pay.paystack_reference AS payment_reference, c.plan_slug,
           c.base_amount_kobo, c.rate_percent, c.amount_kobo, c.status, c.available_at, c.created_at, c.reversal_reason
    FROM public.referral_commissions c
    JOIN public.referral_profiles rp ON rp.user_id = c.referrer_user_id
    JOIN public.vendors v ON v.id = c.vendor_id
    JOIN public.supplier_membership_payments pay ON pay.id = c.payment_id
    WHERE _status IS NULL OR c.status = _status
    ORDER BY c.created_at DESC LIMIT LEAST(GREATEST(COALESCE(_limit, 200), 1), 1000)) t);
END $$;

CREATE OR REPLACE FUNCTION public.admin_referral_withdrawals() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.referral_require_admin();
  RETURN (SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb) FROM (
    SELECT w.id, rp.display_name AS referrer, rp.code, w.gross_kobo, w.debt_kobo, w.fee_kobo, w.net_kobo, w.status, w.requested_at, w.reviewed_at, w.paid_at,
           w.payout_reference, w.admin_note, w.account
    FROM public.referral_withdrawals w JOIN public.referral_profiles rp ON rp.user_id = w.referrer_user_id
    ORDER BY CASE w.status WHEN 'requested' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, w.requested_at DESC LIMIT 500) t);
END $$;

CREATE OR REPLACE FUNCTION public.admin_vendor_subscriptions() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.referral_require_admin();
  RETURN (SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb) FROM (
    SELECT v.id AS vendor_id, v.store_name, m.plan_slug, pl.name AS plan_name, m.status, m.period_started_at, m.expires_at,
           (m.expires_at IS NOT NULL AND m.expires_at > now()) AS is_current, c.name AS category,
           COALESCE((SELECT sum(amount_kobo) FROM public.supplier_membership_payments x WHERE x.vendor_id = v.id AND x.status = 'success'), 0) AS paid_kobo
    FROM public.vendor_memberships m
    JOIN public.vendors v ON v.id = m.vendor_id
    JOIN public.supplier_membership_plans pl ON pl.slug = m.plan_slug
    LEFT JOIN public.categories c ON c.id = v.pricing_category_id
    WHERE m.plan_slug <> 'free'
    ORDER BY m.expires_at DESC NULLS LAST LIMIT 1000) t);
END $$;
REVOKE ALL ON FUNCTION public.admin_referrers(), public.admin_referral_overview(), public.admin_referral_commissions(text, integer),
  public.admin_referral_withdrawals(), public.admin_vendor_subscriptions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_referrers(), public.admin_referral_overview(), public.admin_referral_commissions(text, integer),
  public.admin_referral_withdrawals(), public.admin_vendor_subscriptions() TO authenticated;

-- =====================================================================
-- PHASE 3b: lifetime vendor referral programme: tables, attribution, commission created inside payment confirmation,
-- and reversal when a subscription payment is refunded or charged back.
-- Money safety:
--   * a commission exists only for a payment the server verified, one per payment (UNIQUE), calculated from the verified amount;
--   * it sits in 'pending' for the holding period (admin setting, default 30 days) before it can be withdrawn;
--   * a refund or chargeback reverses it; if it was already paid out, the amount is recorded as a debt that is taken off the
--     referrer's next payout. So the platform cannot be left out of pocket by a refund after a subscription.
-- Run after 20261116010000_subscription_pricing.sql. Safe to run twice.
-- =====================================================================

-- ---------- settings (one row) ----------
CREATE TABLE IF NOT EXISTS public.referral_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  programme_enabled boolean NOT NULL DEFAULT true,
  hold_days integer NOT NULL DEFAULT 30 CHECK (hold_days BETWEEN 0 AND 365),
  min_withdrawal_kobo bigint NOT NULL DEFAULT 500000 CHECK (min_withdrawal_kobo >= 0),
  withdrawal_fee_kobo bigint NOT NULL DEFAULT 0 CHECK (withdrawal_fee_kobo >= 0),
  withdrawal_methods text[] NOT NULL DEFAULT ARRAY['bank_transfer'],
  terms_note text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
INSERT INTO public.referral_settings (id) VALUES (true) ON CONFLICT DO NOTHING;

-- ---------- agreements: the rate a referral cohort earns ----------
CREATE TABLE IF NOT EXISTS public.referral_agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 80),
  rate_percent numeric(5,2) NOT NULL CHECK (rate_percent >= 0 AND rate_percent <= 100),
  is_default boolean NOT NULL DEFAULT false,
  effective_from timestamptz NOT NULL DEFAULT now(),
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_referral_agreement_default ON public.referral_agreements (is_default) WHERE is_default;
INSERT INTO public.referral_agreements (name, rate_percent, is_default, note)
SELECT 'Standard 13%', 13, true, 'Starting agreement'
WHERE NOT EXISTS (SELECT 1 FROM public.referral_agreements);

-- ---------- referrer profiles (one per user) ----------
CREATE TABLE IF NOT EXISTS public.referral_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE CHECK (code ~ '^[A-Z0-9_-]{4,32}$'),
  kind text NOT NULL DEFAULT 'standard' CHECK (kind IN ('standard', 'affiliate')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 2 AND 80),
  bio text CHECK (bio IS NULL OR char_length(bio) <= 400),
  avatar_url text,
  agreement_id uuid REFERENCES public.referral_agreements(id),   -- NULL = the current default agreement
  public_page_enabled boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Bank details for payouts: private to the referrer and admins.
CREATE TABLE IF NOT EXISTS public.referral_payout_accounts (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  bank_name text NOT NULL CHECK (char_length(bank_name) BETWEEN 2 AND 80),
  account_number text NOT NULL CHECK (account_number ~ '^[0-9]{10}$'),
  account_name text NOT NULL CHECK (char_length(account_name) BETWEEN 2 AND 120),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------- attribution: one permanent referrer per vendor ----------
CREATE TABLE IF NOT EXISTS public.referral_attributions (
  vendor_id uuid PRIMARY KEY REFERENCES public.vendors(id) ON DELETE CASCADE,
  referrer_user_id uuid NOT NULL REFERENCES auth.users(id),
  code text NOT NULL,
  agreement_id uuid NOT NULL REFERENCES public.referral_agreements(id),
  rate_percent numeric(5,2) NOT NULL CHECK (rate_percent >= 0 AND rate_percent <= 100),   -- the cohort rate, locked at attribution
  source text NOT NULL CHECK (source IN ('link', 'code_signup', 'code_manual', 'admin')),
  attributed_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz                                                                     -- set by the first qualifying payment
);
CREATE INDEX IF NOT EXISTS idx_referral_attr_referrer ON public.referral_attributions (referrer_user_id, attributed_at DESC);

-- ---------- commission ledger ----------
CREATE TABLE IF NOT EXISTS public.referral_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL UNIQUE REFERENCES public.supplier_membership_payments(id),     -- one commission per payment, ever
  vendor_id uuid NOT NULL REFERENCES public.vendors(id),
  referrer_user_id uuid NOT NULL REFERENCES auth.users(id),
  agreement_id uuid REFERENCES public.referral_agreements(id),
  plan_slug text NOT NULL,
  base_amount_kobo bigint NOT NULL CHECK (base_amount_kobo > 0),
  rate_percent numeric(5,2) NOT NULL,
  amount_kobo bigint NOT NULL CHECK (amount_kobo >= 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'available', 'processing', 'paid', 'reversed')),
  available_at timestamptz NOT NULL,
  withdrawal_id uuid,
  reversal_reason text,
  reversed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_referral_comm_referrer ON public.referral_commissions (referrer_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_referral_comm_status ON public.referral_commissions (status, available_at);

-- Debts: money already paid out for a commission that was later reversed. Taken off the next payout.
CREATE TABLE IF NOT EXISTS public.referral_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_user_id uuid NOT NULL REFERENCES auth.users(id),
  commission_id uuid REFERENCES public.referral_commissions(id),
  amount_kobo bigint NOT NULL CHECK (amount_kobo > 0),     -- the amount owed back
  reason text NOT NULL,
  settled_withdrawal_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_referral_adj_commission ON public.referral_adjustments (commission_id) WHERE commission_id IS NOT NULL;

-- ---------- rate-change history and audit ----------
CREATE TABLE IF NOT EXISTS public.referral_rate_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid,
  scope text NOT NULL CHECK (scope IN ('default', 'cohort', 'affiliate')),
  agreement_id uuid REFERENCES public.referral_agreements(id),
  old_rate numeric(5,2),
  new_rate numeric(5,2) NOT NULL,
  affected_vendors integer NOT NULL DEFAULT 0,
  reason text NOT NULL
);
CREATE TABLE IF NOT EXISTS public.referral_audit_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_referral_audit_at ON public.referral_audit_logs (at DESC);

-- ---------- RLS ----------
ALTER TABLE public.referral_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_payout_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_attributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_rate_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read referral settings" ON public.referral_settings;
CREATE POLICY "Read referral settings" ON public.referral_settings FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Admins read agreements" ON public.referral_agreements;
CREATE POLICY "Admins read agreements" ON public.referral_agreements FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR id IN (SELECT agreement_id FROM public.referral_profiles WHERE user_id = auth.uid()) OR is_default);
DROP POLICY IF EXISTS "Own referral profile" ON public.referral_profiles;
CREATE POLICY "Own referral profile" ON public.referral_profiles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Own payout account" ON public.referral_payout_accounts;
CREATE POLICY "Own payout account" ON public.referral_payout_accounts FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Referrer or vendor reads attribution" ON public.referral_attributions;
CREATE POLICY "Referrer or vendor reads attribution" ON public.referral_attributions FOR SELECT TO authenticated
  USING (referrer_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin')
         OR EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = vendor_id AND v.user_id = auth.uid()));
DROP POLICY IF EXISTS "Referrer reads own commissions" ON public.referral_commissions;
CREATE POLICY "Referrer reads own commissions" ON public.referral_commissions FOR SELECT TO authenticated
  USING (referrer_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Referrer reads own adjustments" ON public.referral_adjustments;
CREATE POLICY "Referrer reads own adjustments" ON public.referral_adjustments FOR SELECT TO authenticated
  USING (referrer_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Admins read rate changes" ON public.referral_rate_changes;
CREATE POLICY "Admins read rate changes" ON public.referral_rate_changes FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Admins read referral audit" ON public.referral_audit_logs;
CREATE POLICY "Admins read referral audit" ON public.referral_audit_logs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Nobody writes these tables directly from the app: every change goes through the functions below.
REVOKE ALL ON public.referral_settings, public.referral_agreements, public.referral_profiles, public.referral_payout_accounts,
  public.referral_attributions, public.referral_commissions, public.referral_adjustments, public.referral_rate_changes,
  public.referral_audit_logs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.referral_settings, public.referral_agreements, public.referral_profiles, public.referral_payout_accounts,
  public.referral_attributions, public.referral_commissions, public.referral_adjustments, public.referral_rate_changes,
  public.referral_audit_logs TO authenticated;

-- ---------- helpers ----------
CREATE OR REPLACE FUNCTION public.referral_log(_action text, _entity_type text, _entity_id text, _details jsonb) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.referral_audit_logs (actor_id, action, entity_type, entity_id, details) VALUES (auth.uid(), _action, _entity_type, _entity_id, COALESCE(_details, '{}'::jsonb));
$$;
REVOKE ALL ON FUNCTION public.referral_log(text, text, text, jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.referral_default_agreement() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT id FROM public.referral_agreements WHERE is_default LIMIT 1; $$;
REVOKE ALL ON FUNCTION public.referral_default_agreement() FROM PUBLIC, anon, authenticated;

-- A referrer's own page: creates their code the first time they open the referral screen.
CREATE OR REPLACE FUNCTION public.get_or_create_my_referral_profile() RETURNS public.referral_profiles
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _row public.referral_profiles%ROWTYPE; _name text; _base text; _code text; _i int := 0;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _row FROM public.referral_profiles WHERE user_id = _uid;
  IF FOUND THEN RETURN _row; END IF;
  SELECT COALESCE(NULLIF(btrim(v.store_name), ''), NULLIF(btrim(p.full_name), ''), 'Member') INTO _name
  FROM (SELECT 1) x LEFT JOIN public.vendors v ON v.user_id = _uid LEFT JOIN public.profiles p ON p.user_id = _uid LIMIT 1;
  _base := upper(regexp_replace(COALESCE(_name, 'MEMBER'), '[^A-Za-z0-9]', '', 'g'));
  IF char_length(_base) < 3 THEN _base := 'ITHUB'; END IF;
  _base := left(_base, 10);
  LOOP
    _code := _base || upper(substr(md5(random()::text || clock_timestamp()::text || _uid::text), 1, 5));
    BEGIN
      INSERT INTO public.referral_profiles (user_id, code, display_name) VALUES (_uid, _code, left(COALESCE(_name, 'Member'), 80)) RETURNING * INTO _row;
      RETURN _row;
    EXCEPTION WHEN unique_violation THEN
      _i := _i + 1;
      IF _i > 8 THEN RAISE EXCEPTION 'Could not create a referral code, try again'; END IF;
    END;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.get_or_create_my_referral_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_or_create_my_referral_profile() TO authenticated;

-- What the public landing page may show: name, short bio and picture of an ACTIVE referrer who turned the page on. Nothing else.
CREATE OR REPLACE FUNCTION public.referral_public_profile(_code text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('code', code, 'display_name', display_name, 'bio', bio, 'avatar_url', avatar_url)
  FROM public.referral_profiles
  WHERE code = upper(btrim(_code)) AND status = 'active' AND public_page_enabled
    AND (SELECT programme_enabled FROM public.referral_settings WHERE id);
$$;
REVOKE ALL ON FUNCTION public.referral_public_profile(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.referral_public_profile(text) TO anon, authenticated;

-- A vendor attaches a referral code to their own account. Allowed only while they have never made a successful subscription
-- payment and have no referrer yet. Self-referral is refused. The agreement (rate) is locked in at this moment.
CREATE OR REPLACE FUNCTION public.apply_referral_code(_code text, _source text DEFAULT 'code_manual') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _vendor uuid; _p public.referral_profiles%ROWTYPE; _agr public.referral_agreements%ROWTYPE; _norm text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _source NOT IN ('link', 'code_signup', 'code_manual') THEN _source := 'code_manual'; END IF;
  IF NOT (SELECT programme_enabled FROM public.referral_settings WHERE id) THEN RETURN jsonb_build_object('ok', false, 'reason', 'programme_off'); END IF;
  SELECT id INTO _vendor FROM public.vendors WHERE user_id = _uid LIMIT 1;
  IF _vendor IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'no_vendor'); END IF;
  PERFORM pg_advisory_xact_lock(hashtext('referral_attr:' || _vendor::text));
  IF EXISTS (SELECT 1 FROM public.referral_attributions WHERE vendor_id = _vendor) THEN RETURN jsonb_build_object('ok', false, 'reason', 'already_referred'); END IF;
  IF EXISTS (SELECT 1 FROM public.supplier_membership_payments WHERE vendor_id = _vendor AND status IN ('success', 'refunded', 'chargeback')) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_paid');
  END IF;
  _norm := upper(btrim(COALESCE(_code, '')));
  SELECT * INTO _p FROM public.referral_profiles WHERE code = _norm AND status = 'active';
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'invalid_code'); END IF;
  IF _p.user_id = _uid THEN RETURN jsonb_build_object('ok', false, 'reason', 'self_referral'); END IF;
  SELECT * INTO _agr FROM public.referral_agreements WHERE id = COALESCE(_p.agreement_id, public.referral_default_agreement());
  INSERT INTO public.referral_attributions (vendor_id, referrer_user_id, code, agreement_id, rate_percent, source)
  VALUES (_vendor, _p.user_id, _p.code, _agr.id, _agr.rate_percent, _source);
  PERFORM public.referral_log('attribution.created', 'vendor', _vendor::text, jsonb_build_object('referrer', _p.user_id, 'code', _p.code, 'rate', _agr.rate_percent, 'source', _source));
  RETURN jsonb_build_object('ok', true, 'referrer_name', _p.display_name);
END $$;
REVOKE ALL ON FUNCTION public.apply_referral_code(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_referral_code(text, text) TO authenticated;

-- Block self-attribution at the table level too (covers any future writer).
CREATE OR REPLACE FUNCTION public.referral_attr_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = NEW.vendor_id AND v.user_id = NEW.referrer_user_id) THEN
      RAISE EXCEPTION 'A vendor cannot refer themselves';
    END IF;
  ELSIF NEW.referrer_user_id IS DISTINCT FROM OLD.referrer_user_id AND OLD.locked_at IS NOT NULL THEN
    RAISE EXCEPTION 'The referrer cannot change after the first qualifying payment';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_referral_attr_guard ON public.referral_attributions;
CREATE TRIGGER trg_referral_attr_guard BEFORE INSERT OR UPDATE ON public.referral_attributions FOR EACH ROW EXECUTE FUNCTION public.referral_attr_guard();

-- ---------- commission for one verified payment (internal) ----------
CREATE OR REPLACE FUNCTION public.referral_create_commission(_payment_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _pay public.supplier_membership_payments%ROWTYPE; _a public.referral_attributions%ROWTYPE; _s public.referral_settings%ROWTYPE; _prof public.referral_profiles%ROWTYPE; _amt bigint;
BEGIN
  SELECT * INTO _pay FROM public.supplier_membership_payments WHERE id = _payment_id;
  IF NOT FOUND OR _pay.status <> 'success' OR _pay.amount_kobo <= 0 THEN RETURN; END IF;
  SELECT * INTO _s FROM public.referral_settings WHERE id;
  IF NOT _s.programme_enabled THEN RETURN; END IF;
  SELECT * INTO _a FROM public.referral_attributions WHERE vendor_id = _pay.vendor_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT * INTO _prof FROM public.referral_profiles WHERE user_id = _a.referrer_user_id;
  IF NOT FOUND OR _prof.status <> 'active' THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = _pay.vendor_id AND v.user_id = _a.referrer_user_id) THEN RETURN; END IF;
  _amt := floor(_pay.amount_kobo * _a.rate_percent / 100.0);
  INSERT INTO public.referral_commissions (payment_id, vendor_id, referrer_user_id, agreement_id, plan_slug, base_amount_kobo, rate_percent, amount_kobo, status, available_at)
  VALUES (_pay.id, _pay.vendor_id, _a.referrer_user_id, _a.agreement_id, _pay.plan_slug, _pay.amount_kobo, _a.rate_percent, _amt, 'pending', now() + make_interval(days => _s.hold_days))
  ON CONFLICT (payment_id) DO NOTHING;
  IF _a.locked_at IS NULL THEN UPDATE public.referral_attributions SET locked_at = now() WHERE vendor_id = _a.vendor_id; END IF;
  INSERT INTO public.referral_audit_logs (actor_id, action, entity_type, entity_id, details)
  VALUES (NULL, 'commission.created', 'payment', _pay.id::text, jsonb_build_object('referrer', _a.referrer_user_id, 'base_kobo', _pay.amount_kobo, 'rate', _a.rate_percent, 'amount_kobo', _amt));
END $$;
REVOKE ALL ON FUNCTION public.referral_create_commission(uuid) FROM PUBLIC, anon, authenticated;

-- ad credit given by a plan, recorded once per payment in the existing ad wallet ledger
ALTER TABLE public.ad_wallet_ledger ADD COLUMN IF NOT EXISTS membership_payment_id uuid REFERENCES public.supplier_membership_payments(id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ad_ledger_membership ON public.ad_wallet_ledger (membership_payment_id, (amount_kobo > 0)) WHERE membership_payment_id IS NOT NULL;

-- ---------- payment confirmation: the existing function, extended ----------
-- Same checks as before (reference, amount and currency must match the checkout record; repeats are harmless), plus:
-- renewal extends from the current expiry, new/upgrade start now; the plan's ad credit is added once; the referral
-- commission is created in the same transaction. Either everything happens or nothing does.
CREATE OR REPLACE FUNCTION public.finalize_supplier_membership_payment(_reference text, _amount_kobo bigint, _currency text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _payment public.supplier_membership_payments%ROWTYPE;
  _plan public.supplier_membership_plans%ROWTYPE;
  _period_start timestamptz := now();
  _current_expiry timestamptz;
  _current_plan text;
  _expires_at timestamptz;
BEGIN
  SELECT * INTO _payment FROM public.supplier_membership_payments WHERE paystack_reference = _reference FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF _payment.status = 'success' THEN RETURN true; END IF;
  IF _payment.status <> 'pending' OR _payment.amount_kobo <> _amount_kobo OR _payment.currency <> _currency THEN RETURN false; END IF;

  PERFORM 1 FROM public.vendors WHERE id = _payment.vendor_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT * INTO _plan FROM public.supplier_membership_plans WHERE slug = _payment.plan_slug;

  UPDATE public.supplier_membership_payments SET status = 'success', paid_at = now() WHERE id = _payment.id;

  SELECT plan_slug, expires_at INTO _current_plan, _current_expiry FROM public.vendor_memberships WHERE vendor_id = _payment.vendor_id AND status = 'active' FOR UPDATE;
  IF _payment.kind = 'renewal' AND _current_plan = _payment.plan_slug AND _current_expiry IS NOT NULL AND _current_expiry > now() THEN
    _period_start := _current_expiry;
  END IF;
  _expires_at := _period_start + make_interval(days => _payment.period_days);

  INSERT INTO public.vendor_memberships (vendor_id, plan_slug, status, period_started_at, expires_at, updated_at)
  VALUES (_payment.vendor_id, _payment.plan_slug, 'active', _period_start, _expires_at, now())
  ON CONFLICT (vendor_id) DO UPDATE SET plan_slug = EXCLUDED.plan_slug, status = 'active',
    period_started_at = EXCLUDED.period_started_at, expires_at = EXCLUDED.expires_at, updated_at = now();

  IF COALESCE(_plan.ad_credit_kobo, 0) > 0 THEN
    INSERT INTO public.ad_wallet_ledger (vendor_id, kind, amount_kobo, note, membership_payment_id)
    VALUES (_payment.vendor_id, 'adjustment', _plan.ad_credit_kobo, 'Advertising credit from your ' || _plan.name || ' plan', _payment.id)
    ON CONFLICT DO NOTHING;
  END IF;

  PERFORM public.referral_create_commission(_payment.id);
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.finalize_supplier_membership_payment(text, bigint, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_supplier_membership_payment(text, bigint, text) TO service_role;

-- ---------- refund / chargeback of a subscription payment ----------
-- Marks the payment, removes the paid entitlements it gave (only if it is the vendor's latest successful payment, so an older
-- refund cannot cancel a newer plan), takes back unspent ad credit, and reverses the commission.
CREATE OR REPLACE FUNCTION public.reverse_subscription_payment(_payment_id uuid, _new_status text, _reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _pay public.supplier_membership_payments%ROWTYPE; _c public.referral_commissions%ROWTYPE; _credit bigint; _bal bigint; _take bigint;
  _commission_result text := 'none';
BEGIN
  IF _new_status NOT IN ('refunded', 'chargeback') THEN RAISE EXCEPTION 'Bad status'; END IF;
  SELECT * INTO _pay FROM public.supplier_membership_payments WHERE id = _payment_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF _pay.status IN ('refunded', 'chargeback') THEN RETURN jsonb_build_object('ok', true, 'already', true); END IF;
  IF _pay.status <> 'success' THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_successful'); END IF;

  UPDATE public.supplier_membership_payments SET status = _new_status, refunded_at = now(), refund_reason = left(COALESCE(_reason, ''), 300) WHERE id = _pay.id;

  -- The paid time this payment gave ends only if it was the vendor's newest successful payment and the vendor is still on its plan.
  -- An older refund never cancels a newer plan, and an admin-granted plan on a different tier is left alone.
  IF NOT EXISTS (SELECT 1 FROM public.supplier_membership_payments WHERE vendor_id = _pay.vendor_id AND status = 'success' AND paid_at > _pay.paid_at) THEN
    UPDATE public.vendor_memberships SET expires_at = now(), updated_at = now()
     WHERE vendor_id = _pay.vendor_id AND plan_slug <> 'free' AND plan_slug = _pay.plan_slug;
  END IF;

  SELECT amount_kobo INTO _credit FROM public.ad_wallet_ledger WHERE membership_payment_id = _pay.id AND amount_kobo > 0;
  IF _credit IS NOT NULL THEN
    _bal := public.ad_wallet_balance_kobo(_pay.vendor_id);
    _take := GREATEST(LEAST(_credit, _bal), 0);
    IF _take > 0 THEN
      INSERT INTO public.ad_wallet_ledger (vendor_id, kind, amount_kobo, note, membership_payment_id)
      VALUES (_pay.vendor_id, 'adjustment', -_take, 'Advertising credit taken back: subscription payment ' || _new_status, _pay.id) ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  SELECT * INTO _c FROM public.referral_commissions WHERE payment_id = _pay.id FOR UPDATE;
  IF FOUND AND _c.status <> 'reversed' THEN
    IF _c.status = 'paid' THEN
      INSERT INTO public.referral_adjustments (referrer_user_id, commission_id, amount_kobo, reason)
      VALUES (_c.referrer_user_id, _c.id, _c.amount_kobo, 'Subscription payment ' || _new_status || ': commission already paid out') ON CONFLICT DO NOTHING;
      _commission_result := 'debt_recorded';
    ELSE
      _commission_result := 'reversed';
    END IF;
    UPDATE public.referral_commissions SET status = 'reversed', reversed_at = now(), reversal_reason = 'Subscription payment ' || _new_status WHERE id = _c.id;
  END IF;

  PERFORM public.referral_log('payment.' || _new_status, 'payment', _pay.id::text, jsonb_build_object('reason', _reason, 'commission', _commission_result));
  RETURN jsonb_build_object('ok', true, 'commission', _commission_result);
END $$;
REVOKE ALL ON FUNCTION public.reverse_subscription_payment(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_subscription_payment(uuid, text, text) TO service_role;

-- By payment reference (the webhook knows the reference, not our id).
CREATE OR REPLACE FUNCTION public.reverse_subscription_payment_by_reference(_reference text, _new_status text, _reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid;
BEGIN
  SELECT id INTO _id FROM public.supplier_membership_payments WHERE paystack_reference = _reference;
  IF _id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  RETURN public.reverse_subscription_payment(_id, _new_status, _reason);
END $$;
REVOKE ALL ON FUNCTION public.reverse_subscription_payment_by_reference(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_subscription_payment_by_reference(text, text, text) TO service_role;

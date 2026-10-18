-- =====================================================================
-- SUPPLIER ONBOARDING + COMMISSION POLICY
--   1. Super admins (only they can change commission settings or publish terms)
--   2. Audit log for commission settings, supplier rates and agreements
--   3. Commission settings: free period (calendar months) + default rate (1.5%)
--   4. Versioned Supplier Terms, and an immutable record of each supplier's acceptance
--   5. Activation date + free-period end, set automatically when a supplier is approved
--   6. Commission calculated on the server, on the PRODUCT SUBTOTAL ONLY (no VAT, no shipping)
--   7. Registration only completes through register_supplier(), which requires acceptance
--   8. Admin / supplier reporting functions
-- Run it AFTER the finance, BNPL, security and order-integrity migrations. Safe to run twice.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Super admins
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.super_admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_at timestamptz NOT NULL DEFAULT now(),
  granted_by uuid
);
ALTER TABLE public.super_admins ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_super_admin(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _uid IS NOT NULL AND EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = _uid);
$$;
REVOKE ALL ON FUNCTION public.is_super_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.am_i_super_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_super_admin(auth.uid());
$$;
REVOKE ALL ON FUNCTION public.am_i_super_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.am_i_super_admin() TO authenticated;

DROP POLICY IF EXISTS "Super admins can see super admins" ON public.super_admins;
CREATE POLICY "Super admins can see super admins" ON public.super_admins
  FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()));

-- Everyone who is an admin today becomes a super admin, so nobody is locked out.
-- Afterwards only a super admin can add or remove one (set_super_admin below).
INSERT INTO public.super_admins (user_id)
SELECT user_id FROM public.user_roles WHERE role = 'admin'
ON CONFLICT (user_id) DO NOTHING;

-- ---------------------------------------------------------------------
-- 2. Audit log
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.commission_audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid,                 -- NULL = the system, a migration, or the SQL editor
  entity text NOT NULL,
  entity_id text,
  action text NOT NULL,
  old_value jsonb,
  new_value jsonb
);
CREATE INDEX IF NOT EXISTS idx_commission_audit_at ON public.commission_audit_log (at DESC);
ALTER TABLE public.commission_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read the audit log" ON public.commission_audit_log;
CREATE POLICY "Admins read the audit log" ON public.commission_audit_log
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
-- No insert / update / delete policies: rows are written only by the triggers below.

CREATE OR REPLACE FUNCTION public.log_audit(_entity text, _entity_id text, _action text, _old jsonb, _new jsonb)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.commission_audit_log (actor_id, entity, entity_id, action, old_value, new_value)
  VALUES (auth.uid(), _entity, _entity_id, _action, _old, _new);
$$;
REVOKE ALL ON FUNCTION public.log_audit(text, text, text, jsonb, jsonb) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. Settings: free period + default rate
-- ---------------------------------------------------------------------
ALTER TABLE public.finance_settings
  ADD COLUMN IF NOT EXISTS free_period_months integer NOT NULL DEFAULT 2;
ALTER TABLE public.finance_settings DROP CONSTRAINT IF EXISTS finance_settings_free_period_months_check;
ALTER TABLE public.finance_settings ADD CONSTRAINT finance_settings_free_period_months_check
  CHECK (free_period_months BETWEEN 0 AND 24);

ALTER TABLE public.finance_settings ALTER COLUMN default_commission_percent SET DEFAULT 1.5;
UPDATE public.finance_settings SET default_commission_percent = 1.5 WHERE id = true AND default_commission_percent <> 1.5;

-- Only a super admin may change these two values (the SQL editor and edge functions are allowed).
CREATE OR REPLACE FUNCTION public.guard_commission_settings()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (NEW.default_commission_percent IS DISTINCT FROM OLD.default_commission_percent
      OR NEW.free_period_months IS DISTINCT FROM OLD.free_period_months)
     AND auth.uid() IS NOT NULL AND NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only a super admin can change the commission settings';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_commission_settings ON public.finance_settings;
CREATE TRIGGER trg_guard_commission_settings BEFORE UPDATE ON public.finance_settings
  FOR EACH ROW EXECUTE FUNCTION public.guard_commission_settings();

CREATE OR REPLACE FUNCTION public.audit_commission_settings()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.default_commission_percent IS DISTINCT FROM OLD.default_commission_percent
     OR NEW.free_period_months IS DISTINCT FROM OLD.free_period_months THEN
    PERFORM public.log_audit('commission_settings', 'global', 'update',
      jsonb_build_object('default_commission_percent', OLD.default_commission_percent, 'free_period_months', OLD.free_period_months),
      jsonb_build_object('default_commission_percent', NEW.default_commission_percent, 'free_period_months', NEW.free_period_months));
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_audit_commission_settings ON public.finance_settings;
CREATE TRIGGER trg_audit_commission_settings AFTER UPDATE ON public.finance_settings
  FOR EACH ROW EXECUTE FUNCTION public.audit_commission_settings();

CREATE OR REPLACE FUNCTION public.set_commission_settings(_default_percent numeric, _free_months integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN RAISE EXCEPTION 'Only a super admin can change the commission settings'; END IF;
  IF _default_percent IS NULL OR _default_percent < 0 OR _default_percent > 100 THEN
    RAISE EXCEPTION 'The commission rate must be between 0 and 100';
  END IF;
  IF _free_months IS NULL OR _free_months < 0 OR _free_months > 24 THEN
    RAISE EXCEPTION 'The free period must be between 0 and 24 months';
  END IF;
  UPDATE public.finance_settings
  SET default_commission_percent = round(_default_percent, 2), free_period_months = _free_months
  WHERE id = true;
END $$;
REVOKE ALL ON FUNCTION public.set_commission_settings(numeric, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_commission_settings(numeric, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_super_admin(_user_id uuid, _on boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN RAISE EXCEPTION 'Only a super admin can do this'; END IF;
  IF _on THEN
    IF NOT public.has_role(_user_id, 'admin') THEN RAISE EXCEPTION 'That user is not an admin yet'; END IF;
    INSERT INTO public.super_admins (user_id, granted_by) VALUES (_user_id, auth.uid()) ON CONFLICT (user_id) DO NOTHING;
    PERFORM public.log_audit('super_admin', _user_id::text, 'granted', NULL, jsonb_build_object('user_id', _user_id));
  ELSE
    IF (SELECT count(*) FROM public.super_admins) <= 1 THEN RAISE EXCEPTION 'There must always be at least one super admin'; END IF;
    DELETE FROM public.super_admins WHERE user_id = _user_id;
    PERFORM public.log_audit('super_admin', _user_id::text, 'revoked', jsonb_build_object('user_id', _user_id), NULL);
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.set_super_admin(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_super_admin(uuid, boolean) TO authenticated;

-- ---------------------------------------------------------------------
-- 4. Supplier Terms (versioned) and acceptance records
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.supplier_terms_versions (
  version text PRIMARY KEY,
  title text NOT NULL,
  body text NOT NULL,                      -- may contain {{FREE_PERIOD_MONTHS}} and {{COMMISSION_PERCENT}}
  published_at timestamptz NOT NULL DEFAULT now(),
  published_by uuid,
  is_current boolean NOT NULL DEFAULT false
);
CREATE UNIQUE INDEX IF NOT EXISTS one_current_supplier_terms ON public.supplier_terms_versions ((true)) WHERE is_current;
ALTER TABLE public.supplier_terms_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read terms versions" ON public.supplier_terms_versions;
CREATE POLICY "Admins read terms versions" ON public.supplier_terms_versions
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
-- Everyone else reads the current terms through get_current_supplier_terms().

CREATE TABLE IF NOT EXISTS public.supplier_agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  terms_version text NOT NULL REFERENCES public.supplier_terms_versions(version),
  terms_body text NOT NULL,                -- the exact text the supplier saw, numbers filled in
  free_period_months integer NOT NULL,
  commission_percent numeric(5,2) NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_supplier_agreements_vendor ON public.supplier_agreements (vendor_id, accepted_at DESC);
ALTER TABLE public.supplier_agreements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Suppliers read own agreements" ON public.supplier_agreements;
CREATE POLICY "Suppliers read own agreements" ON public.supplier_agreements
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Admins read agreements" ON public.supplier_agreements;
CREATE POLICY "Admins read agreements" ON public.supplier_agreements
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
-- No write policies: an acceptance can never be edited or deleted from the app.

-- One row per supplier: acceptance + activation + free-period end. Private to the supplier and admins.
CREATE TABLE IF NOT EXISTS public.supplier_commercial_terms (
  vendor_id uuid PRIMARY KEY REFERENCES public.vendors(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  terms_version text,
  terms_accepted_at timestamptz,
  activated_at timestamptz,
  commission_free_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.supplier_commercial_terms ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Suppliers read own commercial terms" ON public.supplier_commercial_terms;
CREATE POLICY "Suppliers read own commercial terms" ON public.supplier_commercial_terms
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Admins read commercial terms" ON public.supplier_commercial_terms;
CREATE POLICY "Admins read commercial terms" ON public.supplier_commercial_terms
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
DROP TRIGGER IF EXISTS update_supplier_commercial_terms_updated_at ON public.supplier_commercial_terms;
CREATE TRIGGER update_supplier_commercial_terms_updated_at BEFORE UPDATE ON public.supplier_commercial_terms
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Fill the numbers into the terms text.
CREATE OR REPLACE FUNCTION public.render_supplier_terms(_body text, _months integer, _percent numeric)
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT replace(
           replace(_body, '{{FREE_PERIOD_MONTHS}}', _months::text),
           '{{COMMISSION_PERCENT}}', trim(trailing '.' from to_char(_percent, 'FM990.99')));
$$;

-- First version of the terms. DRAFT: have a Nigerian lawyer review it before you rely on it.
INSERT INTO public.supplier_terms_versions (version, title, body, is_current)
VALUES ('1.0', 'Supplier Terms and Commission Agreement', $terms$
SUPPLIER TERMS AND COMMISSION AGREEMENT (version 1.0)

1. Parties and purpose
These terms are between you (the "Supplier") and the marketplace operator (the "Platform"). They apply when you register as a supplier and sell through the Platform.

2. Eligibility and verification
You confirm that the business and bank details you give are accurate, that you are entitled to sell the goods you list, and that you will provide any verification documents we ask for. We may approve, reject or suspend a supplier account at our discretion.

3. Commission
(a) Commission-free period. Your first {{FREE_PERIOD_MONTHS}} calendar months of selling are commission-free. The period starts on the date and time your supplier account is approved and activated by the Platform, and ends on the same date and time {{FREE_PERIOD_MONTHS}} calendar months later (Nigeria time, WAT). During this period the Platform charges 0% commission.
(b) Commission after the free period. After the free period ends, the Platform deducts a commission of {{COMMISSION_PERCENT}}% from every successful transaction.
(c) What commission is charged on. Commission is calculated only on the product subtotal of the items you sold. It is not charged on VAT or on shipping fees.
(d) Which rate applies. The rate that applies to an order is the rate in force at the time the buyer's payment succeeds.
(e) Reversals. If an order is cancelled or refunded, the commission on the refunded items is reversed.
(f) Changes. The Platform may change the commission rate or the length of the free period for future periods by giving you at least 30 days' notice. Any change does not affect orders already paid for.

4. Payments and payouts
Buyers pay the Platform through Paystack. The Platform holds the money until delivery is confirmed by the buyer, or confirmed automatically after the period set in your dashboard, plus a short protection period, and then pays you the amount due (the product subtotal less any commission) by bank transfer. Payment processing fees charged by Paystack are borne by the Platform and are not deducted from your payout. The Platform may withhold or reverse a payout where an order is disputed, refunded or cancelled, or where it was paid in error.

5. Orders, delivery and disputes
You must ship paid orders promptly and enter the courier and waybill or tracking number in your dashboard. Buyers may confirm receipt or report a problem. If a dispute is raised the Platform will review it and may release the money to you or refund the buyer.

6. Taxes
Prices shown to buyers are product prices to which VAT is added at checkout. You remain responsible for your own tax obligations.

7. Product standards
You may sell only genuine, lawful goods that you are entitled to sell. Counterfeit, stolen or prohibited goods lead to immediate suspension, withheld payouts and refunds to affected buyers.

8. Suspension and termination
Either party may end this agreement by written notice. The Platform may suspend or terminate your account for breach of these terms. Amounts properly due for completed orders remain payable, less any refunds, reversals or sums you owe the Platform.

9. Changes to these terms
We may publish a new version of these terms. You will be asked to accept the new version, and your acceptance of each version is recorded.

10. Governing law
These terms are governed by the laws of the Federal Republic of Nigeria.
$terms$, true)
ON CONFLICT (version) DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_current_supplier_terms()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'version', t.version,
    'title', t.title,
    'body', public.render_supplier_terms(t.body, fs.free_period_months, fs.default_commission_percent),
    'free_period_months', fs.free_period_months,
    'commission_percent', fs.default_commission_percent
  )
  FROM public.supplier_terms_versions t CROSS JOIN public.finance_settings fs
  WHERE t.is_current AND fs.id = true;
$$;
REVOKE ALL ON FUNCTION public.get_current_supplier_terms() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_current_supplier_terms() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.publish_supplier_terms(_version text, _title text, _body text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN RAISE EXCEPTION 'Only a super admin can publish terms'; END IF;
  IF length(trim(COALESCE(_version, ''))) = 0 OR length(trim(COALESCE(_title, ''))) = 0 OR length(trim(COALESCE(_body, ''))) < 50 THEN
    RAISE EXCEPTION 'Give the terms a version, a title and the full text';
  END IF;
  IF EXISTS (SELECT 1 FROM public.supplier_terms_versions WHERE version = trim(_version)) THEN
    RAISE EXCEPTION 'Version % already exists. Use a new version number.', trim(_version);
  END IF;
  UPDATE public.supplier_terms_versions SET is_current = false WHERE is_current;
  INSERT INTO public.supplier_terms_versions (version, title, body, published_by, is_current)
  VALUES (trim(_version), trim(_title), _body, auth.uid(), true);
END $$;
REVOKE ALL ON FUNCTION public.publish_supplier_terms(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_supplier_terms(text, text, text) TO authenticated;

-- ---------------------------------------------------------------------
-- 5. Approval needs an accepted agreement; approval sets the activation date and free-period end
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.vendor_require_terms_before_approval()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.is_approved AND NOT COALESCE(OLD.is_approved, false) AND auth.uid() IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.supplier_commercial_terms
                   WHERE vendor_id = NEW.id AND terms_accepted_at IS NOT NULL) THEN
      RAISE EXCEPTION 'This supplier has not accepted the Supplier Terms and Commission Policy yet, so they cannot be approved. Ask them to open their dashboard and accept it.';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_vendor_require_terms ON public.vendors;
CREATE TRIGGER trg_vendor_require_terms BEFORE UPDATE OF is_approved ON public.vendors
  FOR EACH ROW EXECUTE FUNCTION public.vendor_require_terms_before_approval();

-- Calendar months in Nigeria time (Africa/Lagos has no daylight saving). Month-end dates clamp
-- the way a calendar does (31 Dec + 2 months = 28 Feb), and the free period never starts twice.
CREATE OR REPLACE FUNCTION public.vendor_activate_on_approval()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _months integer; _now timestamptz := now();
BEGIN
  SELECT free_period_months INTO _months FROM public.finance_settings WHERE id = true;
  INSERT INTO public.supplier_commercial_terms (vendor_id, user_id, activated_at, commission_free_until)
  VALUES (NEW.id, NEW.user_id, _now,
          ((_now AT TIME ZONE 'Africa/Lagos') + make_interval(months => COALESCE(_months, 0))) AT TIME ZONE 'Africa/Lagos')
  ON CONFLICT (vendor_id) DO UPDATE
    SET activated_at = EXCLUDED.activated_at,
        commission_free_until = EXCLUDED.commission_free_until
    WHERE public.supplier_commercial_terms.activated_at IS NULL;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_vendor_activate_insert ON public.vendors;
CREATE TRIGGER trg_vendor_activate_insert AFTER INSERT ON public.vendors
  FOR EACH ROW WHEN (NEW.is_approved) EXECUTE FUNCTION public.vendor_activate_on_approval();
DROP TRIGGER IF EXISTS trg_vendor_activate_update ON public.vendors;
CREATE TRIGGER trg_vendor_activate_update AFTER UPDATE OF is_approved ON public.vendors
  FOR EACH ROW WHEN (NEW.is_approved AND NOT COALESCE(OLD.is_approved, false))
  EXECUTE FUNCTION public.vendor_activate_on_approval();

-- A supplier can no longer change their own commission rate (the old guard missed it).
CREATE OR REPLACE FUNCTION public.guard_vendor_privileged_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin') THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.is_approved := false;
    NEW.paystack_subaccount_code := NULL;
    NEW.commission_percent := NULL;
  ELSE
    NEW.is_approved := OLD.is_approved;
    NEW.paystack_subaccount_code := OLD.paystack_subaccount_code;
    NEW.commission_percent := OLD.commission_percent;
    NEW.user_id := OLD.user_id;
  END IF;
  RETURN NEW;
END $$;

-- ---------------------------------------------------------------------
-- 6. The commission engine
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.vendor_commission_rate(_vendor uuid, _at timestamptz DEFAULT now())
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
           WHEN t.commission_free_until IS NOT NULL AND _at < t.commission_free_until THEN 0::numeric
           ELSE COALESCE(v.commission_percent, fs.default_commission_percent)
         END
  FROM public.finance_settings fs
  LEFT JOIN public.vendors v ON v.id = _vendor
  LEFT JOIN public.supplier_commercial_terms t ON t.vendor_id = _vendor
  WHERE fs.id = true;
$$;
REVOKE ALL ON FUNCTION public.vendor_commission_rate(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vendor_commission_rate(uuid, timestamptz) TO service_role;

-- When an order line is created, the rate is worked out here, whatever create_order passed in.
-- gross_amount is price x quantity: the PRODUCT SUBTOTAL. VAT and shipping are never part of it.
CREATE OR REPLACE FUNCTION public.payable_apply_commission()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _rate numeric;
BEGIN
  _rate := COALESCE(public.vendor_commission_rate(NEW.vendor_id, now()), 0);
  NEW.commission_percent := _rate;
  NEW.commission_amount := round(NEW.gross_amount * _rate / 100, 2);
  NEW.vendor_net := NEW.gross_amount - NEW.commission_amount - COALESCE(NEW.bnpl_fee_share, 0);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_payable_apply_commission ON public.order_item_payables;
CREATE TRIGGER trg_payable_apply_commission BEFORE INSERT ON public.order_item_payables
  FOR EACH ROW EXECUTE FUNCTION public.payable_apply_commission();

-- The commission is locked in again at the moment payment succeeds ("every successful
-- transaction"), so an order created inside the free period but paid after it ends is charged.
-- It runs once per payment: a duplicate webhook does not change the status again.
CREATE OR REPLACE FUNCTION public.recompute_commission_on_paid()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.order_item_payables p
  SET commission_percent = r.rate,
      commission_amount = round(p.gross_amount * r.rate / 100, 2),
      vendor_net = p.gross_amount - round(p.gross_amount * r.rate / 100, 2) - COALESCE(p.bnpl_fee_share, 0)
  FROM (
    SELECT d.vendor_id, COALESCE(public.vendor_commission_rate(d.vendor_id, now()), 0) AS rate
    FROM (SELECT DISTINCT vendor_id FROM public.order_item_payables WHERE order_id = NEW.id) d
  ) r
  WHERE p.order_id = NEW.id AND p.vendor_id = r.vendor_id
    AND (p.payout_status = 'held' OR (OLD.status = 'cancelled' AND p.payout_status = 'refunded'));
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_recompute_commission_on_paid ON public.orders;
CREATE TRIGGER trg_recompute_commission_on_paid AFTER UPDATE OF status ON public.orders
  FOR EACH ROW WHEN (NEW.status = 'paid' AND OLD.status IS DISTINCT FROM 'paid')
  EXECUTE FUNCTION public.recompute_commission_on_paid();

-- Money-breakdown columns: VAT, shipping and Paystack's fee are kept apart from the product subtotal.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipping_fee numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_shipping_fee_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_shipping_fee_check CHECK (shipping_fee >= 0);
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS paystack_fee numeric(14,2);
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS paid_at timestamptz;

-- ---------------------------------------------------------------------
-- 7. Registration only completes through this function, and only with acceptance
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.register_supplier(_payload jsonb, _terms_version text, _accepted boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _t public.supplier_terms_versions%ROWTYPE;
  _fs public.finance_settings%ROWTYPE;
  _vendor uuid;
  _cats text[];
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _accepted IS NOT TRUE THEN
    RAISE EXCEPTION 'You must accept the Supplier Terms and Commission Policy to register.';
  END IF;

  SELECT * INTO _t FROM public.supplier_terms_versions WHERE is_current;
  IF NOT FOUND OR _t.version IS DISTINCT FROM _terms_version THEN
    RAISE EXCEPTION 'The Supplier Terms were updated. Please reload the page and review them again.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.vendors WHERE user_id = _uid) THEN
    RAISE EXCEPTION 'You already have a supplier account.';
  END IF;
  IF length(trim(COALESCE(_payload->>'store_name', ''))) = 0 THEN RAISE EXCEPTION 'Business name is required'; END IF;

  _cats := ARRAY(SELECT jsonb_array_elements_text(COALESCE(_payload->'product_categories', '[]'::jsonb)));

  INSERT INTO public.vendors
    (user_id, store_name, store_description, phone, whatsapp_number, company_name, address, logo_url,
     business_type, product_categories, is_approved)
  VALUES
    (_uid, trim(_payload->>'store_name'), NULLIF(_payload->>'store_description', ''), _payload->>'phone',
     _payload->>'whatsapp_number', NULLIF(_payload->>'company_name', ''), _payload->>'address',
     NULLIF(_payload->>'logo_url', ''), _payload->>'business_type',
     CASE WHEN array_length(_cats, 1) IS NULL THEN NULL ELSE _cats END, false)
  RETURNING id INTO _vendor;

  INSERT INTO public.user_roles (user_id, role) VALUES (_uid, 'vendor') ON CONFLICT DO NOTHING;

  SELECT * INTO _fs FROM public.finance_settings WHERE id = true;
  INSERT INTO public.supplier_agreements (vendor_id, user_id, terms_version, terms_body, free_period_months, commission_percent)
  VALUES (_vendor, _uid, _t.version,
          public.render_supplier_terms(_t.body, _fs.free_period_months, _fs.default_commission_percent),
          _fs.free_period_months, _fs.default_commission_percent);

  INSERT INTO public.supplier_commercial_terms (vendor_id, user_id, terms_version, terms_accepted_at)
  VALUES (_vendor, _uid, _t.version, now());

  RETURN _vendor;
END $$;
REVOKE ALL ON FUNCTION public.register_supplier(jsonb, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_supplier(jsonb, text, boolean) TO authenticated;

-- Suppliers who registered before this feature (or when new terms are published) accept here.
CREATE OR REPLACE FUNCTION public.accept_supplier_terms(_terms_version text, _accepted boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _vendor uuid;
  _t public.supplier_terms_versions%ROWTYPE;
  _fs public.finance_settings%ROWTYPE;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _accepted IS NOT TRUE THEN RAISE EXCEPTION 'You must tick the box to accept the terms.'; END IF;
  SELECT id INTO _vendor FROM public.vendors WHERE user_id = _uid;
  IF _vendor IS NULL THEN RAISE EXCEPTION 'No supplier account found'; END IF;
  SELECT * INTO _t FROM public.supplier_terms_versions WHERE is_current;
  IF NOT FOUND OR _t.version IS DISTINCT FROM _terms_version THEN
    RAISE EXCEPTION 'The Supplier Terms were updated. Please reload the page and review them again.';
  END IF;

  SELECT * INTO _fs FROM public.finance_settings WHERE id = true;
  INSERT INTO public.supplier_agreements (vendor_id, user_id, terms_version, terms_body, free_period_months, commission_percent)
  VALUES (_vendor, _uid, _t.version,
          public.render_supplier_terms(_t.body, _fs.free_period_months, _fs.default_commission_percent),
          _fs.free_period_months, _fs.default_commission_percent);

  INSERT INTO public.supplier_commercial_terms (vendor_id, user_id, terms_version, terms_accepted_at)
  VALUES (_vendor, _uid, _t.version, now())
  ON CONFLICT (vendor_id) DO UPDATE SET terms_version = EXCLUDED.terms_version, terms_accepted_at = EXCLUDED.terms_accepted_at;
END $$;
REVOKE ALL ON FUNCTION public.accept_supplier_terms(text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_supplier_terms(text, boolean) TO authenticated;

-- Close the direct routes: from now on a supplier account (and its vendor role) is created only by
-- register_supplier(), so nobody can register without accepting the agreement.
DO $drop$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname, tablename FROM pg_policies
           WHERE schemaname = 'public' AND tablename IN ('vendors', 'user_roles') AND cmd = 'INSERT' LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END
$drop$;

-- ---------------------------------------------------------------------
-- 8. Audit triggers
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_vendor_commission_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.commission_percent IS DISTINCT FROM OLD.commission_percent THEN
    PERFORM public.log_audit('supplier_commission_override', NEW.id::text, 'update',
      jsonb_build_object('commission_percent', OLD.commission_percent, 'store', NEW.store_name),
      jsonb_build_object('commission_percent', NEW.commission_percent, 'store', NEW.store_name));
  END IF;
  IF NEW.is_approved IS DISTINCT FROM OLD.is_approved THEN
    PERFORM public.log_audit('supplier_approval', NEW.id::text, CASE WHEN NEW.is_approved THEN 'approved' ELSE 'unapproved' END,
      jsonb_build_object('is_approved', OLD.is_approved, 'store', NEW.store_name),
      jsonb_build_object('is_approved', NEW.is_approved, 'store', NEW.store_name));
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_audit_vendor_commission ON public.vendors;
CREATE TRIGGER trg_audit_vendor_commission AFTER UPDATE ON public.vendors
  FOR EACH ROW EXECUTE FUNCTION public.audit_vendor_commission_changes();

CREATE OR REPLACE FUNCTION public.audit_commercial_terms()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.log_audit('supplier_terms_status', NEW.vendor_id::text, lower(TG_OP),
    CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) - 'updated_at' END,
    to_jsonb(NEW) - 'updated_at');
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_audit_commercial_terms ON public.supplier_commercial_terms;
CREATE TRIGGER trg_audit_commercial_terms AFTER INSERT OR UPDATE ON public.supplier_commercial_terms
  FOR EACH ROW EXECUTE FUNCTION public.audit_commercial_terms();

CREATE OR REPLACE FUNCTION public.audit_agreement_events()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_TABLE_NAME = 'supplier_agreements' THEN
    PERFORM public.log_audit('supplier_agreement', NEW.vendor_id::text, 'accepted', NULL,
      jsonb_build_object('terms_version', NEW.terms_version, 'free_period_months', NEW.free_period_months,
                         'commission_percent', NEW.commission_percent));
  ELSE
    PERFORM public.log_audit('supplier_terms', NEW.version, 'published', NULL,
      jsonb_build_object('version', NEW.version, 'title', NEW.title));
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_audit_agreement ON public.supplier_agreements;
CREATE TRIGGER trg_audit_agreement AFTER INSERT ON public.supplier_agreements
  FOR EACH ROW EXECUTE FUNCTION public.audit_agreement_events();
DROP TRIGGER IF EXISTS trg_audit_terms_version ON public.supplier_terms_versions;
CREATE TRIGGER trg_audit_terms_version AFTER INSERT ON public.supplier_terms_versions
  FOR EACH ROW EXECUTE FUNCTION public.audit_agreement_events();

-- ---------------------------------------------------------------------
-- 9. Reports
-- ---------------------------------------------------------------------
-- The supplier's own view of their commission position.
CREATE OR REPLACE FUNCTION public.my_commission_status()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _vendor uuid; _t public.supplier_commercial_terms%ROWTYPE; _cur text;
BEGIN
  SELECT id INTO _vendor FROM public.vendors WHERE user_id = auth.uid();
  IF _vendor IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO _t FROM public.supplier_commercial_terms WHERE vendor_id = _vendor;
  SELECT version INTO _cur FROM public.supplier_terms_versions WHERE is_current;
  RETURN jsonb_build_object(
    'terms_version', _t.terms_version,
    'terms_accepted_at', _t.terms_accepted_at,
    'activated_at', _t.activated_at,
    'commission_free_until', _t.commission_free_until,
    'current_rate', public.vendor_commission_rate(_vendor, now()),
    'rate_after_free_period', public.vendor_commission_rate(_vendor, 'infinity'::timestamptz),
    'in_free_period', (_t.commission_free_until IS NOT NULL AND now() < _t.commission_free_until),
    'current_terms_version', _cur,
    'needs_acceptance', (_t.terms_version IS DISTINCT FROM _cur)
  );
END $$;
REVOKE ALL ON FUNCTION public.my_commission_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_commission_status() TO authenticated;

-- Admin: one row per supplier.
CREATE OR REPLACE FUNCTION public.admin_supplier_commission_overview()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Not allowed'; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'vendor_id', v.id,
      'store_name', v.store_name,
      'is_approved', COALESCE(v.is_approved, false),
      'activated_at', t.activated_at,
      'commission_free_until', t.commission_free_until,
      'current_rate', public.vendor_commission_rate(v.id, now()),
      'in_free_period', (t.commission_free_until IS NOT NULL AND now() < t.commission_free_until),
      'override_percent', v.commission_percent,
      'terms_version', t.terms_version,
      'terms_accepted_at', t.terms_accepted_at,
      'sales', COALESCE(s.sales, 0),
      'commission', COALESCE(s.commission, 0),
      'orders', COALESCE(s.orders, 0)
    ) ORDER BY v.created_at DESC)
    FROM public.vendors v
    LEFT JOIN public.supplier_commercial_terms t ON t.vendor_id = v.id
    LEFT JOIN LATERAL (
      SELECT sum(p.gross_amount) AS sales, sum(p.commission_amount) AS commission, count(DISTINCT p.order_id) AS orders
      FROM public.order_item_payables p JOIN public.orders o ON o.id = p.order_id
      WHERE p.vendor_id = v.id AND p.payout_status <> 'refunded'
        AND o.status IN ('paid','processing','shipped','delivered')
    ) s ON true
  ), '[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.admin_supplier_commission_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_supplier_commission_overview() TO authenticated;

-- Admin: one supplier's transactions, with product subtotal, VAT and commission kept apart.
CREATE OR REPLACE FUNCTION public.admin_vendor_transactions(_vendor_id uuid, _limit integer DEFAULT 100)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Not allowed'; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(x.j ORDER BY x.created_at DESC) FROM (
      SELECT o.created_at,
        jsonb_build_object(
          'order_id', o.id,
          'created_at', o.created_at,
          'order_status', o.status,
          'payout_status', string_agg(DISTINCT p.payout_status, ', '),
          'product_subtotal', sum(p.gross_amount),
          'vat_on_subtotal', round(sum(p.gross_amount) * 0.075, 2),
          'commission_percent', max(p.commission_percent),
          'commission_amount', sum(p.commission_amount),
          'bnpl_fee_share', sum(p.bnpl_fee_share),
          'supplier_net', sum(p.vendor_net),
          'refunded', bool_and(p.payout_status = 'refunded')
        ) AS j
      FROM public.order_item_payables p JOIN public.orders o ON o.id = p.order_id
      WHERE p.vendor_id = _vendor_id AND o.status <> 'pending'
      GROUP BY o.id
      ORDER BY o.created_at DESC
      LIMIT LEAST(GREATEST(COALESCE(_limit, 100), 1), 500)
    ) x
  ), '[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.admin_vendor_transactions(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_vendor_transactions(uuid, integer) TO authenticated;

-- Admin: where the money went. VAT, shipping, commission and Paystack fees are separate lines.
CREATE OR REPLACE FUNCTION public.admin_platform_earnings(_from timestamptz, _to timestamptz)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _res jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Not allowed'; END IF;
  WITH paid AS (
    SELECT o.id, o.total, o.shipping_fee, COALESCE(o.bnpl_fee, 0) AS bnpl_fee, pay.fee
    FROM public.orders o
    JOIN LATERAL (
      SELECT min(COALESCE(paid_at, created_at)) AS paid_at, sum(COALESCE(paystack_fee, 0)) AS fee
      FROM public.payments WHERE order_id = o.id AND status = 'success'
    ) pay ON pay.paid_at IS NOT NULL
    WHERE pay.paid_at >= _from AND pay.paid_at < _to
  ),
  items AS (
    SELECT oi.order_id, sum(oi.price * oi.quantity) AS subtotal
    FROM public.order_items oi JOIN paid ON paid.id = oi.order_id GROUP BY oi.order_id
  ),
  comm AS (
    SELECT sum(p.commission_amount) FILTER (WHERE p.payout_status <> 'refunded') AS earned,
           sum(p.commission_amount) FILTER (WHERE p.payout_status = 'refunded') AS reversed
    FROM public.order_item_payables p JOIN paid ON paid.id = p.order_id
  )
  SELECT jsonb_build_object(
    'orders', (SELECT count(*) FROM paid),
    'gross_collected', COALESCE((SELECT sum(total) FROM paid), 0),
    'product_subtotal', COALESCE((SELECT sum(subtotal) FROM items), 0),
    'vat_collected', COALESCE((SELECT sum(paid.total - COALESCE(items.subtotal, 0) - paid.shipping_fee - paid.bnpl_fee)
                               FROM paid LEFT JOIN items ON items.order_id = paid.id), 0),
    'shipping_collected', COALESCE((SELECT sum(shipping_fee) FROM paid), 0),
    'commission_earned', COALESCE((SELECT earned FROM comm), 0),
    'commission_reversed', COALESCE((SELECT reversed FROM comm), 0),
    'paystack_fees', COALESCE((SELECT sum(fee) FROM paid), 0)
  ) INTO _res;

  RETURN _res || jsonb_build_object(
    'net_platform_earnings', (_res->>'commission_earned')::numeric - (_res->>'paystack_fees')::numeric);
END $$;
REVOKE ALL ON FUNCTION public.admin_platform_earnings(timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_platform_earnings(timestamptz, timestamptz) TO authenticated;

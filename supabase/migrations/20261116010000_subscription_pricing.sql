-- =====================================================================
-- PHASE 3a: subscription pricing, categories, upgrades, admin grants.
-- Extends the existing membership system (supplier_membership_plans, vendor_memberships,
-- supplier_membership_payments). Nothing is dropped and no existing record is deleted.
-- Run after 20261115050000..20261115070000 (plan tiers). Safe to run twice.
-- =====================================================================

-- 1. Tier names. Slugs stay (code and badges use them); only the display names change, and only if still the defaults.
UPDATE public.supplier_membership_plans SET name = 'Starter'    WHERE slug = 'silver'  AND name = 'Silver';
UPDATE public.supplier_membership_plans SET name = 'Growth'     WHERE slug = 'premium' AND name = 'Premium';
UPDATE public.supplier_membership_plans SET name = 'Enterprise' WHERE slug = 'gold'    AND name = 'Gold';
-- Diamond is retired: the platform now has Free, Starter, Growth and Enterprise. Nobody can be on it yet (no purchases exist).
UPDATE public.supplier_membership_plans SET is_active = false, purchase_enabled = false
 WHERE slug = 'diamond' AND NOT EXISTS (SELECT 1 FROM public.vendor_memberships WHERE plan_slug = 'diamond');

-- 2. Advertising credit a plan gives the vendor when a payment for it succeeds (goes into the ad wallet).
ALTER TABLE public.supplier_membership_plans ADD COLUMN IF NOT EXISTS ad_credit_kobo bigint NOT NULL DEFAULT 0 CHECK (ad_credit_kobo >= 0);

-- 3. Prices per plan, billing period and category. Categories are the marketplace's own categories, so new ones work automatically.
--    category_id NULL = the default price for every category. A category row with is_active = false means the plan is not offered there.
CREATE TABLE IF NOT EXISTS public.plan_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_slug text NOT NULL REFERENCES public.supplier_membership_plans(slug) ON DELETE CASCADE,
  billing_period text NOT NULL CHECK (billing_period IN ('monthly', 'annual')),
  category_id uuid REFERENCES public.categories(id) ON DELETE CASCADE,
  price_kobo bigint NOT NULL CHECK (price_kobo >= 10000),
  period_days integer NOT NULL CHECK (period_days BETWEEN 1 AND 366),
  is_active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_plan_prices
  ON public.plan_prices (plan_slug, billing_period, COALESCE(category_id, '00000000-0000-0000-0000-000000000000'::uuid));
ALTER TABLE public.plan_prices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can read active plan prices" ON public.plan_prices;
CREATE POLICY "Anyone can read active plan prices" ON public.plan_prices FOR SELECT TO anon, authenticated USING (is_active OR public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Admins manage plan prices" ON public.plan_prices;
CREATE POLICY "Admins manage plan prices" ON public.plan_prices FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
REVOKE ALL ON public.plan_prices FROM PUBLIC, anon;
GRANT SELECT ON public.plan_prices TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.plan_prices TO authenticated;

-- Starting annual prices (editable, not hard-coded). Checkout stays switched off for each plan until the admin enables it.
INSERT INTO public.plan_prices (plan_slug, billing_period, category_id, price_kobo, period_days)
SELECT v.slug, 'annual', NULL, v.kobo, 365
FROM (VALUES ('silver', 2500000::bigint), ('premium', 7500000::bigint), ('gold', 20000000::bigint)) v(slug, kobo)
WHERE EXISTS (SELECT 1 FROM public.supplier_membership_plans p WHERE p.slug = v.slug)
ON CONFLICT DO NOTHING;

-- 4. The category a vendor is priced under. A vendor may set it once; after that only an admin can change it
--    (otherwise a vendor could switch to the cheapest category before paying).
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS pricing_category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.vendors_lock_pricing_category() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.pricing_category_id IS DISTINCT FROM OLD.pricing_category_id
     AND OLD.pricing_category_id IS NOT NULL
     AND NOT public.plan_is_trusted_caller() THEN
    NEW.pricing_category_id := OLD.pricing_category_id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_vendors_lock_pricing_category ON public.vendors;
CREATE TRIGGER trg_vendors_lock_pricing_category BEFORE UPDATE OF pricing_category_id ON public.vendors
  FOR EACH ROW EXECUTE FUNCTION public.vendors_lock_pricing_category();

-- 5. Payments: what kind of payment it was, and the figures it was built from.
ALTER TABLE public.supplier_membership_payments
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'new' CHECK (kind IN ('new', 'renewal', 'upgrade')),
  ADD COLUMN IF NOT EXISTS billing_period text CHECK (billing_period IN ('monthly', 'annual')),
  ADD COLUMN IF NOT EXISTS pricing_category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS list_price_kobo bigint,
  ADD COLUMN IF NOT EXISTS credit_kobo bigint NOT NULL DEFAULT 0 CHECK (credit_kobo >= 0),
  ADD COLUMN IF NOT EXISTS previous_plan_slug text,
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz,
  ADD COLUMN IF NOT EXISTS refund_reason text;
ALTER TABLE public.supplier_membership_payments DROP CONSTRAINT IF EXISTS supplier_membership_payments_status_check;
ALTER TABLE public.supplier_membership_payments
  ADD CONSTRAINT supplier_membership_payments_status_check CHECK (status IN ('pending', 'success', 'failed', 'refunded', 'chargeback'));
CREATE INDEX IF NOT EXISTS idx_supplier_membership_payments_paid
  ON public.supplier_membership_payments (vendor_id, plan_slug, paid_at DESC) WHERE status = 'success';

-- 6. Price lookup: the category's own price if there is one, otherwise the default price.
CREATE OR REPLACE FUNCTION public.resolve_plan_price(_plan text, _period text, _category uuid)
RETURNS TABLE (price_kobo bigint, period_days integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.price_kobo, r.period_days FROM (
    SELECT pp.price_kobo, pp.period_days, pp.is_active
    FROM public.plan_prices pp
    WHERE pp.plan_slug = _plan AND pp.billing_period = _period
      AND (pp.category_id = _category OR pp.category_id IS NULL)
    ORDER BY (pp.category_id IS NOT NULL) DESC
    LIMIT 1
  ) r WHERE r.is_active;
$$;
REVOKE ALL ON FUNCTION public.resolve_plan_price(text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_plan_price(text, text, uuid) TO anon, authenticated, service_role;

-- 7. The quote the checkout is built from. Called only by the payment-start function (service role), never trusted from the browser.
--    New or renewal: the list price. Upgrade to a higher tier: list price minus credit for the unused part of what the vendor
--    ACTUALLY paid for the current plan (an admin-granted plan has no payment, so it earns no credit). Moving to a lower tier
--    while a paid plan is running is not allowed; it can be done after the plan ends.
CREATE OR REPLACE FUNCTION public.quote_subscription(_vendor uuid, _plan text, _period text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _target public.supplier_membership_plans%ROWTYPE;
  _current public.supplier_membership_plans%ROWTYPE;
  _m public.vendor_memberships%ROWTYPE;
  _cat uuid;
  _price record;
  _kind text;
  _credit bigint := 0;
  _paid public.supplier_membership_payments%ROWTYPE;
  _remaining numeric;
BEGIN
  IF _period NOT IN ('monthly', 'annual') THEN RETURN jsonb_build_object('error', 'bad_period'); END IF;
  SELECT * INTO _target FROM public.supplier_membership_plans WHERE slug = _plan;
  IF NOT FOUND OR _target.slug = 'free' OR NOT _target.is_active OR NOT _target.purchase_enabled THEN
    RETURN jsonb_build_object('error', 'plan_unavailable');
  END IF;
  SELECT pricing_category_id INTO _cat FROM public.vendors WHERE id = _vendor;
  -- When prices differ by category, the vendor must have chosen their category first, so nobody pays the default by skipping it.
  IF _cat IS NULL AND EXISTS (SELECT 1 FROM public.plan_prices WHERE plan_slug = _plan AND billing_period = _period AND category_id IS NOT NULL AND is_active) THEN
    RETURN jsonb_build_object('error', 'category_required');
  END IF;
  SELECT * INTO _price FROM public.resolve_plan_price(_plan, _period, _cat);
  IF _price.price_kobo IS NULL THEN RETURN jsonb_build_object('error', 'not_offered'); END IF;

  SELECT * INTO _current FROM public.supplier_membership_plans WHERE slug = public.effective_supplier_plan(_vendor);
  SELECT * INTO _m FROM public.vendor_memberships WHERE vendor_id = _vendor;

  IF _current.slug = 'free' THEN _kind := 'new';
  ELSIF _current.slug = _target.slug THEN _kind := 'renewal';
  ELSIF _target.sort_order > _current.sort_order THEN
    _kind := 'upgrade';
    SELECT * INTO _paid FROM public.supplier_membership_payments
     WHERE vendor_id = _vendor AND plan_slug = _current.slug AND status = 'success'
     ORDER BY paid_at DESC NULLS LAST LIMIT 1;
    IF FOUND AND _m.expires_at IS NOT NULL AND _m.expires_at > now() THEN
      _remaining := LEAST(GREATEST(EXTRACT(EPOCH FROM (_m.expires_at - now())) / 86400.0, 0), _paid.period_days);
      _credit := floor(_paid.amount_kobo * _remaining / _paid.period_days);
      _credit := LEAST(_credit, _price.price_kobo - 10000);   -- never let the payable amount fall under ₦100
    END IF;
  ELSE
    RETURN jsonb_build_object('error', 'downgrade_not_allowed');
  END IF;

  RETURN jsonb_build_object(
    'kind', _kind, 'plan_slug', _target.slug, 'billing_period', _period, 'category_id', _cat,
    'list_price_kobo', _price.price_kobo, 'credit_kobo', _credit, 'payable_kobo', _price.price_kobo - _credit,
    'period_days', _price.period_days, 'previous_plan_slug', CASE WHEN _kind = 'upgrade' THEN _current.slug ELSE NULL END);
END $$;
REVOKE ALL ON FUNCTION public.quote_subscription(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.quote_subscription(uuid, text, text) TO service_role;

-- The vendor can see the same quote for display (read-only; the real checkout recomputes it on the server).
CREATE OR REPLACE FUNCTION public.my_subscription_quotes() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _v uuid; _out jsonb := '[]'::jsonb; _p record; _per text; _q jsonb;
BEGIN
  SELECT id INTO _v FROM public.vendors WHERE user_id = auth.uid() LIMIT 1;
  IF _v IS NULL THEN RETURN _out; END IF;
  FOR _p IN SELECT slug FROM public.supplier_membership_plans WHERE slug <> 'free' AND is_active AND purchase_enabled ORDER BY sort_order LOOP
    FOREACH _per IN ARRAY ARRAY['annual', 'monthly'] LOOP
      _q := public.quote_subscription(_v, _p.slug, _per);
      IF _q ? 'error' THEN CONTINUE; END IF;
      _out := _out || jsonb_build_array(_q);
    END LOOP;
  END LOOP;
  RETURN _out;
END $$;
REVOKE ALL ON FUNCTION public.my_subscription_quotes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_subscription_quotes() TO authenticated;

-- A vendor chooses the category they are priced under (allowed only while it is still empty).
CREATE OR REPLACE FUNCTION public.set_my_pricing_category(_category uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _v uuid;
BEGIN
  SELECT id INTO _v FROM public.vendors WHERE user_id = auth.uid() LIMIT 1;
  IF _v IS NULL THEN RAISE EXCEPTION 'A supplier account is required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.categories WHERE id = _category AND parent_id IS NULL) THEN
    RAISE EXCEPTION 'Choose one of the main categories';
  END IF;
  IF EXISTS (SELECT 1 FROM public.vendors WHERE id = _v AND pricing_category_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Your pricing category is already set. Contact support to change it.';
  END IF;
  UPDATE public.vendors SET pricing_category_id = _category WHERE id = _v;
END $$;
REVOKE ALL ON FUNCTION public.set_my_pricing_category(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_my_pricing_category(uuid) TO authenticated;

-- 8. Admin: grant or revoke a subscription by hand. Both write the audit log. A grant creates no payment, so it earns no
--    referral commission and no upgrade credit.
CREATE OR REPLACE FUNCTION public.admin_grant_subscription(_vendor uuid, _plan text, _days integer, _reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _old text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admins only'; END IF;
  IF _plan = 'free' OR NOT EXISTS (SELECT 1 FROM public.supplier_membership_plans WHERE slug = _plan) THEN RAISE EXCEPTION 'Choose a paid plan'; END IF;
  IF _days IS NULL OR _days NOT BETWEEN 1 AND 3660 THEN RAISE EXCEPTION 'Days must be between 1 and 3660'; END IF;
  IF _reason IS NULL OR char_length(btrim(_reason)) < 3 THEN RAISE EXCEPTION 'Give a reason'; END IF;
  _old := public.effective_supplier_plan(_vendor);
  INSERT INTO public.vendor_memberships (vendor_id, plan_slug, status, period_started_at, expires_at, updated_at)
  VALUES (_vendor, _plan, 'active', now(), now() + make_interval(days => _days), now())
  ON CONFLICT (vendor_id) DO UPDATE SET plan_slug = EXCLUDED.plan_slug, status = 'active',
    period_started_at = EXCLUDED.period_started_at, expires_at = EXCLUDED.expires_at, updated_at = now();
  INSERT INTO public.admin_audit_logs (actor_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'subscription.grant', 'vendor', _vendor::text, jsonb_build_object('from', _old, 'to', _plan, 'days', _days, 'reason', btrim(_reason)));
END $$;

CREATE OR REPLACE FUNCTION public.admin_revoke_subscription(_vendor uuid, _reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _old text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admins only'; END IF;
  IF _reason IS NULL OR char_length(btrim(_reason)) < 3 THEN RAISE EXCEPTION 'Give a reason'; END IF;
  _old := public.effective_supplier_plan(_vendor);
  UPDATE public.vendor_memberships SET expires_at = now(), updated_at = now() WHERE vendor_id = _vendor AND plan_slug <> 'free';
  INSERT INTO public.admin_audit_logs (actor_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'subscription.revoke', 'vendor', _vendor::text, jsonb_build_object('from', _old, 'reason', btrim(_reason)));
END $$;
REVOKE ALL ON FUNCTION public.admin_grant_subscription(uuid, text, integer, text), public.admin_revoke_subscription(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_grant_subscription(uuid, text, integer, text), public.admin_revoke_subscription(uuid, text) TO authenticated;

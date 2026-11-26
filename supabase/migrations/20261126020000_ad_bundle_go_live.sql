-- =====================================================================
-- PART 23: switch the all-inclusive subscription ON (admin can switch it OFF in the admin panel).
-- Needs PART 22 first. Safe to run twice; it never overwrites prices or settings an admin already changed.
-- =====================================================================

-- 1. The on/off switch. One row. ON by default. While OFF, vendors see the old membership screen.
CREATE TABLE IF NOT EXISTS public.ad_bundle_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.ad_bundle_settings (id, enabled) VALUES (true, true) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.ad_bundle_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Signed-in users read bundle switch" ON public.ad_bundle_settings;
CREATE POLICY "Signed-in users read bundle switch" ON public.ad_bundle_settings FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Admins change bundle switch" ON public.ad_bundle_settings;
CREATE POLICY "Admins change bundle switch" ON public.ad_bundle_settings FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
REVOKE ALL ON public.ad_bundle_settings FROM PUBLIC, anon;
GRANT SELECT, UPDATE ON public.ad_bundle_settings TO authenticated;

-- 2. Starting service prices (editable in admin). Monthly: Starter 6,700 / Growth 18,000 / Enterprise 26,800 naira,
--    with 5% off for 3 months, 10% off for 6 months, 15% off for 12 months. Never overwrites existing rows.
INSERT INTO public.plan_duration_prices (plan_slug, months, price_kobo)
SELECT p.slug, m.months, round(p.monthly * m.months * m.keep)::bigint
FROM (VALUES ('silver', 670000), ('premium', 1800000), ('gold', 2680000)) p(slug, monthly)
CROSS JOIN (VALUES (1, 1.00), (3, 0.95), (6, 0.90), (12, 0.85)) m(months, keep)
WHERE EXISTS (SELECT 1 FROM public.supplier_membership_plans sp WHERE sp.slug = p.slug)
ON CONFLICT DO NOTHING;

-- 3. Allow these three plans to be bought.
UPDATE public.supplier_membership_plans SET purchase_enabled = true WHERE slug IN ('silver', 'premium', 'gold') AND is_active;

-- 4. What each payment bought, and the ad days owed to the vendor.
CREATE TABLE IF NOT EXISTS public.ad_bundle_orders (
  payment_id uuid PRIMARY KEY REFERENCES public.supplier_membership_payments(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  months integer NOT NULL,
  service_kobo bigint NOT NULL,
  ads_kobo bigint NOT NULL,
  lines jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.vendor_ad_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  payment_id uuid NOT NULL REFERENCES public.supplier_membership_payments(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('meta', 'google', 'tiktok')),
  days_per_month integer NOT NULL CHECK (days_per_month >= 1),
  days_total integer NOT NULL CHECK (days_total >= 1),
  days_used integer NOT NULL DEFAULT 0 CHECK (days_used >= 0),
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (payment_id, platform),
  CHECK (days_used <= days_total)
);
CREATE INDEX IF NOT EXISTS idx_vendor_ad_alloc_vendor ON public.vendor_ad_allocations (vendor_id, expires_at DESC);
ALTER TABLE public.ad_bundle_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_ad_allocations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Vendors read own bundle orders" ON public.ad_bundle_orders;
CREATE POLICY "Vendors read own bundle orders" ON public.ad_bundle_orders FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = vendor_id AND v.user_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Vendors read own ad allocations" ON public.vendor_ad_allocations;
CREATE POLICY "Vendors read own ad allocations" ON public.vendor_ad_allocations FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = vendor_id AND v.user_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Admins manage ad allocations" ON public.vendor_ad_allocations;
CREATE POLICY "Admins manage ad allocations" ON public.vendor_ad_allocations FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
REVOKE ALL ON public.ad_bundle_orders, public.vendor_ad_allocations FROM PUBLIC, anon;
GRANT SELECT ON public.ad_bundle_orders TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendor_ad_allocations TO authenticated;

-- 5. When the payment is confirmed (existing finalize function sets status = success), create the ad days in the same transaction.
CREATE OR REPLACE FUNCTION public.ad_bundle_on_payment_success() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _o public.ad_bundle_orders%ROWTYPE; _l jsonb;
BEGIN
  SELECT * INTO _o FROM public.ad_bundle_orders WHERE payment_id = NEW.id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  FOR _l IN SELECT * FROM jsonb_array_elements(_o.lines) LOOP
    INSERT INTO public.vendor_ad_allocations (vendor_id, payment_id, platform, days_per_month, days_total, expires_at)
    VALUES (_o.vendor_id, NEW.id, _l ->> 'platform', (_l ->> 'days_per_month')::int, (_l ->> 'days')::int, now() + make_interval(days => NEW.period_days))
    ON CONFLICT (payment_id, platform) DO NOTHING;
  END LOOP;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_ad_bundle_on_payment_success ON public.supplier_membership_payments;
CREATE TRIGGER trg_ad_bundle_on_payment_success AFTER UPDATE OF status ON public.supplier_membership_payments
  FOR EACH ROW WHEN (NEW.status = 'success' AND OLD.status IS DISTINCT FROM 'success')
  EXECUTE FUNCTION public.ad_bundle_on_payment_success();

-- 6. Referral commission: for a bundle payment the base is the PLAN part only (ad days never earn commission).
--    Same function as before with one change: the base amount.
CREATE OR REPLACE FUNCTION public.referral_create_commission(_payment_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _pay public.supplier_membership_payments%ROWTYPE; _a public.referral_attributions%ROWTYPE; _s public.referral_settings%ROWTYPE; _prof public.referral_profiles%ROWTYPE; _amt bigint; _base bigint;
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
  _base := COALESCE((SELECT LEAST(o.service_kobo, _pay.amount_kobo) FROM public.ad_bundle_orders o WHERE o.payment_id = _pay.id), _pay.amount_kobo);
  _amt := floor(_base * _a.rate_percent / 100.0);
  INSERT INTO public.referral_commissions (payment_id, vendor_id, referrer_user_id, agreement_id, plan_slug, base_amount_kobo, rate_percent, amount_kobo, status, available_at)
  VALUES (_pay.id, _pay.vendor_id, _a.referrer_user_id, _a.agreement_id, _pay.plan_slug, _base, _a.rate_percent, _amt, 'pending', now() + make_interval(days => _s.hold_days))
  ON CONFLICT (payment_id) DO NOTHING;
  IF _a.locked_at IS NULL THEN UPDATE public.referral_attributions SET locked_at = now() WHERE vendor_id = _a.vendor_id; END IF;
  INSERT INTO public.referral_audit_logs (actor_id, action, entity_type, entity_id, details)
  VALUES (NULL, 'commission.created', 'payment', _pay.id::text, jsonb_build_object('referrer', _a.referrer_user_id, 'base_kobo', _base, 'rate', _a.rate_percent, 'amount_kobo', _amt));
END $$;
REVOKE ALL ON FUNCTION public.referral_create_commission(uuid) FROM PUBLIC, anon, authenticated;

-- 7. Checkout helper (service role): the kind of purchase, from the vendor's current plan.
CREATE OR REPLACE FUNCTION public.ad_bundle_kind(_vendor uuid, _plan text) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _cur text := public.effective_supplier_plan(_vendor); _co int; _to int;
BEGIN
  IF _cur = 'free' THEN RETURN 'new'; END IF;
  IF _cur = _plan THEN RETURN 'renewal'; END IF;
  SELECT sort_order INTO _co FROM public.supplier_membership_plans WHERE slug = _cur;
  SELECT sort_order INTO _to FROM public.supplier_membership_plans WHERE slug = _plan;
  IF _to > _co THEN RETURN 'upgrade'; END IF;
  RETURN 'downgrade_not_allowed';
END $$;
REVOKE ALL ON FUNCTION public.ad_bundle_kind(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ad_bundle_kind(uuid, text) TO service_role;

-- 8. The options RPC now also says whether the new model is switched on.
CREATE OR REPLACE FUNCTION public.get_ad_bundle_options() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'enabled', COALESCE((SELECT enabled FROM public.ad_bundle_settings WHERE id), false),
    'platforms', COALESCE((SELECT jsonb_agg(jsonb_build_object('platform', platform, 'label', label,
        'price_per_day_kobo', vendor_price_per_day_kobo, 'min_days', min_days,
        'est_views_low', est_views_low, 'est_views_high', est_views_high, 'note', note) ORDER BY platform)
      FROM public.ad_bundle_platform_rates WHERE is_active), '[]'::jsonb),
    'tier_caps', COALESCE((SELECT jsonb_agg(jsonb_build_object('plan_slug', plan_slug, 'platform', platform, 'max_days_per_month', max_days_per_month))
      FROM public.ad_bundle_tier_rules WHERE max_days_per_month > 0), '[]'::jsonb),
    'durations', COALESCE((SELECT jsonb_agg(jsonb_build_object('plan_slug', plan_slug, 'months', months, 'service_kobo', price_kobo) ORDER BY plan_slug, months)
      FROM public.plan_duration_prices WHERE is_active), '[]'::jsonb));
$$;
REVOKE ALL ON FUNCTION public.get_ad_bundle_options() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ad_bundle_options() TO authenticated;

NOTIFY pgrst, 'reload schema';

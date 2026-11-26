-- =====================================================================
-- PART 22: all-inclusive subscription pricing (tier + duration + ad platform days).
-- ADDITIVE ONLY. Nothing existing is changed or dropped. Nothing here charges anyone yet:
-- these are the rate tables and the server-side price quote. Checkout wiring comes in the next phase.
-- Safe to run twice.
-- =====================================================================

-- 1. Per-platform ad day rates. Admin-only table (holds internal cost). Vendors only ever see vendor_price_per_day_kobo through the RPC below.
CREATE TABLE IF NOT EXISTS public.ad_bundle_platform_rates (
  platform text PRIMARY KEY CHECK (platform IN ('meta', 'google', 'tiktok')),
  label text NOT NULL,
  internal_cost_per_day_kobo bigint NOT NULL CHECK (internal_cost_per_day_kobo >= 0),   -- what the platform charges us per ad day, before tax
  tax_percent numeric NOT NULL DEFAULT 7.5 CHECK (tax_percent >= 0),
  vendor_price_per_day_kobo bigint NOT NULL CHECK (vendor_price_per_day_kobo >= 0),     -- what the vendor pays per ad day (cost + tax + fees + margin)
  min_days integer NOT NULL DEFAULT 1 CHECK (min_days >= 1),
  est_views_low integer,
  est_views_high integer,
  note text,
  is_active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ad_bundle_platform_rates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage ad bundle rates" ON public.ad_bundle_platform_rates;
CREATE POLICY "Admins manage ad bundle rates" ON public.ad_bundle_platform_rates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
REVOKE ALL ON public.ad_bundle_platform_rates FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ad_bundle_platform_rates TO authenticated;

-- Starting values (placeholders the admin must review). TikTok Promote figures are from the in-app screen:
-- N7,216/day minimum, 7.5% tax, TikTok's own estimate 209-1,045 landing page views a day. Vendor price = (cost x 1.075) / 0.685,
-- i.e. leaves 30% margin and 1.5% payment fee. Meta and Google use the existing $5/day minimum at N1,400 per dollar.
INSERT INTO public.ad_bundle_platform_rates (platform, label, internal_cost_per_day_kobo, tax_percent, vendor_price_per_day_kobo, min_days, est_views_low, est_views_high, note)
VALUES
 ('tiktok', 'TikTok', 721600, 7.5, 1132400, 1, 209, 1045, 'Estimate from TikTok Promote; views are to the iTHUB TikTok profile, not guaranteed.'),
 ('meta',   'Facebook and Instagram (Meta)', 700000, 7.5, 1098500, 1, NULL, NULL, 'Placeholder from the $5 a day minimum. Review before selling.'),
 ('google', 'Google', 700000, 7.5, 1098500, 1, NULL, NULL, 'Placeholder from the $5 a day minimum. Review before selling.')
ON CONFLICT (platform) DO NOTHING;

-- 2. What each tier may include (maximum ad days per month, per platform). 0 or no row = not available on that tier.
CREATE TABLE IF NOT EXISTS public.ad_bundle_tier_rules (
  plan_slug text NOT NULL REFERENCES public.supplier_membership_plans(slug) ON DELETE CASCADE,
  platform text NOT NULL REFERENCES public.ad_bundle_platform_rates(platform) ON DELETE CASCADE,
  max_days_per_month integer NOT NULL DEFAULT 0 CHECK (max_days_per_month BETWEEN 0 AND 31),
  PRIMARY KEY (plan_slug, platform)
);
ALTER TABLE public.ad_bundle_tier_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage ad bundle tier rules" ON public.ad_bundle_tier_rules;
CREATE POLICY "Admins manage ad bundle tier rules" ON public.ad_bundle_tier_rules FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
REVOKE ALL ON public.ad_bundle_tier_rules FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ad_bundle_tier_rules TO authenticated;

-- Starting caps (placeholders, editable). Slugs: premium = the second paid tier, gold = the third, diamond = the top. silver gets none.
INSERT INTO public.ad_bundle_tier_rules (plan_slug, platform, max_days_per_month)
SELECT v.slug, v.platform, v.d FROM (VALUES
  ('premium', 'meta', 3), ('premium', 'tiktok', 2),
  ('gold', 'meta', 5), ('gold', 'google', 3), ('gold', 'tiktok', 4),
  ('diamond', 'meta', 10), ('diamond', 'google', 6), ('diamond', 'tiktok', 8)
) v(slug, platform, d)
WHERE EXISTS (SELECT 1 FROM public.supplier_membership_plans p WHERE p.slug = v.slug)
ON CONFLICT DO NOTHING;

-- 3. Service-only price of each tier for 1, 3, 6 and 12 months (no ads in it). Left EMPTY on purpose: the admin enters these.
--    A tier/duration with no row is simply not offered.
CREATE TABLE IF NOT EXISTS public.plan_duration_prices (
  plan_slug text NOT NULL REFERENCES public.supplier_membership_plans(slug) ON DELETE CASCADE,
  months integer NOT NULL CHECK (months IN (1, 3, 6, 12)),
  price_kobo bigint NOT NULL CHECK (price_kobo >= 10000),
  is_active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (plan_slug, months)
);
ALTER TABLE public.plan_duration_prices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can read active duration prices" ON public.plan_duration_prices;
CREATE POLICY "Anyone can read active duration prices" ON public.plan_duration_prices FOR SELECT TO anon, authenticated
  USING (is_active OR public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Admins manage duration prices" ON public.plan_duration_prices;
CREATE POLICY "Admins manage duration prices" ON public.plan_duration_prices FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
REVOKE ALL ON public.plan_duration_prices FROM PUBLIC, anon;
GRANT SELECT ON public.plan_duration_prices TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.plan_duration_prices TO authenticated;

-- 4. The quote. Service role only for checkout; the vendor display wrapper below calls it for the signed-in vendor.
--    _selections example: [{"platform":"tiktok","days_per_month":3},{"platform":"meta","days_per_month":2}]
--    The vendor chooses ad days PER MONTH; days bought = days_per_month x months. total_kobo is the subscription plan cost (one payment).
--    commission_base_kobo is the service part ONLY: ad days never earn referral commission.
CREATE OR REPLACE FUNCTION public.quote_ad_bundle(_plan text, _months integer, _selections jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _service bigint; _sel jsonb; _rate public.ad_bundle_platform_rates%ROWTYPE; _cap integer; _dpm integer; _days integer;
  _lines jsonb := '[]'::jsonb; _ads bigint := 0; _seen text[] := ARRAY[]::text[]; _plat text;
BEGIN
  IF _months NOT IN (1, 3, 6, 12) THEN RETURN jsonb_build_object('error', 'bad_duration'); END IF;
  IF NOT EXISTS (SELECT 1 FROM public.supplier_membership_plans WHERE slug = _plan AND slug <> 'free' AND is_active AND purchase_enabled) THEN
    RETURN jsonb_build_object('error', 'plan_unavailable');
  END IF;
  SELECT price_kobo INTO _service FROM public.plan_duration_prices WHERE plan_slug = _plan AND months = _months AND is_active;
  IF _service IS NULL THEN RETURN jsonb_build_object('error', 'not_offered'); END IF;

  IF _selections IS NULL OR jsonb_typeof(_selections) <> 'array' THEN _selections := '[]'::jsonb; END IF;
  IF jsonb_array_length(_selections) > 3 THEN RETURN jsonb_build_object('error', 'bad_selection'); END IF;
  FOR _sel IN SELECT * FROM jsonb_array_elements(_selections) LOOP
    _plat := _sel ->> 'platform';
    IF _plat IS NULL OR _plat = ANY(_seen) THEN RETURN jsonb_build_object('error', 'bad_selection'); END IF;
    _seen := _seen || _plat;
    BEGIN _dpm := (_sel ->> 'days_per_month')::integer; EXCEPTION WHEN others THEN RETURN jsonb_build_object('error', 'bad_selection'); END;
    IF _dpm IS NULL OR _dpm < 1 THEN RETURN jsonb_build_object('error', 'bad_selection'); END IF;
    _days := _dpm * _months;
    SELECT * INTO _rate FROM public.ad_bundle_platform_rates WHERE platform = _plat AND is_active;
    IF NOT FOUND THEN RETURN jsonb_build_object('error', 'platform_unavailable', 'platform', _plat); END IF;
    SELECT max_days_per_month INTO _cap FROM public.ad_bundle_tier_rules WHERE plan_slug = _plan AND platform = _plat;
    IF COALESCE(_cap, 0) = 0 THEN RETURN jsonb_build_object('error', 'platform_not_in_tier', 'platform', _plat); END IF;
    IF _dpm < _rate.min_days OR _dpm > _cap THEN
      RETURN jsonb_build_object('error', 'days_out_of_range', 'platform', _plat, 'min_days_per_month', _rate.min_days, 'max_days_per_month', _cap);
    END IF;
    _lines := _lines || jsonb_build_array(jsonb_build_object(
      'platform', _plat, 'label', _rate.label, 'days_per_month', _dpm, 'days', _days,
      'price_per_day_kobo', _rate.vendor_price_per_day_kobo, 'line_kobo', _rate.vendor_price_per_day_kobo * _days));
    _ads := _ads + _rate.vendor_price_per_day_kobo * _days;
  END LOOP;

  RETURN jsonb_build_object('plan_slug', _plan, 'months', _months, 'service_kobo', _service, 'ads_kobo', _ads,
    'total_kobo', _service + _ads, 'plan_cost_kobo', _service + _ads, 'commission_base_kobo', _service, 'lines', _lines);
END $$;
REVOKE ALL ON FUNCTION public.quote_ad_bundle(text, integer, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.quote_ad_bundle(text, integer, jsonb) TO service_role;

-- 5. What the vendor sees while choosing: our selling price per ad day, the tier caps, and estimates. Never internal cost.
CREATE OR REPLACE FUNCTION public.get_ad_bundle_options() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
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

-- Live total for the purchase screen (display only; checkout recomputes with quote_ad_bundle).
CREATE OR REPLACE FUNCTION public.my_ad_bundle_quote(_plan text, _months integer, _selections jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('error', 'sign_in_required'); END IF;
  RETURN public.quote_ad_bundle(_plan, _months, _selections);
END $$;
REVOKE ALL ON FUNCTION public.my_ad_bundle_quote(text, integer, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_ad_bundle_quote(text, integer, jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';

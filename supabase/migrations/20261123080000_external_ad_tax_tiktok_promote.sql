-- Calibrated from TikTok Promote screenshots (Nov 2026): lowest daily budget N7,216 (about $5.30), tax 7.5% added on top,
-- and N7,216 buys an estimated 209-1,045 landing page views (about N7 to N34 each, midpoint near N21).
-- Platform tax is now part of the price so ITHUBAFRICA's fee stays profit.
ALTER TABLE public.external_ad_pricing_settings ADD COLUMN IF NOT EXISTS tax_percent numeric(5,2) NOT NULL DEFAULT 7.5 CHECK (tax_percent >= 0 AND tax_percent < 100);

UPDATE public.external_ad_pricing SET platform_min_daily_usd = 5.30, cpm_usd = 7.50,
  note = 'TikTok Promote (screenshots, Nov 2026): lowest budget about N7,216 a day plus 7.5% tax. Visits goal: N7,216 gave an estimated 209-1,045 landing page views (N7-N34 each). $7.50 per 1,000 x visits factor 2 = about N21 per view. Ads Manager has a higher $20 minimum.'
WHERE platform = 'tiktok_ads';

CREATE OR REPLACE FUNCTION public.external_ad_min_budget(_platform text, _days integer DEFAULT 1, _views_per_day integer DEFAULT NULL, _objective text DEFAULT 'awareness') RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _p public.external_ad_pricing%ROWTYPE; _s public.external_ad_pricing_settings%ROWTYPE; _floor numeric; _reach numeric; _spend numeric; _tax numeric; _fee numeric; _daily numeric;
        _d integer := greatest(coalesce(_days, 1), 1); _factor numeric;
BEGIN
  SELECT * INTO _p FROM public.external_ad_pricing WHERE platform = _platform;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unsupported platform.'; END IF;
  SELECT * INTO _s FROM public.external_ad_pricing_settings WHERE id;
  _factor := CASE _objective WHEN 'sales' THEN _s.sales_factor WHEN 'traffic' THEN _s.traffic_factor ELSE 1 END;
  _floor := _p.platform_min_daily_usd * _s.usd_to_ngn;
  _reach := coalesce(_views_per_day, 0) / 1000.0 * _p.cpm_usd * _factor * _s.usd_to_ngn;
  _spend := greatest(_floor, _reach);
  _tax := _spend * _s.tax_percent / 100;
  _fee := greatest(_spend * _p.fee_percent / 100, _p.min_fee_per_day_ngn);
  _daily := ceil((_spend + _tax + _fee) / 100) * 100;
  RETURN jsonb_build_object('daily_min_ngn', _daily, 'days', _d, 'total_min_ngn', _daily * _d,
    'platform_daily_ngn', round(_spend), 'tax_daily_ngn', round(_tax), 'fee_daily_ngn', _daily - round(_spend) - round(_tax),
    'views_per_day', _views_per_day, 'reach_cost_daily_ngn', round(_reach), 'platform_floor_daily_ngn', round(_floor),
    'floor_applied', _floor > _reach);
END $$;

DROP FUNCTION IF EXISTS public.admin_set_external_pricing(text, numeric, numeric, numeric, numeric, numeric, numeric, numeric);
CREATE OR REPLACE FUNCTION public.admin_get_external_pricing() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.ad_require_admin();
  RETURN jsonb_build_object(
    'usd_to_ngn', (SELECT usd_to_ngn FROM public.external_ad_pricing_settings WHERE id),
    'traffic_factor', (SELECT traffic_factor FROM public.external_ad_pricing_settings WHERE id),
    'sales_factor', (SELECT sales_factor FROM public.external_ad_pricing_settings WHERE id),
    'tax_percent', (SELECT tax_percent FROM public.external_ad_pricing_settings WHERE id),
    'platforms', (SELECT jsonb_agg(jsonb_build_object('platform', p.platform, 'platform_min_daily_usd', p.platform_min_daily_usd, 'cpm_usd', p.cpm_usd,
        'fee_percent', p.fee_percent, 'min_fee_per_day_ngn', p.min_fee_per_day_ngn, 'note', p.note,
        'minimum', public.external_ad_min_budget(p.platform, 1),
        'example_1000', public.external_ad_min_budget(p.platform, 1, 1000, 'awareness')) ORDER BY p.platform) FROM public.external_ad_pricing p));
END $$;
CREATE OR REPLACE FUNCTION public.admin_set_external_pricing(_platform text, _min_usd numeric, _cpm_usd numeric, _fee_percent numeric, _min_fee_ngn numeric,
                                                             _usd_to_ngn numeric, _traffic_factor numeric, _sales_factor numeric, _tax_percent numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.ad_require_admin();
  IF _usd_to_ngn IS NULL OR _usd_to_ngn <= 0 THEN RAISE EXCEPTION 'Enter the dollar rate.'; END IF;
  UPDATE public.external_ad_pricing SET platform_min_daily_usd = _min_usd, cpm_usd = _cpm_usd, fee_percent = _fee_percent, min_fee_per_day_ngn = _min_fee_ngn, updated_at = now() WHERE platform = _platform;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown platform.'; END IF;
  UPDATE public.external_ad_pricing_settings SET usd_to_ngn = _usd_to_ngn, traffic_factor = _traffic_factor, sales_factor = _sales_factor, tax_percent = _tax_percent, updated_at = now() WHERE id;
END $$;
REVOKE ALL ON FUNCTION public.admin_get_external_pricing(), public.admin_set_external_pricing(text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_external_pricing(), public.admin_set_external_pricing(text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric) TO authenticated;

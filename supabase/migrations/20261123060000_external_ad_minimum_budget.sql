-- Minimum budget for external ads (Google, Facebook, Instagram, TikTok), with ITHUBAFRICA's management fee built in.
-- Daily minimum = the platform's own minimum daily spend (in naira) + a management fee (percentage, with a floor per day).
-- Vendors cannot submit a budget below it. The fee is taken from the vendor's ad balance when the campaign is marked running.
CREATE TABLE IF NOT EXISTS public.external_ad_pricing (
  platform text PRIMARY KEY CHECK (platform IN ('google_ads','facebook_ads','instagram_ads','tiktok_ads')),
  platform_min_daily_usd numeric(8,2) NOT NULL CHECK (platform_min_daily_usd >= 0),
  fee_percent numeric(5,2) NOT NULL DEFAULT 30 CHECK (fee_percent BETWEEN 0 AND 300),
  min_fee_per_day_ngn numeric(12,2) NOT NULL DEFAULT 1000 CHECK (min_fee_per_day_ngn >= 0),
  note text, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.external_ad_pricing_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  usd_to_ngn numeric(10,2) NOT NULL DEFAULT 1400 CHECK (usd_to_ngn > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.external_ad_pricing_settings (id) VALUES (true) ON CONFLICT DO NOTHING;
INSERT INTO public.external_ad_pricing (platform, platform_min_daily_usd, note) VALUES
  ('tiktok_ads',    20, 'TikTok Ads Manager: minimum $20 a day per ad group ($50 if set at campaign level).'),
  ('google_ads',     5, 'Google Demand Gen minimum is $5 a day. Search and Performance Max have no fixed minimum.'),
  ('facebook_ads',   5, 'Meta technical floor is about $1 a day and varies by goal; $5 is the practical minimum used here.'),
  ('instagram_ads',  5, 'Instagram ads run through Meta, so the same minimum as Facebook.')
ON CONFLICT (platform) DO NOTHING;
ALTER TABLE public.external_ad_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_ad_pricing_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.external_ad_pricing, public.external_ad_pricing_settings FROM PUBLIC, anon, authenticated;

-- Snapshot on each request: what the platform gets, what ITHUBAFRICA keeps, and whether the vendor has been charged.
ALTER TABLE public.external_ad_campaigns
  ADD COLUMN IF NOT EXISTS min_daily_ngn numeric(14,2), ADD COLUMN IF NOT EXISTS platform_spend_ngn numeric(14,2),
  ADD COLUMN IF NOT EXISTS fee_ngn numeric(14,2), ADD COLUMN IF NOT EXISTS charged_at timestamptz;

CREATE OR REPLACE FUNCTION public.external_ad_min_budget(_platform text, _days integer DEFAULT 1) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _p public.external_ad_pricing%ROWTYPE; _fx numeric; _spend numeric; _fee numeric; _daily numeric; _d integer := greatest(coalesce(_days, 1), 1);
BEGIN
  SELECT * INTO _p FROM public.external_ad_pricing WHERE platform = _platform;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unsupported platform.'; END IF;
  SELECT usd_to_ngn INTO _fx FROM public.external_ad_pricing_settings WHERE id;
  _spend := _p.platform_min_daily_usd * _fx;
  _fee := greatest(_spend * _p.fee_percent / 100, _p.min_fee_per_day_ngn);
  _daily := ceil((_spend + _fee) / 100) * 100;                  -- rounded up to the next ₦100
  RETURN jsonb_build_object('daily_min_ngn', _daily, 'days', _d, 'total_min_ngn', _daily * _d,
    'platform_daily_ngn', round(_spend), 'fee_daily_ngn', _daily - round(_spend));
END $$;
REVOKE ALL ON FUNCTION public.external_ad_min_budget(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.external_ad_min_budget(text, integer) TO authenticated;

-- A request that authorises spend must meet the minimum for its platform and number of days.
CREATE OR REPLACE FUNCTION public.external_ad_enforce_minimum() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _m jsonb; _total numeric; _share numeric;
BEGIN
  IF NEW.spend_authorized THEN
    _m := public.external_ad_min_budget(NEW.platform, NEW.duration_days);
    _total := (_m ->> 'total_min_ngn')::numeric;
    IF coalesce(NEW.budget_amount, 0) < _total THEN
      RAISE EXCEPTION 'The minimum budget for % over % day(s) is ₦% (₦% a day).', CASE NEW.platform WHEN 'tiktok_ads' THEN 'TikTok Ads' WHEN 'google_ads' THEN 'Google Ads' WHEN 'facebook_ads' THEN 'Facebook Ads' ELSE 'Instagram Ads' END,
        NEW.duration_days, to_char(_total, 'FM999,999,999'), to_char((_m ->> 'daily_min_ngn')::numeric, 'FM999,999,999');
    END IF;
    _share := (_m ->> 'fee_daily_ngn')::numeric / (_m ->> 'daily_min_ngn')::numeric;      -- the fee's share of each naira budgeted
    NEW.min_daily_ngn := (_m ->> 'daily_min_ngn')::numeric;
    NEW.fee_ngn := round(NEW.budget_amount * _share, 2);
    NEW.platform_spend_ngn := NEW.budget_amount - NEW.fee_ngn;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_external_ad_minimum ON public.external_ad_campaigns;
CREATE TRIGGER trg_external_ad_minimum BEFORE INSERT OR UPDATE OF budget_amount, spend_authorized, platform, duration_days
  ON public.external_ad_campaigns FOR EACH ROW EXECUTE FUNCTION public.external_ad_enforce_minimum();

-- Admin: read and change the pricing rules.
CREATE OR REPLACE FUNCTION public.admin_get_external_pricing() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.ad_require_admin();
  RETURN jsonb_build_object(
    'usd_to_ngn', (SELECT usd_to_ngn FROM public.external_ad_pricing_settings WHERE id),
    'platforms', (SELECT jsonb_agg(jsonb_build_object('platform', p.platform, 'platform_min_daily_usd', p.platform_min_daily_usd,
        'fee_percent', p.fee_percent, 'min_fee_per_day_ngn', p.min_fee_per_day_ngn, 'note', p.note,
        'minimum', public.external_ad_min_budget(p.platform, 1)) ORDER BY p.platform) FROM public.external_ad_pricing p));
END $$;
CREATE OR REPLACE FUNCTION public.admin_set_external_pricing(_platform text, _min_usd numeric, _fee_percent numeric, _min_fee_ngn numeric, _usd_to_ngn numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.ad_require_admin();
  IF _usd_to_ngn IS NULL OR _usd_to_ngn <= 0 THEN RAISE EXCEPTION 'Enter the dollar rate.'; END IF;
  UPDATE public.external_ad_pricing SET platform_min_daily_usd = _min_usd, fee_percent = _fee_percent, min_fee_per_day_ngn = _min_fee_ngn, updated_at = now() WHERE platform = _platform;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown platform.'; END IF;
  UPDATE public.external_ad_pricing_settings SET usd_to_ngn = _usd_to_ngn, updated_at = now() WHERE id;
END $$;
REVOKE ALL ON FUNCTION public.admin_get_external_pricing(), public.admin_set_external_pricing(text, numeric, numeric, numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_external_pricing(), public.admin_set_external_pricing(text, numeric, numeric, numeric, numeric) TO authenticated;

-- Marking a request as running now also takes the budget from the vendor's ad balance, once.
DROP FUNCTION IF EXISTS public.admin_set_external_status(uuid, text, text, text);
CREATE OR REPLACE FUNCTION public.admin_set_external_status(_id uuid, _status text, _note text DEFAULT NULL, _external_id text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _r public.external_ad_campaigns%ROWTYPE; _m jsonb; _bal bigint; _kobo bigint;
BEGIN
  PERFORM public.ad_require_admin();
  IF _status NOT IN ('pending_review', 'rejected', 'cancelled', 'paused', 'ended', 'failed', 'active') THEN RAISE EXCEPTION 'Unsupported status.'; END IF;
  SELECT * INTO _r FROM public.external_ad_campaigns WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found.'; END IF;

  IF _status = 'active' THEN
    IF _r.status NOT IN ('pending_review', 'paused') THEN RAISE EXCEPTION 'Only a request that is in review or paused can be marked running.'; END IF;
    IF NOT _r.spend_authorized THEN RAISE EXCEPTION 'The vendor has not authorised this spend yet.'; END IF;
    IF _external_id IS NULL OR char_length(btrim(_external_id)) < 3 THEN
      RAISE EXCEPTION 'Enter the campaign ID or link from the platform''s ads manager, so the status is genuine.'; END IF;
    IF _r.charged_at IS NULL THEN
      _m := public.external_ad_min_budget(_r.platform, _r.duration_days);
      IF coalesce(_r.budget_amount, 0) < (_m ->> 'total_min_ngn')::numeric THEN
        RAISE EXCEPTION 'This budget (₦%) is below the minimum of ₦% for % day(s). Ask the vendor to resubmit with a higher budget.',
          to_char(coalesce(_r.budget_amount, 0), 'FM999,999,999'), to_char((_m ->> 'total_min_ngn')::numeric, 'FM999,999,999'), _r.duration_days; END IF;
      _kobo := round(_r.budget_amount * 100)::bigint;
      _bal := public.ad_wallet_balance_kobo(_r.vendor_id);
      IF _bal < _kobo THEN
        RAISE EXCEPTION 'The vendor''s ad balance is ₦% but this campaign needs ₦%. Ask them to top up first.', to_char(_bal / 100.0, 'FM999,999,999'), to_char(_kobo / 100.0, 'FM999,999,999'); END IF;
      INSERT INTO public.ad_wallet_ledger (vendor_id, kind, amount_kobo, platform, note, created_by)
      VALUES (_r.vendor_id, 'spend', -_kobo,
              CASE _r.platform WHEN 'google_ads' THEN 'google' WHEN 'tiktok_ads' THEN 'tiktok' ELSE 'meta' END,
              'External ad campaign (' || left(_r.id::text, 8) || ')', auth.uid());
      UPDATE public.external_ad_campaigns SET charged_at = now() WHERE id = _id;
    END IF;
    UPDATE public.external_ad_campaigns SET status = 'active', external_campaign_id = left(btrim(_external_id), 200),
      status_detail = left(COALESCE(_note, status_detail), 500) WHERE id = _id;
    PERFORM public.ad_notify_vendor(_r.vendor_id, 'Your ad request is now running on ' ||
      CASE _r.platform WHEN 'tiktok_ads' THEN 'TikTok' WHEN 'facebook_ads' THEN 'Facebook' WHEN 'instagram_ads' THEN 'Instagram' ELSE 'Google' END || '.');
    RETURN;
  END IF;
  UPDATE public.external_ad_campaigns SET status = _status, status_detail = left(COALESCE(_note, status_detail), 500) WHERE id = _id;
END $$;
REVOKE ALL ON FUNCTION public.admin_set_external_status(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_external_status(uuid, text, text, text) TO authenticated;

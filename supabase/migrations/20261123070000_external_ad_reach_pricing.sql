-- Ad cost now depends on how many people the vendor wants to reach each day.
-- Cost to the platform = (people to reach / 1,000) x cost per 1,000 views x objective factor x dollar rate,
-- but never less than the platform's own daily minimum. ITHUBAFRICA's management fee is added on top (percentage, with a floor).
-- Cost per 1,000 views is the base (awareness) price; traffic and sales cost more, so they have their own factors.
ALTER TABLE public.external_ad_pricing ADD COLUMN IF NOT EXISTS cpm_usd numeric(8,4) NOT NULL DEFAULT 1 CHECK (cpm_usd >= 0);
ALTER TABLE public.external_ad_pricing_settings ADD COLUMN IF NOT EXISTS traffic_factor numeric(5,2) NOT NULL DEFAULT 2 CHECK (traffic_factor >= 1),
                                                ADD COLUMN IF NOT EXISTS sales_factor numeric(5,2) NOT NULL DEFAULT 4 CHECK (sales_factor >= 1);
ALTER TABLE public.external_ad_campaigns ADD COLUMN IF NOT EXISTS target_views_per_day integer CHECK (target_views_per_day IS NULL OR target_views_per_day BETWEEN 100 AND 5000000);

UPDATE public.external_ad_pricing SET cpm_usd = 2.00, platform_min_daily_usd = 1.00, min_fee_per_day_ngn = 500, note = 'Meta in Nigeria: about N1,500-N2,100 per 1,000 people reached (2026 estimates), so $2 is used. Meta own daily floor is about $1, so small reach is allowed.' WHERE platform IN ('facebook_ads', 'instagram_ads');
UPDATE public.external_ad_pricing SET cpm_usd = 0.50, note = 'TikTok worldwide average is about $0.38 per 1,000 views (Metricool, Nov 2026); no Nigeria figure found, so $0.50 is used. Daily minimum $20 per ad group.' WHERE platform = 'tiktok_ads';
UPDATE public.external_ad_pricing SET cpm_usd = 3.00, note = 'Google/YouTube non-skippable views cost about $3-$8 per 1,000 in Nigeria (Grey, 2026); $3 used. Demand Gen daily minimum is $5.', min_fee_per_day_ngn = 500 WHERE platform = 'google_ads';

DROP FUNCTION IF EXISTS public.external_ad_min_budget(text, integer);
CREATE OR REPLACE FUNCTION public.external_ad_min_budget(_platform text, _days integer DEFAULT 1, _views_per_day integer DEFAULT NULL, _objective text DEFAULT 'awareness') RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _p public.external_ad_pricing%ROWTYPE; _s public.external_ad_pricing_settings%ROWTYPE; _floor numeric; _reach numeric; _spend numeric; _fee numeric; _daily numeric;
        _d integer := greatest(coalesce(_days, 1), 1); _factor numeric;
BEGIN
  SELECT * INTO _p FROM public.external_ad_pricing WHERE platform = _platform;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unsupported platform.'; END IF;
  SELECT * INTO _s FROM public.external_ad_pricing_settings WHERE id;
  _factor := CASE _objective WHEN 'sales' THEN _s.sales_factor WHEN 'traffic' THEN _s.traffic_factor ELSE 1 END;
  _floor := _p.platform_min_daily_usd * _s.usd_to_ngn;
  _reach := coalesce(_views_per_day, 0) / 1000.0 * _p.cpm_usd * _factor * _s.usd_to_ngn;
  _spend := greatest(_floor, _reach);
  _fee := greatest(_spend * _p.fee_percent / 100, _p.min_fee_per_day_ngn);
  _daily := ceil((_spend + _fee) / 100) * 100;                   -- rounded up to the next N100
  RETURN jsonb_build_object('daily_min_ngn', _daily, 'days', _d, 'total_min_ngn', _daily * _d,
    'platform_daily_ngn', round(_spend), 'fee_daily_ngn', _daily - round(_spend),
    'views_per_day', _views_per_day, 'reach_cost_daily_ngn', round(_reach), 'platform_floor_daily_ngn', round(_floor),
    'floor_applied', _floor > _reach);
END $$;
REVOKE ALL ON FUNCTION public.external_ad_min_budget(text, integer, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.external_ad_min_budget(text, integer, integer, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.external_ad_enforce_minimum() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _m jsonb; _total numeric; _share numeric;
BEGIN
  IF NEW.spend_authorized THEN
    _m := public.external_ad_min_budget(NEW.platform, NEW.duration_days, NEW.target_views_per_day, NEW.objective);
    _total := (_m ->> 'total_min_ngn')::numeric;
    IF coalesce(NEW.budget_amount, 0) < _total THEN
      RAISE EXCEPTION 'To reach % people a day on % for % day(s) the budget must be at least N% (N% a day).', coalesce(to_char(NEW.target_views_per_day, 'FM999,999,999'), 'the minimum number of'),
        CASE NEW.platform WHEN 'tiktok_ads' THEN 'TikTok Ads' WHEN 'google_ads' THEN 'Google Ads' WHEN 'facebook_ads' THEN 'Facebook Ads' ELSE 'Instagram Ads' END,
        NEW.duration_days, to_char(_total, 'FM999,999,999'), to_char((_m ->> 'daily_min_ngn')::numeric, 'FM999,999,999');
    END IF;
    _share := (_m ->> 'fee_daily_ngn')::numeric / (_m ->> 'daily_min_ngn')::numeric;
    NEW.min_daily_ngn := (_m ->> 'daily_min_ngn')::numeric;
    NEW.fee_ngn := round(NEW.budget_amount * _share, 2);
    NEW.platform_spend_ngn := NEW.budget_amount - NEW.fee_ngn;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_external_ad_minimum ON public.external_ad_campaigns;
CREATE TRIGGER trg_external_ad_minimum BEFORE INSERT OR UPDATE OF budget_amount, spend_authorized, platform, duration_days, target_views_per_day, objective
  ON public.external_ad_campaigns FOR EACH ROW EXECUTE FUNCTION public.external_ad_enforce_minimum();

-- Admin settings now include the cost per 1,000 views and the objective factors.
DROP FUNCTION IF EXISTS public.admin_set_external_pricing(text, numeric, numeric, numeric, numeric);
CREATE OR REPLACE FUNCTION public.admin_get_external_pricing() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.ad_require_admin();
  RETURN jsonb_build_object(
    'usd_to_ngn', (SELECT usd_to_ngn FROM public.external_ad_pricing_settings WHERE id),
    'traffic_factor', (SELECT traffic_factor FROM public.external_ad_pricing_settings WHERE id),
    'sales_factor', (SELECT sales_factor FROM public.external_ad_pricing_settings WHERE id),
    'platforms', (SELECT jsonb_agg(jsonb_build_object('platform', p.platform, 'platform_min_daily_usd', p.platform_min_daily_usd, 'cpm_usd', p.cpm_usd,
        'fee_percent', p.fee_percent, 'min_fee_per_day_ngn', p.min_fee_per_day_ngn, 'note', p.note,
        'minimum', public.external_ad_min_budget(p.platform, 1),
        'example_1000', public.external_ad_min_budget(p.platform, 1, 1000, 'awareness')) ORDER BY p.platform) FROM public.external_ad_pricing p));
END $$;
CREATE OR REPLACE FUNCTION public.admin_set_external_pricing(_platform text, _min_usd numeric, _cpm_usd numeric, _fee_percent numeric, _min_fee_ngn numeric,
                                                             _usd_to_ngn numeric, _traffic_factor numeric, _sales_factor numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.ad_require_admin();
  IF _usd_to_ngn IS NULL OR _usd_to_ngn <= 0 THEN RAISE EXCEPTION 'Enter the dollar rate.'; END IF;
  UPDATE public.external_ad_pricing SET platform_min_daily_usd = _min_usd, cpm_usd = _cpm_usd, fee_percent = _fee_percent, min_fee_per_day_ngn = _min_fee_ngn, updated_at = now() WHERE platform = _platform;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown platform.'; END IF;
  UPDATE public.external_ad_pricing_settings SET usd_to_ngn = _usd_to_ngn, traffic_factor = _traffic_factor, sales_factor = _sales_factor, updated_at = now() WHERE id;
END $$;
REVOKE ALL ON FUNCTION public.admin_get_external_pricing(), public.admin_set_external_pricing(text, numeric, numeric, numeric, numeric, numeric, numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_external_pricing(), public.admin_set_external_pricing(text, numeric, numeric, numeric, numeric, numeric, numeric, numeric) TO authenticated;

-- "Mark as running" checks the same reach-based minimum before taking the budget from the vendor's ad balance.
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
      _m := public.external_ad_min_budget(_r.platform, _r.duration_days, _r.target_views_per_day, _r.objective);
      IF coalesce(_r.budget_amount, 0) < (_m ->> 'total_min_ngn')::numeric THEN
        RAISE EXCEPTION 'This budget (N%) is below the minimum of N% for its reach and days. Ask the vendor to resubmit with a higher budget.',
          to_char(coalesce(_r.budget_amount, 0), 'FM999,999,999'), to_char((_m ->> 'total_min_ngn')::numeric, 'FM999,999,999'); END IF;
      _kobo := round(_r.budget_amount * 100)::bigint;
      _bal := public.ad_wallet_balance_kobo(_r.vendor_id);
      IF _bal < _kobo THEN
        RAISE EXCEPTION 'The vendor''s ad balance is N% but this campaign needs N%. Ask them to top up first.', to_char(_bal / 100.0, 'FM999,999,999'), to_char(_kobo / 100.0, 'FM999,999,999'); END IF;
      INSERT INTO public.ad_wallet_ledger (vendor_id, kind, amount_kobo, platform, note, created_by)
      VALUES (_r.vendor_id, 'spend', -_kobo, CASE _r.platform WHEN 'google_ads' THEN 'google' WHEN 'tiktok_ads' THEN 'tiktok' ELSE 'meta' END,
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

-- The vendor request now carries the number of people to reach (the old 9-argument version is replaced).
DROP FUNCTION IF EXISTS public.vendor_request_external_campaign(text, text, uuid[], text, numeric, integer, boolean, jsonb, text);
CREATE OR REPLACE FUNCTION public.vendor_request_external_campaign(
  _platform text, _scope text, _product_ids uuid[], _objective text, _budget numeric, _duration_days integer, _authorize_spend boolean,
  _creative_files jsonb DEFAULT '[]'::jsonb, _creative_note text DEFAULT NULL, _views_per_day integer DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _v uuid := public.ad_require_vendor(); _e jsonb; _ids uuid[]; _max integer; _id uuid; _open integer;
        _files jsonb := coalesce(_creative_files, '[]'::jsonb); _f jsonb; _videos integer := 0; _clean jsonb := '[]'::jsonb;
BEGIN
  _e := public.ad_entitlement(_v);
  IF NOT (_e ->> 'active')::boolean OR NOT coalesce((_e -> 'features' ->> 'external_ads_enabled')::boolean, false) THEN
    RAISE EXCEPTION 'Your plan does not include external advertising.'; END IF;
  IF _platform NOT IN ('google_ads', 'facebook_ads', 'instagram_ads', 'tiktok_ads') THEN RAISE EXCEPTION 'Unsupported platform.'; END IF;
  IF _scope NOT IN ('shop', 'products') THEN RAISE EXCEPTION 'Choose shop or products.'; END IF;
  IF _objective NOT IN ('traffic', 'awareness', 'sales') THEN RAISE EXCEPTION 'Unsupported campaign type.'; END IF;
  IF _duration_days IS NULL OR _duration_days NOT BETWEEN 1 AND 90 THEN RAISE EXCEPTION 'Duration must be 1-90 days.'; END IF;
  IF _budget IS NOT NULL AND (_budget < 0 OR _budget > 10000000) THEN RAISE EXCEPTION 'Budget is out of range.'; END IF;
  IF coalesce(_authorize_spend, false) AND coalesce(_budget, 0) <= 0 THEN
    RAISE EXCEPTION 'Enter the budget you are authorising before submitting.'; END IF;
  IF _views_per_day IS NOT NULL AND _views_per_day NOT BETWEEN 100 AND 5000000 THEN RAISE EXCEPTION 'Choose between 100 and 5,000,000 people to reach each day.'; END IF;
  IF coalesce(_authorize_spend, false) AND _views_per_day IS NULL THEN RAISE EXCEPTION 'Choose how many people you want to reach each day.'; END IF;
  IF _creative_note IS NOT NULL AND char_length(_creative_note) > 500 THEN RAISE EXCEPTION 'The note is too long (500 characters at most).'; END IF;

  -- uploaded files: only the vendor's own files in the private bucket, photos or one short video
  IF jsonb_typeof(_files) <> 'array' THEN RAISE EXCEPTION 'Files are not valid.'; END IF;
  IF jsonb_array_length(_files) > 6 THEN RAISE EXCEPTION 'You can attach up to 6 files.'; END IF;
  FOR _f IN SELECT * FROM jsonb_array_elements(_files) LOOP
    IF coalesce(_f ->> 'kind', '') NOT IN ('photo', 'video') THEN RAISE EXCEPTION 'Each file must be a photo or a video.'; END IF;
    IF coalesce(_f ->> 'path', '') !~ ('^' || _v::text || '/[A-Za-z0-9._-]{1,120}$') THEN RAISE EXCEPTION 'You can only attach files you uploaded.'; END IF;
    IF NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'ad-creatives' AND o.name = _f ->> 'path') THEN
      RAISE EXCEPTION 'A file was not uploaded completely. Upload it again.'; END IF;
    IF _f ->> 'kind' = 'video' THEN _videos := _videos + 1; END IF;
    _clean := _clean || jsonb_build_array(jsonb_build_object('kind', _f ->> 'kind', 'path', _f ->> 'path',
      'name', left(coalesce(_f ->> 'name', ''), 120), 'size', coalesce((_f ->> 'size')::bigint, 0)));
  END LOOP;
  IF _videos > 1 THEN RAISE EXCEPTION 'Attach one video at most.'; END IF;
  IF coalesce(_authorize_spend, false) AND jsonb_array_length(_clean) = 0 THEN
    RAISE EXCEPTION 'Add at least one photo or a video. It is the picture or clip your ad will show.'; END IF;

  IF _scope = 'products' THEN
    _ids := ARRAY(SELECT DISTINCT x FROM unnest(coalesce(_product_ids, '{}'::uuid[])) AS x);
    _max := (_e -> 'features' ->> 'max_advertised_products')::integer;
    IF cardinality(_ids) = 0 THEN RAISE EXCEPTION 'Select at least one product.'; END IF;
    IF cardinality(_ids) > _max THEN RAISE EXCEPTION 'Your plan allows up to % advertised products.', _max; END IF;
    IF (SELECT count(*) FROM public.products WHERE id = ANY (_ids) AND vendor_id = _v AND is_active) <> cardinality(_ids) THEN
      RAISE EXCEPTION 'You can only advertise your own active products.'; END IF;
  ELSE
    _ids := '{}';
  END IF;
  SELECT count(*) INTO _open FROM public.external_ad_campaigns
   WHERE vendor_id = _v AND status NOT IN ('rejected', 'ended', 'failed', 'cancelled');
  IF _open >= 10 THEN RAISE EXCEPTION 'You have too many open external campaigns. Cancel one first.'; END IF;
  INSERT INTO public.external_ad_campaigns
    (vendor_id, platform, scope, product_ids, objective, budget_amount, duration_days, spend_authorized, spend_authorized_at, status, status_detail, creative_files, creative_note, target_views_per_day)
  VALUES (_v, _platform, _scope, _ids, _objective, _budget, _duration_days, coalesce(_authorize_spend, false),
          CASE WHEN coalesce(_authorize_spend, false) THEN now() END,
          CASE WHEN coalesce(_authorize_spend, false) THEN 'pending_integration' ELSE 'draft' END,
          CASE WHEN coalesce(_authorize_spend, false)
               THEN 'Waiting for ITHUBAFRICA to connect this ad platform. Nothing is running and no money has been spent.'
               ELSE 'Draft. Authorise your budget to submit this request. Nothing is running and no money has been spent.' END,
          _clean, NULLIF(btrim(coalesce(_creative_note, '')), ''), _views_per_day)
  RETURNING id INTO _id;
  RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.vendor_request_external_campaign(text, text, uuid[], text, numeric, integer, boolean, jsonb, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vendor_request_external_campaign(text, text, uuid[], text, numeric, integer, boolean, jsonb, text, integer) TO authenticated;

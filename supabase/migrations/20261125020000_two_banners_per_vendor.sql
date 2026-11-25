-- A vendor can now run a second shop banner at the same time as the first.
-- Slot 1 is the banner created automatically after payment. Slot 2 is added by the vendor (or an admin) on request.
-- How many banners one vendor may run is an admin setting (advertising_settings.max_banners_per_vendor, 1 to 2).

ALTER TABLE public.vendor_advertising_campaigns ADD COLUMN IF NOT EXISTS slot smallint NOT NULL DEFAULT 1;
ALTER TABLE public.vendor_advertising_campaigns DROP CONSTRAINT IF EXISTS ad_campaign_slot_range;
ALTER TABLE public.vendor_advertising_campaigns ADD CONSTRAINT ad_campaign_slot_range CHECK (slot BETWEEN 1 AND 2);
ALTER TABLE public.advertising_settings ADD COLUMN IF NOT EXISTS max_banners_per_vendor smallint NOT NULL DEFAULT 2;
ALTER TABLE public.advertising_settings DROP CONSTRAINT IF EXISTS ad_settings_max_banners;
ALTER TABLE public.advertising_settings ADD CONSTRAINT ad_settings_max_banners CHECK (max_banners_per_vendor BETWEEN 1 AND 2);

DROP INDEX IF EXISTS public.uq_ad_campaign_one_open_per_type;
CREATE UNIQUE INDEX IF NOT EXISTS uq_ad_campaign_one_open_per_slot ON public.vendor_advertising_campaigns (vendor_id, campaign_type, slot)
  WHERE status IN ('pending_generation', 'generating', 'pending_review', 'active', 'paused');

-- The automatic (payment-triggered) campaign only ever looks at slot 1, so a second banner is never extended, reused or replaced by it.
CREATE OR REPLACE FUNCTION public.ensure_ad_campaign_for_vendor(_vendor_id uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _e jsonb; _f jsonb; _s public.advertising_settings%ROWTYPE; _last public.vendor_advertising_campaigns%ROWTYPE;
  _exp timestamptz; _end timestamptz; _sub uuid; _new uuid; _placements text[]; _reuse boolean;
BEGIN
  SELECT * INTO _s FROM public.advertising_settings WHERE id;
  IF NOT _s.ads_enabled THEN RETURN NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.vendors WHERE id = _vendor_id AND is_approved) THEN RETURN NULL; END IF;
  _e := public.ad_entitlement(_vendor_id);
  _f := _e -> 'features';
  IF NOT (_e ->> 'active')::boolean OR NOT coalesce((_f ->> 'homepage_promotion_enabled')::boolean, false) THEN RETURN NULL; END IF;
  _exp := (_e ->> 'expires_at')::timestamptz;
  _end := now() + make_interval(days => (_f ->> 'campaign_duration_days')::integer);
  IF _exp IS NOT NULL AND _exp < _end THEN _end := _exp; END IF;
  _placements := public.ad_placements_for(_f);
  SELECT id INTO _sub FROM public.supplier_membership_payments
   WHERE vendor_id = _vendor_id AND status = 'success' ORDER BY paid_at DESC NULLS LAST, created_at DESC LIMIT 1;

  -- Renewal / upgrade: every open shop banner (both slots) gets the new end date and placements.
  UPDATE public.vendor_advertising_campaigns
     SET end_date = greatest(end_date, _end), placements = _placements, subscription_id = coalesce(_sub, subscription_id)
   WHERE vendor_id = _vendor_id AND campaign_type = 'shop_promotion'
     AND status IN ('pending_generation', 'generating', 'pending_review', 'active', 'paused');

  SELECT * INTO _last FROM public.vendor_advertising_campaigns
   WHERE vendor_id = _vendor_id AND campaign_type = 'shop_promotion' AND slot = 1 ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF FOUND AND _last.status IN ('pending_generation', 'generating', 'pending_review', 'active', 'paused') THEN RETURN _last.id; END IF;

  _reuse := FOUND AND _last.status = 'expired' AND _last.banner_image_url IS NOT NULL AND _last.banner_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.vendor_advertising_banners b WHERE b.id = _last.banner_id AND b.moderation_status = 'approved');
  INSERT INTO public.vendor_advertising_campaigns
    (vendor_id, campaign_type, slot, subscription_id, status, start_date, end_date, placements, target_shop_id,
     destination_url, banner_id, banner_image_url, banner_public_id, headline, description, custom_headline, custom_description)
  VALUES
    (_vendor_id, 'shop_promotion', 1, _sub, CASE WHEN _reuse THEN 'active' ELSE 'pending_generation' END, now(), _end, _placements,
     _vendor_id, '/shop/' || _vendor_id::text,
     CASE WHEN _reuse THEN _last.banner_id END, CASE WHEN _reuse THEN _last.banner_image_url END,
     CASE WHEN _reuse THEN _last.banner_public_id END, CASE WHEN _reuse THEN _last.headline END,
     CASE WHEN _reuse THEN _last.description END,
     CASE WHEN _reuse THEN _last.custom_headline END, CASE WHEN _reuse THEN _last.custom_description END)
  RETURNING id INTO _new;
  IF NOT _reuse THEN PERFORM public.ad_enqueue_job(_new, _vendor_id, 'initial', true, 'initial:' || _new::text); END IF;
  RETURN _new;
END $$;

-- Add the second shop banner. Uses one banner creation from the plan, same as any new banner.
CREATE OR REPLACE FUNCTION public.vendor_add_second_banner() RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _v uuid := public.ad_require_vendor(); _s public.advertising_settings%ROWTYPE; _e jsonb; _f jsonb; _first public.vendor_advertising_campaigns%ROWTYPE; _new uuid;
BEGIN
  SELECT * INTO _s FROM public.advertising_settings WHERE id;
  IF NOT _s.ads_enabled THEN RAISE EXCEPTION 'Advertising is temporarily unavailable.'; END IF;
  IF _s.max_banners_per_vendor < 2 THEN RAISE EXCEPTION 'Only one banner per shop is allowed right now.'; END IF;
  IF NOT _s.ai_generation_enabled THEN RAISE EXCEPTION 'Banner generation is temporarily unavailable.'; END IF;
  _e := public.ad_entitlement(_v); _f := _e -> 'features';
  IF NOT (_e ->> 'active')::boolean OR NOT coalesce((_f ->> 'homepage_promotion_enabled')::boolean, false) THEN
    RAISE EXCEPTION 'Your plan does not include homepage promotion.'; END IF;
  IF (_e ->> 'generations_used')::integer >= (_e ->> 'generations_allowed')::integer THEN
    RAISE EXCEPTION 'You have used all banner generations included in your plan.'; END IF;
  SELECT * INTO _first FROM public.vendor_advertising_campaigns
   WHERE vendor_id = _v AND campaign_type = 'shop_promotion' AND slot = 1
     AND status IN ('pending_generation', 'generating', 'pending_review', 'active', 'paused') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Your first banner must be running before you add a second one.'; END IF;
  BEGIN
    INSERT INTO public.vendor_advertising_campaigns
      (vendor_id, campaign_type, slot, subscription_id, status, start_date, end_date, placements, target_shop_id, destination_url)
    VALUES (_v, 'shop_promotion', 2, _first.subscription_id, 'pending_generation', now(), _first.end_date, _first.placements, _v, '/shop/' || _v::text)
    RETURNING id INTO _new;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'You already have a second banner.';
  END;
  PERFORM public.ad_enqueue_job(_new, _v, 'initial', true, 'initial:' || _new::text);
  RETURN _new;
END $$;

REVOKE ALL ON FUNCTION public.vendor_add_second_banner() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vendor_add_second_banner() TO authenticated;
NOTIFY pgrst, 'reload schema';

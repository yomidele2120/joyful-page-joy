-- Vendors and admins can delete a campaign's banner. The picture stops showing straight away: a live campaign is paused
-- (nothing is shown without a banner), and a new banner can be created afterwards. The vendor's wording is kept.
-- Banner pictures already uploaded stay in the image host's storage; they are no longer linked from anywhere on the site.
CREATE OR REPLACE FUNCTION public.ad_delete_campaign_banner(_campaign uuid, _by text) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _c public.vendor_advertising_campaigns%ROWTYPE; _n integer;
BEGIN
  SELECT * INTO _c FROM public.vendor_advertising_campaigns WHERE id = _campaign FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Campaign not found.'; END IF;
  IF _c.status IN ('cancelled', 'expired', 'rejected') THEN RAISE EXCEPTION 'This campaign has ended, so its banner cannot be changed.'; END IF;
  IF _c.banner_id IS NULL AND _c.banner_image_url IS NULL AND NOT EXISTS (SELECT 1 FROM public.vendor_advertising_banners WHERE campaign_id = _campaign) THEN
    RAISE EXCEPTION 'There is no banner to delete.'; END IF;
  UPDATE public.vendor_advertising_campaigns SET banner_id = NULL, banner_image_url = NULL, banner_public_id = NULL,
         status = CASE WHEN status IN ('active', 'pending_review') THEN 'paused' ELSE status END,
         paused_by = CASE WHEN status IN ('active', 'pending_review') THEN _by ELSE paused_by END
   WHERE id = _campaign;
  DELETE FROM public.vendor_advertising_banners WHERE campaign_id = _campaign;
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END $$;

CREATE OR REPLACE FUNCTION public.vendor_delete_banner(_campaign uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _v uuid := public.ad_require_vendor();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.vendor_advertising_campaigns WHERE id = _campaign AND vendor_id = _v) THEN RAISE EXCEPTION 'Campaign not found.'; END IF;
  RETURN public.ad_delete_campaign_banner(_campaign, 'vendor');
END $$;

CREATE OR REPLACE FUNCTION public.admin_delete_banner(_campaign uuid, _note text DEFAULT NULL) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _vendor uuid; _n integer;
BEGIN
  PERFORM public.ad_require_admin();
  SELECT vendor_id INTO _vendor FROM public.vendor_advertising_campaigns WHERE id = _campaign;
  IF _vendor IS NULL THEN RAISE EXCEPTION 'Campaign not found.'; END IF;
  _n := public.ad_delete_campaign_banner(_campaign, 'admin');
  UPDATE public.vendor_advertising_campaigns SET admin_note = left(coalesce(nullif(btrim(_note), ''), admin_note), 500) WHERE id = _campaign;
  PERFORM public.ad_notify_vendor(_vendor, 'ITHUBAFRICA removed the banner on your campaign. You can create a new one from your Advertising tab.');
  RETURN _n;
END $$;

REVOKE ALL ON FUNCTION public.ad_delete_campaign_banner(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.vendor_delete_banner(uuid), public.admin_delete_banner(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vendor_delete_banner(uuid), public.admin_delete_banner(uuid, text) TO authenticated;

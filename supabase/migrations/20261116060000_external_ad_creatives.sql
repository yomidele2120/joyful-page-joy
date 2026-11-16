-- =====================================================================
-- PHASE 7: vendors upload photos / a video with each external ad request.
-- Run after 20261116050000_featured_slideshow.sql. Safe to run twice.
-- Why: ITHUBAFRICA does not publish to Google/Facebook/Instagram/TikTok automatically. The vendor's own photos or video are
-- the creative (the picture/clip people see in the ad) that an admin uses when setting the ad up on the platform.
-- Files go to a PRIVATE storage bucket (only the vendor who uploaded and admins can read them).
-- =====================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('ad-creatives', 'ad-creatives', false, 52428800,
  ARRAY['image/jpeg','image/png','image/webp','video/mp4','video/quicktime','video/webm'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 52428800,
  allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','video/mp4','video/quicktime','video/webm'];

-- storage policies: first folder in the path is the vendor id
DROP POLICY IF EXISTS "ad creatives: vendor upload" ON storage.objects;
CREATE POLICY "ad creatives: vendor upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'ad-creatives' AND EXISTS (
    SELECT 1 FROM public.vendors v WHERE v.user_id = auth.uid() AND v.id::text = (storage.foldername(name))[1]));
DROP POLICY IF EXISTS "ad creatives: vendor or admin read" ON storage.objects;
CREATE POLICY "ad creatives: vendor or admin read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'ad-creatives' AND (public.has_role(auth.uid(), 'admin') OR EXISTS (
    SELECT 1 FROM public.vendors v WHERE v.user_id = auth.uid() AND v.id::text = (storage.foldername(name))[1])));
DROP POLICY IF EXISTS "ad creatives: vendor delete own" ON storage.objects;
CREATE POLICY "ad creatives: vendor delete own" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'ad-creatives' AND EXISTS (
    SELECT 1 FROM public.vendors v WHERE v.user_id = auth.uid() AND v.id::text = (storage.foldername(name))[1]));

ALTER TABLE public.external_ad_campaigns ADD COLUMN IF NOT EXISTS creative_files jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.external_ad_campaigns ADD COLUMN IF NOT EXISTS creative_note text;
ALTER TABLE public.external_ad_campaigns DROP CONSTRAINT IF EXISTS external_ad_creative_note_len;
ALTER TABLE public.external_ad_campaigns ADD CONSTRAINT external_ad_creative_note_len CHECK (creative_note IS NULL OR char_length(creative_note) <= 500);

-- the old 7-argument version is replaced (keeping both would make calls ambiguous)
DROP FUNCTION IF EXISTS public.vendor_request_external_campaign(text, text, uuid[], text, numeric, integer, boolean);

CREATE OR REPLACE FUNCTION public.vendor_request_external_campaign(
  _platform text, _scope text, _product_ids uuid[], _objective text, _budget numeric, _duration_days integer, _authorize_spend boolean,
  _creative_files jsonb DEFAULT '[]'::jsonb, _creative_note text DEFAULT NULL
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
    (vendor_id, platform, scope, product_ids, objective, budget_amount, duration_days, spend_authorized, spend_authorized_at, status, status_detail, creative_files, creative_note)
  VALUES (_v, _platform, _scope, _ids, _objective, _budget, _duration_days, coalesce(_authorize_spend, false),
          CASE WHEN coalesce(_authorize_spend, false) THEN now() END,
          CASE WHEN coalesce(_authorize_spend, false) THEN 'pending_integration' ELSE 'draft' END,
          CASE WHEN coalesce(_authorize_spend, false)
               THEN 'Waiting for ITHUBAFRICA to connect this ad platform. Nothing is running and no money has been spent.'
               ELSE 'Draft. Authorise your budget to submit this request. Nothing is running and no money has been spent.' END,
          _clean, NULLIF(btrim(coalesce(_creative_note, '')), ''))
  RETURNING id INTO _id;
  RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.vendor_request_external_campaign(text, text, uuid[], text, numeric, integer, boolean, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vendor_request_external_campaign(text, text, uuid[], text, numeric, integer, boolean, jsonb, text) TO authenticated;

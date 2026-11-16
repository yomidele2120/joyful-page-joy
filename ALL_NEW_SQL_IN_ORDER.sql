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

-- ===== PHASE 8: 20261116070000_ai_ad_images.sql =====
-- =====================================================================
-- PHASE 8: vendors can generate an ad image from a text prompt instead of uploading one. Paid from the ad balance.
-- Run after 20261116060000_external_ad_creatives.sql. Safe to run twice.
--   * The price is an admin setting (default 200 naira). The balance is checked and the price is deducted in ONE locked step
--     when generation starts, so two clicks at once cannot spend the same money.
--   * If the image cannot be delivered (provider error, timeout, blocked by safety review) the charge is refunded exactly once.
--   * Every charge and refund is a line in the ad wallet ledger. This is ad-balance spend, never subscription money, so it has
--     no effect on referral commissions.
-- =====================================================================

ALTER TABLE public.ad_wallet_settings ADD COLUMN IF NOT EXISTS ai_image_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE public.ad_wallet_settings ADD COLUMN IF NOT EXISTS ai_image_price_kobo bigint NOT NULL DEFAULT 20000 CHECK (ai_image_price_kobo BETWEEN 1000 AND 10000000);
ALTER TABLE public.ad_wallet_settings ADD COLUMN IF NOT EXISTS ai_image_hourly_limit integer NOT NULL DEFAULT 10 CHECK (ai_image_hourly_limit BETWEEN 1 AND 200);
ALTER TABLE public.ad_wallet_settings ADD COLUMN IF NOT EXISTS ai_image_daily_limit integer NOT NULL DEFAULT 500 CHECK (ai_image_daily_limit BETWEEN 1 AND 100000);

CREATE TABLE IF NOT EXISTS public.ad_ai_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  prompt text NOT NULL CHECK (char_length(prompt) BETWEEN 10 AND 400),
  status text NOT NULL DEFAULT 'generating' CHECK (status IN ('generating', 'done', 'failed')),
  price_kobo bigint NOT NULL CHECK (price_kobo > 0),
  refunded boolean NOT NULL DEFAULT false,
  storage_path text,
  error_code text CHECK (error_code IS NULL OR char_length(error_code) <= 60),
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_ad_ai_images_vendor ON public.ad_ai_images (vendor_id, created_at DESC);
ALTER TABLE public.ad_ai_images ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ad_ai_images FROM PUBLIC, anon, authenticated;   -- no direct access: functions only

-- ledger: two new kinds, each tied to the image so a charge or refund can be recorded only once
ALTER TABLE public.ad_wallet_ledger DROP CONSTRAINT IF EXISTS ad_wallet_ledger_kind_check;
ALTER TABLE public.ad_wallet_ledger ADD CONSTRAINT ad_wallet_ledger_kind_check CHECK (kind IN ('topup', 'spend', 'adjustment', 'ai_image', 'ai_image_refund'));
ALTER TABLE public.ad_wallet_ledger DROP CONSTRAINT IF EXISTS ledger_sign;
ALTER TABLE public.ad_wallet_ledger ADD CONSTRAINT ledger_sign CHECK (
  (kind = 'topup' AND amount_kobo > 0) OR (kind = 'spend' AND amount_kobo < 0) OR kind = 'adjustment'
  OR (kind = 'ai_image' AND amount_kobo < 0) OR (kind = 'ai_image_refund' AND amount_kobo > 0));
ALTER TABLE public.ad_wallet_ledger ADD COLUMN IF NOT EXISTS ai_image_id uuid REFERENCES public.ad_ai_images(id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ad_ledger_ai_image ON public.ad_wallet_ledger (ai_image_id, kind) WHERE ai_image_id IS NOT NULL;

-- what the vendor screen shows before they press Generate
CREATE OR REPLACE FUNCTION public.ai_image_info() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _v uuid := public.ad_require_vendor(); _s public.ad_wallet_settings%ROWTYPE;
BEGIN
  SELECT * INTO _s FROM public.ad_wallet_settings WHERE id;
  RETURN jsonb_build_object('enabled', _s.ai_image_enabled AND _s.enabled, 'price_kobo', _s.ai_image_price_kobo,
    'balance_kobo', public.ad_wallet_balance_kobo(_v),
    'left_this_hour', GREATEST(0, _s.ai_image_hourly_limit - (SELECT count(*) FROM public.ad_ai_images WHERE vendor_id = _v AND created_at > now() - interval '1 hour')));
END $$;
REVOKE ALL ON FUNCTION public.ai_image_info() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_image_info() TO authenticated;

-- START: check everything, deduct the price, create the job. Called with the vendor's own login.
CREATE OR REPLACE FUNCTION public.vendor_start_ai_image(_prompt text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _v uuid := public.ad_require_vendor(); _e jsonb; _s public.ad_wallet_settings%ROWTYPE; _p text := btrim(coalesce(_prompt, ''));
        _bal bigint; _id uuid;
BEGIN
  _e := public.ad_entitlement(_v);
  IF NOT (_e ->> 'active')::boolean OR NOT coalesce((_e -> 'features' ->> 'external_ads_enabled')::boolean, false) THEN
    RAISE EXCEPTION 'Your plan does not include external advertising.'; END IF;
  SELECT * INTO _s FROM public.ad_wallet_settings WHERE id;
  IF NOT _s.enabled OR NOT _s.ai_image_enabled THEN RAISE EXCEPTION 'AI image generation is switched off right now.'; END IF;
  IF char_length(_p) < 10 OR char_length(_p) > 400 THEN RAISE EXCEPTION 'Describe the picture in 10 to 400 characters.'; END IF;
  IF _p ~* '(https?://|www\.|@)' THEN RAISE EXCEPTION 'Do not put links or @handles in the description.'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('ai_image:' || _v::text, 0));   -- one purchase at a time per vendor
  IF (SELECT count(*) FROM public.ad_ai_images WHERE vendor_id = _v AND status = 'generating' AND created_at > now() - interval '10 minutes') >= 2 THEN
    RAISE EXCEPTION 'Two images are already being made. Wait for them to finish.'; END IF;
  IF (SELECT count(*) FROM public.ad_ai_images WHERE vendor_id = _v AND created_at > now() - interval '1 hour') >= _s.ai_image_hourly_limit THEN
    RAISE EXCEPTION 'You have reached the hourly limit for AI images. Try again later.'; END IF;
  IF (SELECT count(*) FROM public.ad_ai_images WHERE created_at > now() - interval '1 day') >= _s.ai_image_daily_limit THEN
    RAISE EXCEPTION 'AI image generation is busy today. Please try again tomorrow or upload your own photo.'; END IF;

  _bal := public.ad_wallet_balance_kobo(_v);
  IF _bal < _s.ai_image_price_kobo THEN
    RAISE EXCEPTION 'Not enough advertising balance. An AI image costs % naira and your balance is % naira. Add funds first.',
      (_s.ai_image_price_kobo / 100), (_bal / 100); END IF;

  INSERT INTO public.ad_ai_images (vendor_id, prompt, price_kobo) VALUES (_v, _p, _s.ai_image_price_kobo) RETURNING id INTO _id;
  INSERT INTO public.ad_wallet_ledger (vendor_id, kind, amount_kobo, note, ai_image_id)
    VALUES (_v, 'ai_image', -_s.ai_image_price_kobo, 'AI ad image', _id);
  RETURN jsonb_build_object('id', _id, 'price_kobo', _s.ai_image_price_kobo, 'balance_kobo', _bal - _s.ai_image_price_kobo);
END $$;
REVOKE ALL ON FUNCTION public.vendor_start_ai_image(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vendor_start_ai_image(text) TO authenticated;

-- FINISH (service role only, called by the edge function)
CREATE OR REPLACE FUNCTION public.finish_ai_image_success(_id uuid, _path text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _r public.ad_ai_images%ROWTYPE;
BEGIN
  SELECT * INTO _r FROM public.ad_ai_images WHERE id = _id FOR UPDATE;
  IF NOT FOUND OR _r.status <> 'generating' THEN RETURN false; END IF;
  IF _path IS NULL OR _path !~ ('^' || _r.vendor_id::text || '/[A-Za-z0-9._-]{1,120}$') THEN RAISE EXCEPTION 'Bad storage path'; END IF;
  UPDATE public.ad_ai_images SET status = 'done', storage_path = _path, finished_at = now() WHERE id = _id;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.finish_ai_image_success(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_ai_image_success(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.finish_ai_image_failure(_id uuid, _code text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _r public.ad_ai_images%ROWTYPE;
BEGIN
  SELECT * INTO _r FROM public.ad_ai_images WHERE id = _id FOR UPDATE;
  IF NOT FOUND OR _r.status <> 'generating' OR _r.refunded THEN RETURN false; END IF;
  UPDATE public.ad_ai_images SET status = 'failed', refunded = true, error_code = left(coalesce(_code, 'failed'), 60), finished_at = now() WHERE id = _id;
  INSERT INTO public.ad_wallet_ledger (vendor_id, kind, amount_kobo, note, ai_image_id)
    VALUES (_r.vendor_id, 'ai_image_refund', _r.price_kobo, 'Refund: the AI image could not be made', _id) ON CONFLICT DO NOTHING;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.finish_ai_image_failure(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_ai_image_failure(uuid, text) TO service_role;

-- safety net: a job stuck for 10 minutes (function crashed or timed out) is refunded
CREATE OR REPLACE FUNCTION public.refund_stuck_ai_images() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _r record; _n integer := 0;
BEGIN
  FOR _r IN SELECT id FROM public.ad_ai_images WHERE status = 'generating' AND created_at < now() - interval '10 minutes' LOOP
    IF public.finish_ai_image_failure(_r.id, 'timed_out') THEN _n := _n + 1; END IF;
  END LOOP;
  RETURN _n;
END $$;
REVOKE ALL ON FUNCTION public.refund_stuck_ai_images() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refund_stuck_ai_images() TO service_role;

-- admin: how the feature is doing (charged vs refunded vs estimated provider cost)
CREATE OR REPLACE FUNCTION public.admin_ai_image_summary(_days integer DEFAULT 30) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.ad_require_admin();
  RETURN (SELECT jsonb_build_object(
    'delivered', count(*) FILTER (WHERE status = 'done'),
    'refunded', count(*) FILTER (WHERE refunded),
    'revenue_kobo', COALESCE(sum(price_kobo) FILTER (WHERE status = 'done'), 0),
    'est_provider_cost_usd', round((count(*) FILTER (WHERE status = 'done') * (SELECT ai_cost_per_image_usd FROM public.advertising_settings WHERE id))::numeric, 2))
    FROM public.ad_ai_images WHERE created_at > now() - make_interval(days => GREATEST(1, LEAST(COALESCE(_days, 30), 365))));
END $$;
REVOKE ALL ON FUNCTION public.admin_ai_image_summary(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_ai_image_summary(integer) TO authenticated;

-- ===== PHASE 9: 20261116080000_auto_product_images.sql =====
-- =====================================================================
-- PHASE 9: automatic AI pictures for products that have NO picture, for vendors an admin has switched on
-- (at first only "TechHub Operations Limited"). Run after 20261116070000_ai_ad_images.sql. Safe to run twice.
--   * Opt-in per vendor (table auto_image_vendors). Every other vendor is untouched.
--   * Only active products with no image_url and no images are picked up. A picture the vendor uploads is never replaced.
--   * A background worker (edge function auto-product-images) makes one picture per product, at most N per day (platform cost,
--     so there is a daily cap), tries each product at most 3 times, and marks the product ai_generated_image so the shop can
--     label it "AI-generated illustration". If the vendor later changes the pictures, the label is removed automatically.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.auto_image_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  enabled boolean NOT NULL DEFAULT true,
  daily_limit integer NOT NULL DEFAULT 100 CHECK (daily_limit BETWEEN 0 AND 5000),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.auto_image_settings (id) VALUES (true) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.auto_image_vendors (
  vendor_id uuid PRIMARY KEY REFERENCES public.vendors(id) ON DELETE CASCADE,
  enabled_at timestamptz NOT NULL DEFAULT now(),
  enabled_by uuid
);

CREATE TABLE IF NOT EXISTS public.auto_product_image_jobs (
  product_id uuid PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'working', 'done', 'failed', 'skipped')),
  attempts smallint NOT NULL DEFAULT 0,
  error_code text CHECK (error_code IS NULL OR char_length(error_code) <= 60),
  claimed_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_auto_image_jobs_status ON public.auto_product_image_jobs (status, created_at);

ALTER TABLE public.auto_image_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auto_image_vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auto_product_image_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.auto_image_settings, public.auto_image_vendors, public.auto_product_image_jobs FROM PUBLIC, anon, authenticated;

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS ai_generated_image boolean NOT NULL DEFAULT false;

-- if anyone other than the worker changes a product's pictures, the "AI-generated" label no longer applies
CREATE OR REPLACE FUNCTION public.trg_products_clear_ai_image_flag() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.ai_generated_image AND coalesce(current_setting('app.auto_image', true), '') <> 'on'
     AND (NEW.image_url IS DISTINCT FROM OLD.image_url OR NEW.images IS DISTINCT FROM OLD.images) THEN
    NEW.ai_generated_image := false;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS products_clear_ai_image_flag ON public.products;
CREATE TRIGGER products_clear_ai_image_flag BEFORE UPDATE OF image_url, images ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.trg_products_clear_ai_image_flag();

-- ---------- admin controls ----------
CREATE OR REPLACE FUNCTION public.admin_set_auto_product_images(_vendor uuid, _enabled boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admins only'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.vendors WHERE id = _vendor) THEN RAISE EXCEPTION 'Vendor not found'; END IF;
  IF _enabled THEN INSERT INTO public.auto_image_vendors (vendor_id, enabled_by) VALUES (_vendor, auth.uid()) ON CONFLICT DO NOTHING;
  ELSE DELETE FROM public.auto_image_vendors WHERE vendor_id = _vendor; END IF;
END $$;
REVOKE ALL ON FUNCTION public.admin_set_auto_product_images(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_auto_product_images(uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_auto_product_images_status() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admins only'; END IF;
  RETURN jsonb_build_object(
    'enabled', (SELECT enabled FROM public.auto_image_settings WHERE id), 'daily_limit', (SELECT daily_limit FROM public.auto_image_settings WHERE id),
    'vendors', COALESCE((SELECT jsonb_agg(jsonb_build_object('vendor_id', v.id, 'store_name', v.store_name)) FROM public.auto_image_vendors a JOIN public.vendors v ON v.id = a.vendor_id), '[]'::jsonb),
    'done', (SELECT count(*) FROM public.auto_product_image_jobs WHERE status = 'done'),
    'pending', (SELECT count(*) FROM public.auto_product_image_jobs WHERE status IN ('pending', 'working')),
    'failed', (SELECT count(*) FROM public.auto_product_image_jobs WHERE status = 'failed'),
    'made_today', (SELECT count(*) FROM public.auto_product_image_jobs WHERE status = 'done' AND finished_at > now() - interval '1 day'));
END $$;
REVOKE ALL ON FUNCTION public.admin_auto_product_images_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_auto_product_images_status() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_auto_product_image_limit(_enabled boolean, _daily_limit integer) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admins only'; END IF;
  UPDATE public.auto_image_settings SET enabled = COALESCE(_enabled, true), daily_limit = GREATEST(0, LEAST(COALESCE(_daily_limit, 100), 5000)), updated_at = now() WHERE id;
END $$;
REVOKE ALL ON FUNCTION public.admin_set_auto_product_image_limit(boolean, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_auto_product_image_limit(boolean, integer) TO authenticated;

-- ---------- worker functions (service role only) ----------
-- Finds picture-less products of switched-on vendors, queues them, and hands out up to _max jobs (respecting the daily cap).
CREATE OR REPLACE FUNCTION public.claim_auto_product_images(_max integer DEFAULT 3) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _s public.auto_image_settings%ROWTYPE; _room integer; _out jsonb;
BEGIN
  SELECT * INTO _s FROM public.auto_image_settings WHERE id;
  IF NOT _s.enabled THEN RETURN '[]'::jsonb; END IF;
  UPDATE public.auto_product_image_jobs SET status = 'pending' WHERE status = 'working' AND claimed_at < now() - interval '15 minutes';
  INSERT INTO public.auto_product_image_jobs (product_id)
    SELECT p.id FROM public.products p JOIN public.auto_image_vendors a ON a.vendor_id = p.vendor_id
     WHERE p.is_active IS NOT FALSE AND coalesce(btrim(p.image_url), '') = '' AND coalesce(cardinality(p.images), 0) = 0
    ON CONFLICT DO NOTHING;
  _room := _s.daily_limit - (SELECT count(*) FROM public.auto_product_image_jobs WHERE claimed_at > now() - interval '1 day' AND status IN ('working', 'done', 'pending') AND attempts > 0)::integer;
  IF _room <= 0 THEN RETURN '[]'::jsonb; END IF;
  WITH picked AS (
    SELECT j.product_id FROM public.auto_product_image_jobs j
     WHERE j.status = 'pending' AND j.attempts < 3 ORDER BY j.created_at LIMIT LEAST(GREATEST(_max, 1), 5, _room) FOR UPDATE SKIP LOCKED),
  upd AS (
    UPDATE public.auto_product_image_jobs j SET status = 'working', attempts = j.attempts + 1, claimed_at = now()
      FROM picked WHERE j.product_id = picked.product_id RETURNING j.product_id)
  SELECT COALESCE(jsonb_agg(jsonb_build_object('product_id', p.id, 'vendor_id', p.vendor_id, 'name', p.name, 'brand', p.brand,
           'category', c.name, 'description', left(coalesce(p.description, ''), 300))), '[]'::jsonb)
    INTO _out FROM upd JOIN public.products p ON p.id = upd.product_id LEFT JOIN public.categories c ON c.id = p.category_id;
  RETURN _out;
END $$;
REVOKE ALL ON FUNCTION public.claim_auto_product_images(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_auto_product_images(integer) TO service_role;

-- Saves the picture, but only if the product STILL has none (a picture the vendor added meanwhile always wins).
CREATE OR REPLACE FUNCTION public.finish_auto_product_image(_product uuid, _url text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _n integer;
BEGIN
  IF _url IS NULL OR _url !~ '^https://' THEN RAISE EXCEPTION 'Bad image url'; END IF;
  PERFORM set_config('app.auto_image', 'on', true);
  UPDATE public.products SET image_url = _url, images = ARRAY[_url], ai_generated_image = true
   WHERE id = _product AND coalesce(btrim(image_url), '') = '' AND coalesce(cardinality(images), 0) = 0;
  GET DIAGNOSTICS _n = ROW_COUNT;
  UPDATE public.auto_product_image_jobs SET status = CASE WHEN _n = 1 THEN 'done' ELSE 'skipped' END, finished_at = now(), error_code = CASE WHEN _n = 1 THEN NULL ELSE 'has_image' END
   WHERE product_id = _product;
  RETURN _n = 1;
END $$;
REVOKE ALL ON FUNCTION public.finish_auto_product_image(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_auto_product_image(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.fail_auto_product_image(_product uuid, _code text, _retry boolean) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.auto_product_image_jobs
     SET status = CASE WHEN _retry AND attempts < 3 THEN 'pending' ELSE 'failed' END, error_code = left(coalesce(_code, 'failed'), 60),
         finished_at = CASE WHEN _retry AND attempts < 3 THEN NULL ELSE now() END
   WHERE product_id = _product AND status = 'working';
$$;
REVOKE ALL ON FUNCTION public.fail_auto_product_image(uuid, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fail_auto_product_image(uuid, text, boolean) TO service_role;

-- ---------- switch on the first vendor ----------
DO $$
DECLARE _n integer;
BEGIN
  SELECT count(*) INTO _n FROM public.vendors WHERE lower(btrim(store_name)) = 'techhub operations limited';
  IF _n = 1 THEN
    INSERT INTO public.auto_image_vendors (vendor_id) SELECT id FROM public.vendors WHERE lower(btrim(store_name)) = 'techhub operations limited' ON CONFLICT DO NOTHING;
    RAISE NOTICE 'Automatic product pictures switched on for TechHub Operations Limited.';
  ELSE
    RAISE NOTICE 'Found % vendor(s) named "TechHub Operations Limited". Nothing was switched on. Use admin_set_auto_product_images(vendor_id, true) with the right vendor id.', _n;
  END IF;
END $$;

-- ===== PHASE 10: 20261116090000_auto_image_broken_links.sql =====
-- =====================================================================
-- PHASE 10: also replace BROKEN pictures (links that no longer load) for the vendors switched on in phase 9.
-- Run after 20261116080000_auto_product_images.sql. Safe to run twice.
-- A product counts as broken only when EVERY picture it has was checked by the worker and each one definitely fails
-- (404/410, or an answer that is not an image). Slow or unreachable sites are retried later and never cause a replacement.
-- The old link is kept in the job row, and a picture is replaced only if it is still the same broken link when the new one is saved.
-- =====================================================================

ALTER TABLE public.auto_product_image_jobs ADD COLUMN IF NOT EXISTS replace_urls text[];

CREATE TABLE IF NOT EXISTS public.auto_product_image_checks (
  product_id uuid PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
  urls text[] NOT NULL,
  status text NOT NULL CHECK (status IN ('ok', 'broken', 'unknown')),
  checked_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.auto_product_image_checks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.auto_product_image_checks FROM PUBLIC, anon, authenticated;

-- products of switched-on vendors whose pictures have not been checked yet (or were unreachable more than a day ago, or changed)
CREATE OR REPLACE FUNCTION public.claim_auto_image_checks(_max integer DEFAULT 15) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _s public.auto_image_settings%ROWTYPE;
BEGIN
  SELECT * INTO _s FROM public.auto_image_settings WHERE id;
  IF NOT _s.enabled THEN RETURN '[]'::jsonb; END IF;
  RETURN COALESCE((SELECT jsonb_agg(x) FROM (
    SELECT jsonb_build_object('product_id', p.id, 'urls', u.urls) AS x
      FROM public.products p
      JOIN public.auto_image_vendors a ON a.vendor_id = p.vendor_id
      CROSS JOIN LATERAL (SELECT COALESCE(array_agg(DISTINCT t) FILTER (WHERE t <> ''), '{}') AS urls
                            FROM unnest(array_append(COALESCE(p.images, '{}'), COALESCE(btrim(p.image_url), ''))) AS t) u
      LEFT JOIN public.auto_product_image_checks c ON c.product_id = p.id
     WHERE p.is_active IS NOT FALSE AND NOT p.ai_generated_image AND cardinality(u.urls) BETWEEN 1 AND 8
       AND (c.product_id IS NULL OR c.urls IS DISTINCT FROM u.urls OR (c.status = 'unknown' AND c.checked_at < now() - interval '1 day'))
       AND NOT EXISTS (SELECT 1 FROM public.auto_product_image_jobs j WHERE j.product_id = p.id AND j.status IN ('pending', 'working'))
     ORDER BY c.checked_at NULLS FIRST LIMIT LEAST(GREATEST(_max, 1), 30)) q), '[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.claim_auto_image_checks(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_auto_image_checks(integer) TO service_role;

-- records a result; a broken product is queued for a replacement picture
CREATE OR REPLACE FUNCTION public.record_auto_image_check(_product uuid, _urls text[], _status text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _status NOT IN ('ok', 'broken', 'unknown') THEN RAISE EXCEPTION 'Bad status'; END IF;
  INSERT INTO public.auto_product_image_checks (product_id, urls, status) VALUES (_product, _urls, _status)
    ON CONFLICT (product_id) DO UPDATE SET urls = EXCLUDED.urls, status = EXCLUDED.status, checked_at = now();
  IF _status = 'broken' THEN
    INSERT INTO public.auto_product_image_jobs (product_id, replace_urls) VALUES (_product, _urls)
      ON CONFLICT (product_id) DO UPDATE SET replace_urls = EXCLUDED.replace_urls, status = 'pending', attempts = 0, error_code = NULL, finished_at = NULL
        WHERE public.auto_product_image_jobs.status IN ('done', 'skipped', 'failed');
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.record_auto_image_check(uuid, text[], text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_auto_image_check(uuid, text[], text) TO service_role;

-- saving now also covers a product whose pictures are still exactly the broken links that were checked
CREATE OR REPLACE FUNCTION public.finish_auto_product_image(_product uuid, _url text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _n integer; _replace text[];
BEGIN
  IF _url IS NULL OR _url !~ '^https://' THEN RAISE EXCEPTION 'Bad image url'; END IF;
  SELECT replace_urls INTO _replace FROM public.auto_product_image_jobs WHERE product_id = _product;
  PERFORM set_config('app.auto_image', 'on', true);
  UPDATE public.products p SET image_url = _url, images = ARRAY[_url], ai_generated_image = true
   WHERE p.id = _product AND (
     (coalesce(btrim(p.image_url), '') = '' AND coalesce(cardinality(p.images), 0) = 0)
     OR (_replace IS NOT NULL AND cardinality(_replace) > 0
         AND (SELECT COALESCE(array_agg(DISTINCT t) FILTER (WHERE t <> ''), '{}') FROM unnest(array_append(COALESCE(p.images, '{}'), COALESCE(btrim(p.image_url), ''))) AS t) <@ _replace));
  GET DIAGNOSTICS _n = ROW_COUNT;
  UPDATE public.auto_product_image_jobs SET status = CASE WHEN _n = 1 THEN 'done' ELSE 'skipped' END, finished_at = now(), error_code = CASE WHEN _n = 1 THEN NULL ELSE 'has_image' END
   WHERE product_id = _product;
  RETURN _n = 1;
END $$;
REVOKE ALL ON FUNCTION public.finish_auto_product_image(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_auto_product_image(uuid, text) TO service_role;

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

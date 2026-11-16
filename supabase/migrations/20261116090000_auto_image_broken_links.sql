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

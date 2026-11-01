-- Background "save a copy" sweep: product pictures that still point at another website (or the old Supabase bucket) are copied
-- to Cloudinary by the edge function mirror-product-images, so they survive if the original is removed.
--   * image_mirror_failures remembers pictures that could not be copied (source already gone, blocked, ...), so one bad product
--     never blocks the others. A failed product is retried up to 5 times, at least 6 hours apart.
--   * products_needing_image_mirror() hands the function its next batch. Only the server (service role) can call it.
CREATE TABLE IF NOT EXISTS public.image_mirror_failures (
  product_id    UUID PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
  reason        TEXT,
  attempts      INT NOT NULL DEFAULT 1,
  last_attempt  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.image_mirror_failures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.image_mirror_failures FROM anon, authenticated;

-- Small partial index: it only holds products whose main picture is not on Cloudinary yet, and shrinks as they are copied.
CREATE INDEX IF NOT EXISTS idx_products_image_not_cloudinary ON public.products (id)
  WHERE image_url IS NOT NULL AND image_url LIKE 'https://%' AND image_url NOT LIKE 'https://res.cloudinary.com/%';

CREATE OR REPLACE FUNCTION public.products_needing_image_mirror(_limit INT)
RETURNS TABLE (id UUID, vendor_id UUID, image_url TEXT, images TEXT[], updated_at TIMESTAMPTZ)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.vendor_id, p.image_url, p.images, p.updated_at
    FROM public.products p
    LEFT JOIN public.image_mirror_failures f ON f.product_id = p.id
   WHERE p.image_url IS NOT NULL AND p.image_url LIKE 'https://%' AND p.image_url NOT LIKE 'https://res.cloudinary.com/%'
     AND (f.product_id IS NULL OR (f.attempts < 5 AND f.last_attempt < now() - interval '6 hours'))
   ORDER BY f.last_attempt NULLS FIRST, p.id
   LIMIT GREATEST(1, LEAST(_limit, 100));
$$;
REVOKE ALL ON FUNCTION public.products_needing_image_mirror(INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.products_needing_image_mirror(INT) TO service_role;

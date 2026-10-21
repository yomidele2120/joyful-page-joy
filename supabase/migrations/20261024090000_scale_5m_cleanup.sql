-- =====================================================================
-- SCALE TO 5 MILLION PRODUCTS (phase 4). Run AFTER 20261023090000_scale_5m.sql.
--   1. Drop duplicate / superseded indexes on products. Every index must be updated on every product
--      insert and edit and has to fit in memory, so five that do nothing are pure cost at 5 million rows.
--   2. Supplier product counts that cost the same for a supplier with 10 products or 1 million.
--   3. Support for the thumbnail backfill script (scripts/backfill-thumbnails.mjs).
-- Safe to run twice. Each index is dropped only if the index that replaces it exists.
-- =====================================================================

-- 1. Redundant indexes ------------------------------------------------
DO $drop$
BEGIN
  -- products.slug is already UNIQUE, and a unique constraint comes with its own index: this one is a copy.
  IF EXISTS (
    SELECT 1 FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
    WHERE i.indrelid = 'public.products'::regclass AND i.indisunique AND i.indnatts = 1 AND a.attname = 'slug'
  ) THEN
    DROP INDEX IF EXISTS public.idx_products_slug;
  END IF;

  -- (vendor_id) alone is covered by (vendor_id, created_at, id), which also keeps the foreign key check fast.
  IF to_regclass('public.idx_products_vendor_all_newest') IS NOT NULL THEN
    DROP INDEX IF EXISTS public.idx_products_vendor;
  END IF;

  -- (moq) alone is covered by the public (moq, id) and (moq, created_at, id) indexes.
  IF to_regclass('public.idx_products_pub_moq') IS NOT NULL THEN
    DROP INDEX IF EXISTS public.idx_products_moq;
  END IF;

  -- The three-column preorder index is replaced by the two small partial ones (open preorders, pending review).
  IF to_regclass('public.idx_products_pub_preorder_newest') IS NOT NULL
     AND to_regclass('public.idx_products_preorder_pending') IS NOT NULL THEN
    DROP INDEX IF EXISTS public.idx_products_preorder;
  END IF;
END
$drop$;

-- 2. Supplier counts, capped ------------------------------------------
-- Counting every product of a supplier who owns a million of them, for each supplier on the page, is slow.
-- This stops counting at 10,000 (the site then shows "10,000+"), so the cost has a ceiling.
CREATE OR REPLACE FUNCTION public.vendor_product_counts(_vendor_ids uuid[])
RETURNS TABLE (vendor_id uuid, product_count bigint)
LANGUAGE sql STABLE AS $$
  SELECT v.id, c.n
  FROM unnest(_vendor_ids) AS v(id)
  CROSS JOIN LATERAL (
    SELECT count(*) AS n FROM (
      SELECT 1 FROM public.products p WHERE p.vendor_id = v.id AND p.is_public LIMIT 10000
    ) capped
  ) c
  WHERE c.n > 0;
$$;
REVOKE ALL ON FUNCTION public.vendor_product_counts(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vendor_product_counts(uuid[]) TO anon, authenticated;

-- 3. Thumbnail backfill support ---------------------------------------
-- Finds products that still need a thumbnail without scanning the whole table.
-- It is large at first and shrinks as the script runs. DROP IT when the backfill is finished:
--   DROP INDEX IF EXISTS public.idx_products_needs_thumb;
CREATE INDEX IF NOT EXISTS idx_products_needs_thumb
  ON public.products (id) WHERE thumb_url IS NULL AND image_url IS NOT NULL;

-- Saves a whole batch of thumbnail links in one call (instead of one request per product).
-- Only the server-side script (service role) may call it.
CREATE OR REPLACE FUNCTION public.set_product_thumbnails(_rows jsonb)
RETURNS integer LANGUAGE sql AS $$
  WITH updated AS (
    UPDATE public.products p SET thumb_url = x.thumb_url
    FROM jsonb_to_recordset(_rows) AS x(id uuid, thumb_url text)
    WHERE p.id = x.id AND p.thumb_url IS NULL
    RETURNING 1
  )
  SELECT count(*)::integer FROM updated;
$$;
REVOKE ALL ON FUNCTION public.set_product_thumbnails(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_product_thumbnails(jsonb) TO service_role;

ANALYZE public.products;

-- For a very large table, drop the old indexes without blocking writes, one at a time, outside a transaction:
--   DROP INDEX CONCURRENTLY IF EXISTS public.idx_products_slug;

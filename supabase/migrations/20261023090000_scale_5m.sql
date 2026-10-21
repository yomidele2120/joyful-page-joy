-- =====================================================================
-- SCALE TO 5 MILLION PRODUCTS (phase 3). Run AFTER 20261021090000 and 20261022090000.
--   1. thumb_url          small thumbnail per product (cards show this instead of the full photo)
--   2. one trigram index  on ALL products (replaces the public-only one), so the admin and supplier
--                         dashboards can search by name too, and the shop still uses it
--   3. supplier indexes   the supplier directory (newest, search by store name)
--   4. autovacuum         tuned for a big table, so statistics and counts stay accurate
-- Safe to run twice. For a table that is already huge, run each CREATE INDEX with CONCURRENTLY, one at a time,
-- outside a transaction (see the note at the bottom).
-- =====================================================================

-- 1. Thumbnail column (nullable: products without one simply show the full image)
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS thumb_url text;

-- 2. Name search over every product. pg_trgm lives in the "extensions" schema on Supabase.
DO $trgm$
DECLARE _schema text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'extensions') THEN
    CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
  ELSE
    CREATE EXTENSION IF NOT EXISTS pg_trgm;
  END IF;
  SELECT n.nspname INTO _schema
  FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
  WHERE e.extname = 'pg_trgm';
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS idx_products_name_trgm_all ON public.products USING gin (name %I.gin_trgm_ops)',
    _schema);
END
$trgm$;
-- The new index also serves the shop's "is_public" searches, so the public-only copy is no longer needed.
DROP INDEX IF EXISTS public.idx_products_pub_name_trgm;

-- 3. Supplier directory: approved suppliers newest first, and search by store name.
CREATE INDEX IF NOT EXISTS idx_vendors_approved_newest
  ON public.vendors (created_at DESC) WHERE is_approved;
DO $trgm$
DECLARE _schema text;
BEGIN
  SELECT n.nspname INTO _schema
  FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
  WHERE e.extname = 'pg_trgm';
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS idx_vendors_store_name_trgm ON public.vendors USING gin (store_name %I.gin_trgm_ops)',
    _schema);
END
$trgm$;

-- 4. Autovacuum: the default waits until 20% of the rows changed (a million rows on 5 million) before
--    cleaning up or refreshing statistics. Estimated counts and the query planner depend on fresh statistics.
ALTER TABLE public.products SET (
  autovacuum_vacuum_scale_factor = 0.02,
  autovacuum_analyze_scale_factor = 0.01
);

ANALYZE public.products;
ANALYZE public.vendors;

-- NOTE for very large tables, one at a time and NOT inside a transaction:
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_name_trgm_all
--     ON public.products USING gin (name extensions.gin_trgm_ops);
--   (then, once it is built:)  DROP INDEX CONCURRENTLY IF EXISTS public.idx_products_pub_name_trgm;

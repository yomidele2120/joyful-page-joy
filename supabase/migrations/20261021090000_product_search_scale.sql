-- =====================================================================
-- PRODUCT LISTING + SEARCH AT SCALE (built for 1 to 2 million products)
--   1. is_public         one ready-made yes/no for "should the shop show this product"
--   2. price_min/max     cheapest / dearest unit price (tiers included), kept up to date by a trigger,
--                        so the database can filter and sort by price instead of the browser
--   3. search_vector     full-text search over name, brand and SKU (word-start matching: "iph" finds "iPhone")
--   4. Trigram index     "phone" still finds "iPhone" (matching inside words), used as the fallback
--   5. Indexes           for the real queries: newest, per category, per supplier, by price, by MOQ
--   6. vendor_product_counts()  supplier product counts without downloading every product row
-- Run it BEFORE deploying the matching website code, and BEFORE a bulk load.
-- On a table that is already huge, the two generated columns rewrite the table (a minute or two
-- per million rows, during which products cannot be edited). Run it in a quiet period.
-- Safe to run twice.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Public flag (active, and a preorder only once an admin has approved it)
-- ---------------------------------------------------------------------
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_public boolean
  GENERATED ALWAYS AS (
    COALESCE(is_active, false) AND (NOT COALESCE(is_preorder, false) OR COALESCE(preorder_approved, false))
  ) STORED;

-- ---------------------------------------------------------------------
-- 2. Price bounds, same rule as the website's priceRange(): the base price and every valid tier price
-- ---------------------------------------------------------------------
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS price_min numeric;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS price_max numeric;

CREATE OR REPLACE FUNCTION public.products_set_price_bounds()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  _min numeric := NEW.price;
  _max numeric := NEW.price;
  _p numeric;
BEGIN
  IF NEW.price_tiers IS NOT NULL AND jsonb_typeof(NEW.price_tiers) = 'array' THEN
    FOR _p IN
      SELECT (e ->> 'price')::numeric
      FROM jsonb_array_elements(NEW.price_tiers) AS e
      WHERE jsonb_typeof(e) = 'object' AND (e ->> 'price') ~ '^[0-9]+(\.[0-9]+)?$'
    LOOP
      _min := LEAST(_min, _p);
      _max := GREATEST(_max, _p);
    END LOOP;
  END IF;
  NEW.price_min := _min;
  NEW.price_max := _max;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_products_price_bounds ON public.products;
CREATE TRIGGER trg_products_price_bounds
  BEFORE INSERT OR UPDATE OF price, price_tiers ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.products_set_price_bounds();

-- Fill in the existing products (this also refreshes their updated_at, which is harmless).
-- On a very large table, run this in slices instead: add "AND id IN (SELECT id ... LIMIT 50000)".
UPDATE public.products SET price = price WHERE price_min IS NULL;

-- ---------------------------------------------------------------------
-- 3. Full-text search: word-start matching on name, brand and SKU
--    ('simple' = no language stemming, which suits product names and model numbers)
-- ---------------------------------------------------------------------
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', COALESCE(name, '')), 'A') ||
    setweight(to_tsvector('simple', COALESCE(brand, '')), 'B') ||
    setweight(to_tsvector('simple', COALESCE(sku, '')), 'B')
  ) STORED;

-- ---------------------------------------------------------------------
-- 4 + 5. Indexes. Every one is limited to public products, so they stay smaller and faster.
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_products_pub_newest
  ON public.products (created_at DESC, id DESC) WHERE is_public;
CREATE INDEX IF NOT EXISTS idx_products_pub_cat_newest
  ON public.products (category_id, created_at DESC, id DESC) WHERE is_public;
CREATE INDEX IF NOT EXISTS idx_products_pub_vendor_newest
  ON public.products (vendor_id, created_at DESC, id DESC) WHERE is_public;
CREATE INDEX IF NOT EXISTS idx_products_pub_price
  ON public.products (price_min, id) WHERE is_public;
CREATE INDEX IF NOT EXISTS idx_products_pub_cat_price
  ON public.products (category_id, price_min, id) WHERE is_public;
CREATE INDEX IF NOT EXISTS idx_products_pub_moq
  ON public.products (moq, id) WHERE is_public;
CREATE INDEX IF NOT EXISTS idx_products_pub_search
  ON public.products USING gin (search_vector) WHERE is_public;

-- Trigram index (matching inside words). pg_trgm lives in the "extensions" schema on Supabase.
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
    'CREATE INDEX IF NOT EXISTS idx_products_pub_name_trgm ON public.products USING gin (name %I.gin_trgm_ops) WHERE is_public',
    _schema);
END
$trgm$;

-- ---------------------------------------------------------------------
-- 6. Supplier product counts for a page of suppliers, counted inside the database
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.vendor_product_counts(_vendor_ids uuid[])
RETURNS TABLE (vendor_id uuid, product_count bigint)
LANGUAGE sql STABLE AS $$
  SELECT p.vendor_id, count(*)
  FROM public.products p
  WHERE p.vendor_id = ANY (_vendor_ids) AND p.is_public
  GROUP BY p.vendor_id;
$$;
REVOKE ALL ON FUNCTION public.vendor_product_counts(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vendor_product_counts(uuid[]) TO anon, authenticated;

-- Fresh statistics so the planner picks the new indexes straight away.
ANALYZE public.products;

-- =====================================================================
-- TEST DATA GENERATOR: fake products for load testing (1 to 2 million)
--
-- !! RUN THIS ONLY ON A STAGING / TEST PROJECT, NEVER ON YOUR LIVE DATABASE !!
--
-- Every fake product has a SKU starting with LOADTEST- and a slug starting with loadtest-, so
-- they can be removed in one go (see the cleanup at the bottom).
-- Needs at least one category and one approved supplier (the demo seed provides both).
-- Safe to re-run: products that already exist (same slug) are skipped.
--
-- Usage in the SQL editor (a few tens of thousands per run, because the editor has a time limit):
--     SELECT public.seed_test_products(1, 25000);
--     SELECT public.seed_test_products(25001, 25000);
--     ...
-- For millions, use scripts/seed-test-products.sh (loops for you from your own computer).
-- =====================================================================
CREATE OR REPLACE FUNCTION public.seed_test_products(_start bigint, _count integer)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE
  _cats uuid[];
  _vendors uuid[];
  _brands text[] := ARRAY['Apple','Samsung','Tecno','Infinix','Xiaomi','HP','Dell','Lenovo','Sony','LG',
                          'JBL','Anker','Oraimo','Itel','Hisense','TCL','Canon','Nikon','Asus','Acer'];
  _types text[]  := ARRAY['Smartphone','Laptop','Tablet','Smart TV','Earbuds','Power Bank','Charger','Monitor',
                          'Printer','Camera','Smartwatch','Speaker','Router','Keyboard','Mouse'];
  _suffix text[] := ARRAY['Pro','Max','Lite','Plus','Ultra','SE','Mini','X','Air','Neo'];
  _rows integer;
BEGIN
  SELECT array_agg(id) INTO _cats FROM public.categories;
  SELECT array_agg(id) INTO _vendors FROM public.vendors WHERE is_approved;
  IF _cats IS NULL OR _vendors IS NULL THEN
    RAISE EXCEPTION 'Create at least one category and one approved supplier first (run the demo products seed).';
  END IF;

  INSERT INTO public.products
    (name, slug, description, price, compare_at_price, image_url, category_id, vendor_id, brand, sku,
     stock_quantity, is_active, is_featured, moq, unit, price_tiers, created_at)
  SELECT
    s.brand || ' ' || s.ptype || ' ' || s.sfx || ' ' || s.model,
    'loadtest-' || s.n,
    'Load test product number ' || s.n || '. This is generated test data, not a real listing.',
    s.price,
    CASE WHEN s.n % 5 = 0 THEN round(s.price * 1.15, -2) END,
    '/placeholder.svg',
    s.cat, s.vend, s.brand, 'LOADTEST-' || s.n,
    (s.n % 200)::integer,
    true,
    (s.n % 500 = 0),
    s.moq,
    'Piece',
    CASE WHEN s.n % 3 = 0
      THEN jsonb_build_array(
             jsonb_build_object('min_qty', s.moq + 9,  'price', round(s.price * 0.97, 0)),
             jsonb_build_object('min_qty', s.moq + 49, 'price', round(s.price * 0.93, 0)))
      ELSE '[]'::jsonb END,
    now() - make_interval(secs => (random() * 86400 * 365)::integer)
  FROM (
    SELECT n,
      _brands[1 + (n % cardinality(_brands))::integer]  AS brand,
      _types[1 + (n % cardinality(_types))::integer]    AS ptype,
      _suffix[1 + ((n / 7) % cardinality(_suffix))::integer] AS sfx,
      (100 + (n % 900))::integer                        AS model,
      round((5000 + random() * random() * 2000000)::numeric, -2) AS price,
      (1 + (n % 20))::integer                           AS moq,
      _cats[1 + (n % cardinality(_cats))::integer]      AS cat,
      _vendors[1 + ((n / 3) % cardinality(_vendors))::integer] AS vend
    FROM generate_series(_start, _start + _count - 1) AS n
  ) s
  ON CONFLICT (slug) DO NOTHING;

  GET DIAGNOSTICS _rows = ROW_COUNT;
  RETURN _rows;
END $$;

-- ---------------------------------------------------------------------
-- FASTER BULK LOADS (optional). Maintaining every index while inserting millions of rows is slow.
-- Drop the heavy ones first, load, then recreate them (recreating is much faster than maintaining):
--
--   DROP INDEX IF EXISTS public.idx_products_pub_search, public.idx_products_pub_name_trgm;
--   ... run the loader ...
--   CREATE INDEX idx_products_pub_search ON public.products USING gin (search_vector) WHERE is_public;
--   CREATE INDEX idx_products_pub_name_trgm ON public.products USING gin (name extensions.gin_trgm_ops) WHERE is_public;
--   ANALYZE public.products;
--
-- (If pg_trgm is installed in the public schema on your project, write gin_trgm_ops without "extensions.".)
-- ---------------------------------------------------------------------

-- CLEANUP: remove every fake product (run repeatedly if the editor times out):
--   DELETE FROM public.products WHERE id IN (SELECT id FROM public.products WHERE sku LIKE 'LOADTEST-%' LIMIT 50000);

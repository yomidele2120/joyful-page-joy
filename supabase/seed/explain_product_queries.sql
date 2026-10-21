-- =====================================================================
-- SPEED CHECK. Run these one at a time in the SQL editor of the database that holds the test data.
-- For each, look at two things in the result:
--   1. The plan should say "Index Scan" or "Bitmap Index Scan" using one of the idx_products_pub_* indexes.
--      "Seq Scan on products" means the whole table is being read: tell me and I will fix the index.
--   2. "Execution Time" at the bottom. Aim for under 50 ms for lists and under 150 ms for searches.
-- Replace the category and supplier ids with real ones from your data where marked.
-- =====================================================================

-- 1. All products, newest first, page 1 (the /products page)
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, name, price, created_at FROM public.products
WHERE is_public ORDER BY created_at DESC, id DESC LIMIT 24 OFFSET 0;

-- 2. Deep page (page 100)
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, name, price, created_at FROM public.products
WHERE is_public ORDER BY created_at DESC, id DESC LIMIT 24 OFFSET 2376;

-- 3. One category, newest first  (replace the id: SELECT id, name FROM categories;)
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, name, price FROM public.products
WHERE is_public AND category_id = (SELECT id FROM public.categories LIMIT 1)
ORDER BY created_at DESC, id DESC LIMIT 24;

-- 4. One supplier's shop, newest first
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, name, price FROM public.products
WHERE is_public AND vendor_id = (SELECT id FROM public.vendors WHERE is_approved LIMIT 1)
ORDER BY created_at DESC, id DESC LIMIT 24;

-- 5. Price low to high, with a price range and MOQ filter
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, name, price_min FROM public.products
WHERE is_public AND price_max >= 50000 AND price_min <= 300000 AND moq <= 10
ORDER BY price_min ASC, id ASC LIMIT 24;

-- 6. Word search ("iph" finds "iPhone")
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, name FROM public.products
WHERE is_public AND search_vector @@ to_tsquery('simple', 'iph:* & 15:*')
ORDER BY created_at DESC, id DESC LIMIT 24;

-- 7. Inside-the-word search ("phone" finds "iPhone"): the fallback
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, name FROM public.products
WHERE is_public AND name ILIKE '%phone%'
ORDER BY created_at DESC, id DESC LIMIT 24;

-- 8. The estimated total the website shows (instant, unlike count(*))
EXPLAIN SELECT count(*) FROM public.products WHERE is_public;
SELECT reltuples::bigint AS estimated_rows FROM pg_class WHERE oid = 'public.products'::regclass;

-- 9. How big things got
SELECT pg_size_pretty(pg_total_relation_size('public.products')) AS table_plus_indexes,
       pg_size_pretty(pg_relation_size('public.products')) AS table_only;
SELECT indexrelname AS index, pg_size_pretty(pg_relation_size(indexrelid)) AS size
FROM pg_stat_user_indexes WHERE relname = 'products' ORDER BY pg_relation_size(indexrelid) DESC;

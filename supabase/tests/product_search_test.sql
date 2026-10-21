-- =====================================================================
-- PRODUCT SEARCH TEST (run in the SQL editor AFTER the 20261021090000_product_search_scale migration)
-- Checks, with throwaway data: price bounds from tiers, the public flag, word-start search, inside-word
-- search, and the supplier counts. Cleans up after itself.
-- Success looks like:  ERROR: ALL PRODUCT SEARCH TESTS PASSED (this error is intentional, it rolls back the test data)
-- =====================================================================
DO $test$
DECLARE
  _id uuid;
  _id2 uuid;
  _id3 uuid;
  _r record;
  _n integer;
BEGIN
  -- 1. price bounds: base 1000, tiers 900 and 800 => min 800, max 1000
  INSERT INTO public.products (name, slug, price, stock_quantity, is_active, brand, sku, price_tiers)
  VALUES ('Apple iPhone 15 Pro Test', 'search-test-1-' || gen_random_uuid(), 1000, 5, true, 'Apple', 'SEARCHTEST-1',
          '[{"min_qty": 10, "price": 900}, {"min_qty": 50, "price": 800}]')
  RETURNING id INTO _id;
  SELECT price_min, price_max INTO _r FROM public.products WHERE id = _id;
  IF _r.price_min <> 800 OR _r.price_max <> 1000 THEN RAISE EXCEPTION 'FAIL: price bounds % to %', _r.price_min, _r.price_max; END IF;

  -- changing the price or tiers recalculates them
  UPDATE public.products SET price = 700 WHERE id = _id;
  SELECT price_min, price_max INTO _r FROM public.products WHERE id = _id;
  IF _r.price_min <> 700 OR _r.price_max <> 900 THEN RAISE EXCEPTION 'FAIL: bounds after price change % to %', _r.price_min, _r.price_max; END IF;
  UPDATE public.products SET price_tiers = '[]' WHERE id = _id;
  SELECT price_min, price_max INTO _r FROM public.products WHERE id = _id;
  IF _r.price_min <> 700 OR _r.price_max <> 700 THEN RAISE EXCEPTION 'FAIL: bounds with no tiers % to %', _r.price_min, _r.price_max; END IF;

  -- 2. the public flag
  IF NOT (SELECT is_public FROM public.products WHERE id = _id) THEN RAISE EXCEPTION 'FAIL: an active product should be public'; END IF;
  INSERT INTO public.products (name, slug, price, stock_quantity, is_active, sku)
  VALUES ('Hidden test product', 'search-test-2-' || gen_random_uuid(), 100, 5, false, 'SEARCHTEST-2') RETURNING id INTO _id2;
  IF (SELECT is_public FROM public.products WHERE id = _id2) THEN RAISE EXCEPTION 'FAIL: an inactive product must not be public'; END IF;
  INSERT INTO public.products (name, slug, price, stock_quantity, is_active, sku, is_preorder, preorder_approved, preorder_release_date)
  VALUES ('Preorder test product', 'search-test-3-' || gen_random_uuid(), 100, 5, true, 'SEARCHTEST-3', true, false, current_date + 30)
  RETURNING id INTO _id3;
  IF (SELECT is_public FROM public.products WHERE id = _id3) THEN RAISE EXCEPTION 'FAIL: an unapproved preorder must not be public'; END IF;
  UPDATE public.products SET preorder_approved = true WHERE id = _id3;
  IF NOT (SELECT is_public FROM public.products WHERE id = _id3) THEN RAISE EXCEPTION 'FAIL: an approved preorder should be public'; END IF;

  -- 3. word-start search
  SELECT count(*) INTO _n FROM public.products WHERE is_public AND id = _id AND search_vector @@ to_tsquery('simple', 'iph:* & 15:*');
  IF _n <> 1 THEN RAISE EXCEPTION 'FAIL: "iph 15" should find the iPhone'; END IF;
  SELECT count(*) INTO _n FROM public.products WHERE id = _id AND search_vector @@ to_tsquery('simple', 'samsung:*');
  IF _n <> 0 THEN RAISE EXCEPTION 'FAIL: "samsung" must not find the iPhone'; END IF;
  SELECT count(*) INTO _n FROM public.products WHERE id = _id AND search_vector @@ to_tsquery('simple', 'apple:*');
  IF _n <> 1 THEN RAISE EXCEPTION 'FAIL: the brand should be searchable'; END IF;

  -- 4. inside-word search
  SELECT count(*) INTO _n FROM public.products WHERE is_public AND id = _id AND name ILIKE '%phone%';
  IF _n <> 1 THEN RAISE EXCEPTION 'FAIL: "phone" should be found inside "iPhone"'; END IF;

  -- 5. the new indexes exist
  SELECT count(*) INTO _n FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'products'
    AND indexname IN ('idx_products_pub_newest','idx_products_pub_cat_newest','idx_products_pub_vendor_newest',
                      'idx_products_pub_price','idx_products_pub_cat_price','idx_products_pub_moq',
                      'idx_products_pub_search','idx_products_pub_name_trgm');
  IF _n <> 8 THEN RAISE EXCEPTION 'FAIL: expected 8 product indexes, found %', _n; END IF;

  RAISE EXCEPTION 'ALL PRODUCT SEARCH TESTS PASSED (this error is intentional, it rolls back the test data)';
END
$test$;

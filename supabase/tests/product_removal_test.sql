-- =====================================================================
-- PRODUCT REMOVAL TEST (run in the SQL editor AFTER 20261027090000_product_removal.sql)
-- Throwaway data: one product nobody ordered and one that has an order line. Checks that the first is
-- deleted, the second is hidden (not erased), and that asking again changes nothing.
-- Success looks like:  ERROR: ALL PRODUCT REMOVAL TESTS PASSED (this error is intentional, it rolls back the test data)
-- =====================================================================
DO $test$
DECLARE
  _free uuid; _ordered uuid; _order uuid; _r jsonb; _n integer; _active boolean;
BEGIN
  INSERT INTO public.products (name, slug, price, stock_quantity, is_active)
  VALUES ('Removal test, never ordered', 'removal-test-free-' || gen_random_uuid(), 1000, 5, true) RETURNING id INTO _free;
  INSERT INTO public.products (name, slug, price, stock_quantity, is_active)
  VALUES ('Removal test, ordered', 'removal-test-ordered-' || gen_random_uuid(), 1000, 5, true) RETURNING id INTO _ordered;
  INSERT INTO public.orders (status, total, email) VALUES ('pending', 1000, 'test@example.invalid') RETURNING id INTO _order;
  INSERT INTO public.order_items (order_id, product_id, quantity, price) VALUES (_order, _ordered, 1, 1000);

  -- 1. one of each
  _r := public.remove_products_core(ARRAY[_free, _ordered]);
  IF (_r ->> 'deleted')::int <> 1 OR (_r ->> 'hidden')::int <> 1 THEN RAISE EXCEPTION 'FAIL: expected 1 deleted and 1 hidden, got %', _r; END IF;

  SELECT count(*) INTO _n FROM public.products WHERE id = _free;
  IF _n <> 0 THEN RAISE EXCEPTION 'FAIL: the never-ordered product should be gone'; END IF;

  SELECT is_active INTO _active FROM public.products WHERE id = _ordered;
  IF NOT FOUND THEN RAISE EXCEPTION 'FAIL: an ordered product must never be erased'; END IF;
  IF _active IS DISTINCT FROM false THEN RAISE EXCEPTION 'FAIL: the ordered product should be hidden'; END IF;

  SELECT count(*) INTO _n FROM public.order_items WHERE product_id = _ordered;
  IF _n <> 1 THEN RAISE EXCEPTION 'FAIL: the order line must be untouched'; END IF;

  -- 2. asking again: nothing left to delete, the ordered one stays hidden
  _r := public.remove_products_core(ARRAY[_free, _ordered]);
  IF (_r ->> 'deleted')::int <> 0 OR (_r ->> 'hidden')::int <> 1 THEN RAISE EXCEPTION 'FAIL: second run, got %', _r; END IF;

  -- 3. empty and missing input
  _r := public.remove_products_core(ARRAY[]::uuid[]);
  IF (_r ->> 'deleted')::int <> 0 OR (_r ->> 'hidden')::int <> 0 THEN RAISE EXCEPTION 'FAIL: empty list, got %', _r; END IF;
  _r := public.remove_products_core(NULL);
  IF (_r ->> 'deleted')::int <> 0 THEN RAISE EXCEPTION 'FAIL: null list, got %', _r; END IF;

  RAISE EXCEPTION 'ALL PRODUCT REMOVAL TESTS PASSED';
END $test$;

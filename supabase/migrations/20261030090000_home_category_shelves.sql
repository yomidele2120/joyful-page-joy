-- =====================================================================
-- HOME PAGE: one product row ("shelf") for every category that has products.
--
-- The home page asks this function which categories to show a row for. A category only appears when
-- it has at least one product the shop would show (is_public: active, and a preorder only once
-- approved). Hidden categories (is_visible = false) are left out.
--
-- It is cheap on a big catalogue: for each category it reads at most 12 rows through the existing
-- idx_products_pub_cat_newest index and stops, so it never counts a whole category.
-- Needs 20261021090000_product_search_scale.sql (is_public + that index) first.
-- Safe to run twice.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.home_category_shelves(
  _min_products integer DEFAULT 1,
  _max_shelves  integer DEFAULT 40
)
RETURNS TABLE (id uuid, name text, slug text, sort_order integer, product_count bigint)
LANGUAGE sql STABLE AS $$
  SELECT c.id, c.name, c.slug, c.sort_order, n.n
  FROM public.categories c
  CROSS JOIN LATERAL (
    SELECT count(*) AS n FROM (
      SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.is_public LIMIT 12
    ) capped
  ) n
  WHERE COALESCE(c.is_visible, true)
    AND n.n >= GREATEST(_min_products, 1)
  ORDER BY c.sort_order NULLS LAST, c.name
  LIMIT LEAST(GREATEST(_max_shelves, 1), 100);
$$;

REVOKE ALL ON FUNCTION public.home_category_shelves(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.home_category_shelves(integer, integer) TO anon, authenticated;

-- To check it in the SQL editor:
--   SELECT * FROM public.home_category_shelves();

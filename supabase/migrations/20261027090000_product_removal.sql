-- =====================================================================
-- Removing products without silent failures
--
-- Why deleting often "did nothing": every order line points at its product (order_items.product_id, no
-- ON DELETE rule), so the database refuses to erase any product that has ever been ordered. The supplier
-- dashboard ignored that refusal and still said "Product deleted", then the product came back on refresh.
--
-- Now one function does it properly, for one product or up to 200 at a time:
--   * a product nobody ever ordered is deleted
--   * a product that has been ordered is HIDDEN (is_active = false) instead, because it is part of the
--     buyers' order history; the supplier can show it again later
-- A supplier can only remove their own products; an admin can remove any.
-- Run once in the SQL editor. Safe to run twice.
-- =====================================================================

-- Core: no sign-in check, so it can be tested. The website cannot call it directly.
CREATE OR REPLACE FUNCTION public.remove_products_core(_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  _used uuid[];
  _deleted integer := 0;
BEGIN
  IF _ids IS NULL OR cardinality(_ids) = 0 THEN
    RETURN jsonb_build_object('deleted', 0, 'hidden', 0);
  END IF;

  SELECT COALESCE(array_agg(DISTINCT product_id), '{}') INTO _used
  FROM public.order_items WHERE product_id = ANY (_ids);

  IF cardinality(_used) > 0 THEN
    UPDATE public.products SET is_active = false
    WHERE id = ANY (_used) AND is_active IS DISTINCT FROM false;
  END IF;

  DELETE FROM public.products WHERE id = ANY (_ids) AND NOT (id = ANY (_used));
  GET DIAGNOSTICS _deleted = ROW_COUNT;

  RETURN jsonb_build_object('deleted', _deleted, 'hidden', cardinality(_used));
END $$;
REVOKE ALL ON FUNCTION public.remove_products_core(uuid[]) FROM PUBLIC, anon, authenticated;

-- What the website calls. Keeps only the products the signed-in person may remove, then hands them to the core.
CREATE OR REPLACE FUNCTION public.remove_my_products(_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _mine uuid[];
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Please sign in first.'; END IF;
  IF _ids IS NULL OR cardinality(_ids) = 0 THEN
    RETURN jsonb_build_object('deleted', 0, 'hidden', 0);
  END IF;
  IF cardinality(_ids) > 200 THEN RAISE EXCEPTION 'Remove at most 200 products at a time.'; END IF;

  SELECT COALESCE(array_agg(p.id), '{}') INTO _mine
  FROM public.products p
  WHERE p.id = ANY (_ids)
    AND (public.has_role(_uid, 'admin')
         OR p.vendor_id IN (SELECT v.id FROM public.vendors v WHERE v.user_id = _uid));

  RETURN public.remove_products_core(_mine);
END $$;
REVOKE ALL ON FUNCTION public.remove_my_products(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_my_products(uuid[]) TO authenticated;

-- Deleting a product makes the database look for rows that point at it. These columns had no index, so on
-- large tables every delete would scan them. (Fast to build on a small table. On a very large live one, run
-- each line as CREATE INDEX CONCURRENTLY, one at a time.)
CREATE INDEX IF NOT EXISTS idx_order_items_product ON public.order_items (product_id);
CREATE INDEX IF NOT EXISTS idx_wishlist_product ON public.wishlist (product_id);
CREATE INDEX IF NOT EXISTS idx_inquiries_product ON public.inquiries (product_id);
CREATE INDEX IF NOT EXISTS idx_messages_product ON public.messages (product_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_product ON public.support_tickets (product_id);

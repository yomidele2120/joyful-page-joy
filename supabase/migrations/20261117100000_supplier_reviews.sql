-- Supplier reviews: one review per buyer per supplier, only from buyers with a paid order from that supplier.
CREATE TABLE IF NOT EXISTS public.vendor_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  buyer_id uuid NOT NULL,
  rating int NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text,
  reviewer_name text NOT NULL DEFAULT 'Buyer',
  verified_purchase boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.vendor_reviews ADD COLUMN IF NOT EXISTS vendor_reply text;
ALTER TABLE public.vendor_reviews ADD COLUMN IF NOT EXISTS vendor_replied_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS vendor_reviews_one_per_buyer ON public.vendor_reviews (vendor_id, buyer_id);
CREATE INDEX IF NOT EXISTS vendor_reviews_vendor_idx ON public.vendor_reviews (vendor_id, created_at DESC);
ALTER TABLE public.vendor_reviews ENABLE ROW LEVEL SECURITY;

-- Everyone can read reviews. Nobody writes directly: all writes go through the functions below.
DROP POLICY IF EXISTS "Anyone can read supplier reviews" ON public.vendor_reviews;
CREATE POLICY "Anyone can read supplier reviews" ON public.vendor_reviews FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins manage supplier reviews" ON public.vendor_reviews;
CREATE POLICY "Admins manage supplier reviews" ON public.vendor_reviews FOR ALL
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
REVOKE INSERT, UPDATE, DELETE ON public.vendor_reviews FROM anon, authenticated;
GRANT SELECT ON public.vendor_reviews TO anon, authenticated;

-- Can this buyer review this supplier? True once they have a paid order containing that supplier's product.
CREATE OR REPLACE FUNCTION public.can_review_vendor(_vendor uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.orders o
    JOIN public.order_items oi ON oi.order_id = o.id
    JOIN public.products p ON p.id = oi.product_id
    WHERE o.user_id = auth.uid() AND p.vendor_id = _vendor AND o.settled_at IS NOT NULL
  ) AND NOT EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = _vendor AND v.user_id = auth.uid());
$$;
REVOKE ALL ON FUNCTION public.can_review_vendor(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_review_vendor(uuid) TO authenticated;

-- Add or update my review of a supplier.
CREATE OR REPLACE FUNCTION public.submit_vendor_review(_vendor uuid, _rating int, _comment text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid; _name text; _c text := nullif(btrim(coalesce(_comment, '')), '');
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to leave a review'; END IF;
  IF _rating IS NULL OR _rating < 1 OR _rating > 5 THEN RAISE EXCEPTION 'Choose a rating from 1 to 5'; END IF;
  IF _c IS NOT NULL AND length(_c) > 1000 THEN RAISE EXCEPTION 'Keep the review under 1000 characters'; END IF;
  IF NOT public.can_review_vendor(_vendor) THEN
    RAISE EXCEPTION 'You can review a supplier after a paid order from them';
  END IF;
  SELECT coalesce(nullif(split_part(btrim(full_name), ' ', 1), ''), 'Buyer') ||
         CASE WHEN position(' ' IN btrim(full_name)) > 0 THEN ' ' || left(split_part(btrim(full_name), ' ', 2), 1) || '.' ELSE '' END
    INTO _name FROM public.profiles WHERE user_id = auth.uid();
  INSERT INTO public.vendor_reviews (vendor_id, buyer_id, rating, comment, reviewer_name, verified_purchase)
  VALUES (_vendor, auth.uid(), _rating, _c, coalesce(_name, 'Buyer'), true)
  ON CONFLICT (vendor_id, buyer_id) DO UPDATE
    SET rating = EXCLUDED.rating, comment = EXCLUDED.comment, reviewer_name = EXCLUDED.reviewer_name, updated_at = now()
  RETURNING id INTO _id;
  RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.submit_vendor_review(uuid, int, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_vendor_review(uuid, int, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_my_vendor_review(_vendor uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM public.vendor_reviews WHERE vendor_id = _vendor AND buyer_id = auth.uid();
$$;
REVOKE ALL ON FUNCTION public.delete_my_vendor_review(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_my_vendor_review(uuid) TO authenticated;

-- The supplier answers a review on their own shop (one public reply per review).
CREATE OR REPLACE FUNCTION public.reply_vendor_review(_review uuid, _reply text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _r text := nullif(btrim(coalesce(_reply, '')), '');
BEGIN
  IF _r IS NOT NULL AND length(_r) > 600 THEN RAISE EXCEPTION 'Keep the reply under 600 characters'; END IF;
  UPDATE public.vendor_reviews rv
     SET vendor_reply = _r, vendor_replied_at = CASE WHEN _r IS NULL THEN NULL ELSE now() END
   WHERE rv.id = _review
     AND EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = rv.vendor_id AND v.user_id = auth.uid());
  IF NOT FOUND THEN RAISE EXCEPTION 'Review not found on your shop'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.reply_vendor_review(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reply_vendor_review(uuid, text) TO authenticated;

-- Shop header rating now counts supplier reviews (product reviews no longer feed it).
CREATE OR REPLACE FUNCTION public.get_vendor_reputation(_vendor uuid)
RETURNS TABLE (average_rating numeric, review_count bigint, average_response_minutes integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    (SELECT round(avg(rating)::numeric, 1) FROM public.vendor_reviews WHERE vendor_id = _vendor),
    (SELECT count(*) FROM public.vendor_reviews WHERE vendor_id = _vendor),
    (SELECT round(avg(extract(epoch FROM (i.first_response_at - i.created_at)) / 60))::integer
       FROM public.inquiries i
      WHERE i.vendor_id = _vendor AND i.first_response_at IS NOT NULL AND i.first_response_at >= i.created_at);
$$;
REVOKE ALL ON FUNCTION public.get_vendor_reputation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_vendor_reputation(uuid) TO anon, authenticated;

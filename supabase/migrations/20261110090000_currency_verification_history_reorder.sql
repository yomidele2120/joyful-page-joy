-- =====================================================================
-- Multi-currency display, call history, supplier document verification, smart reorder.
--   * currency_rates                     - NGN/USD/AED display rates, edited by the admin (prices are still charged in NGN)
--   * my_call_history()                  - the signed-in member's own calls (incoming, outgoing, missed) with the other person's name
--   * vendor_verification_requests       - a supplier's business documents, reviewed by an admin
--   * submit_vendor_verification()       - the supplier's only way to submit; review_vendor_verification() - the admin's only way to decide
--   * "vendor-verification" storage      - private bucket, readable only by the supplier and admins
--   * suggest_reorders()                 - products a buyer bought before that are due again
-- Safe to run more than once.
-- =====================================================================

-- ------------------------------ currency ------------------------------
CREATE TABLE IF NOT EXISTS public.currency_rates (
  code text PRIMARY KEY CHECK (code IN ('NGN', 'USD', 'AED')),
  per_ngn numeric NOT NULL CHECK (per_ngn > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT ngn_is_one CHECK (code <> 'NGN' OR per_ngn = 1)
);
ALTER TABLE public.currency_rates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone reads currency rates" ON public.currency_rates;
CREATE POLICY "Anyone reads currency rates" ON public.currency_rates FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Admins manage currency rates" ON public.currency_rates;
CREATE POLICY "Admins manage currency rates" ON public.currency_rates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
REVOKE ALL ON public.currency_rates FROM anon;
GRANT SELECT ON public.currency_rates TO anon;
GRANT SELECT, INSERT, UPDATE ON public.currency_rates TO authenticated;

-- Starting rates are ONLY placeholders. The admin must set today's real rates (Admin > Currency rates).
INSERT INTO public.currency_rates (code, per_ngn) VALUES ('NGN', 1), ('USD', 0.00065), ('AED', 0.0024)
ON CONFLICT (code) DO NOTHING;

CREATE OR REPLACE FUNCTION public.currency_rates_stamp()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); NEW.updated_by := auth.uid(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS trg_currency_rates_stamp ON public.currency_rates;
CREATE TRIGGER trg_currency_rates_stamp BEFORE INSERT OR UPDATE ON public.currency_rates
  FOR EACH ROW EXECUTE FUNCTION public.currency_rates_stamp();

-- ------------------------------ call history ------------------------------
CREATE OR REPLACE FUNCTION public.my_call_history(_limit integer DEFAULT 50)
RETURNS TABLE (id uuid, direction text, peer_id uuid, peer_name text, call_type text, status text,
               created_at timestamptz, duration_seconds integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id,
         CASE WHEN c.caller_id = auth.uid() THEN 'outgoing' ELSE 'incoming' END,
         p.peer,
         COALESCE(NULLIF(trim(v.store_name), ''), NULLIF(trim(pr.full_name), ''), 'Member'),
         c.call_type, c.status, c.created_at, c.duration_seconds
  FROM public.call_logs c
  CROSS JOIN LATERAL (SELECT CASE WHEN c.caller_id = auth.uid() THEN c.callee_id ELSE c.caller_id END AS peer) p
  LEFT JOIN public.vendors v ON v.user_id = p.peer
  LEFT JOIN public.profiles pr ON pr.user_id = p.peer
  WHERE auth.uid() IS NOT NULL AND (c.caller_id = auth.uid() OR c.callee_id = auth.uid())
  ORDER BY c.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(_limit, 50), 1), 200);
$$;
REVOKE ALL ON FUNCTION public.my_call_history(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_call_history(integer) TO authenticated;

-- ------------------------------ supplier verification ------------------------------
CREATE TABLE IF NOT EXISTS public.vendor_verification_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  business_name text NOT NULL CHECK (char_length(business_name) BETWEEN 2 AND 200),
  registration_number text CHECK (registration_number IS NULL OR char_length(registration_number) <= 60),
  business_address text CHECK (business_address IS NULL OR char_length(business_address) <= 500),
  document_paths text[] NOT NULL DEFAULT '{}' CHECK (cardinality(document_paths) <= 5),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_note text CHECK (admin_note IS NULL OR char_length(admin_note) <= 1000),
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vendor_verif_vendor_idx ON public.vendor_verification_requests (vendor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS vendor_verif_status_idx ON public.vendor_verification_requests (status, created_at);
-- Only one open request per supplier.
CREATE UNIQUE INDEX IF NOT EXISTS vendor_verif_one_pending ON public.vendor_verification_requests (vendor_id) WHERE status = 'pending';

ALTER TABLE public.vendor_verification_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Supplier and admins read verification" ON public.vendor_verification_requests;
CREATE POLICY "Supplier and admins read verification" ON public.vendor_verification_requests FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = vendor_id AND v.user_id = auth.uid())
         OR public.has_role(auth.uid(), 'admin'));
-- No insert/update/delete policy on purpose: rows are written only by the two functions below.
REVOKE ALL ON public.vendor_verification_requests FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.vendor_verification_requests FROM authenticated;
GRANT SELECT ON public.vendor_verification_requests TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_vendor_verification(_business_name text, _registration text, _address text, _paths text[])
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _vendor uuid;
  _id uuid;
  _p text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in.'; END IF;
  SELECT id INTO _vendor FROM public.vendors WHERE user_id = auth.uid();
  IF _vendor IS NULL THEN RAISE EXCEPTION 'Only suppliers can submit verification.'; END IF;
  IF COALESCE(array_length(_paths, 1), 0) < 1 THEN RAISE EXCEPTION 'Attach at least one business document.'; END IF;
  FOREACH _p IN ARRAY _paths LOOP
    -- Files live under <vendor id>/...; a supplier cannot point at someone else's files.
    IF split_part(_p, '/', 1) <> _vendor::text THEN RAISE EXCEPTION 'Invalid document.'; END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM public.vendor_verification_requests WHERE vendor_id = _vendor AND status = 'pending') THEN
    RAISE EXCEPTION 'Your verification is already being reviewed.';
  END IF;
  INSERT INTO public.vendor_verification_requests (vendor_id, business_name, registration_number, business_address, document_paths)
  VALUES (_vendor, trim(_business_name), NULLIF(trim(_registration), ''), NULLIF(trim(_address), ''), _paths)
  RETURNING id INTO _id;
  RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.submit_vendor_verification(text, text, text, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_vendor_verification(text, text, text, text[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.review_vendor_verification(_request uuid, _approve boolean, _note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _vendor uuid; _user uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admins only.'; END IF;
  UPDATE public.vendor_verification_requests
     SET status = CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,
         admin_note = NULLIF(trim(_note), ''), reviewed_by = auth.uid(), reviewed_at = now()
   WHERE id = _request AND status = 'pending'
   RETURNING vendor_id INTO _vendor;
  IF _vendor IS NULL THEN RAISE EXCEPTION 'This request was already reviewed.'; END IF;
  IF _approve THEN UPDATE public.vendors SET is_approved = true WHERE id = _vendor; END IF;
  SELECT user_id INTO _user FROM public.vendors WHERE id = _vendor;
  PERFORM public.notify_user(_user, 'account',
    CASE WHEN _approve THEN 'Your business is verified. A Verified badge now shows on your shop.'
         ELSE 'Your verification was not approved. Open Shop settings to see why and send it again.' END,
    '/supplier-dashboard?tab=shop-settings', NULL, auth.uid());
END $$;
REVOKE ALL ON FUNCTION public.review_vendor_verification(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_vendor_verification(uuid, boolean, text) TO authenticated;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('vendor-verification', 'vendor-verification', false, 10485760,
        ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 10485760;

DROP POLICY IF EXISTS "Supplier uploads verification files" ON storage.objects;
CREATE POLICY "Supplier uploads verification files" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'vendor-verification'
    AND EXISTS (SELECT 1 FROM public.vendors v WHERE v.user_id = auth.uid() AND v.id::text = (storage.foldername(name))[1]));
DROP POLICY IF EXISTS "Supplier and admins read verification files" ON storage.objects;
CREATE POLICY "Supplier and admins read verification files" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'vendor-verification'
    AND (public.has_role(auth.uid(), 'admin')
         OR EXISTS (SELECT 1 FROM public.vendors v WHERE v.user_id = auth.uid() AND v.id::text = (storage.foldername(name))[1])));

-- ------------------------------ smart reorder ------------------------------
-- A product is suggested when the buyer ordered it at least twice and the usual gap between orders has passed, or
-- when they bought it once and 30 days have passed. Only products that can be bought right now are returned.
DROP FUNCTION IF EXISTS public.suggest_reorders(integer);
CREATE OR REPLACE FUNCTION public.suggest_reorders(_limit integer DEFAULT 6)
RETURNS TABLE (product_id uuid, name text, slug text, image_url text, price numeric, price_tiers jsonb, moq integer, unit text,
               times_ordered integer, last_quantity integer, last_ordered_at timestamptz,
               usual_gap_days integer, days_since integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH mine AS (
    SELECT oi.product_id, o.created_at, oi.quantity
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    WHERE o.user_id = auth.uid() AND auth.uid() IS NOT NULL
      AND o.status NOT IN ('cancelled', 'canceled', 'refunded', 'failed')
  ),
  per AS (
    SELECT product_id,
           count(*)::integer AS times_ordered,
           max(created_at) AS last_ordered_at,
           (array_agg(quantity ORDER BY created_at DESC))[1] AS last_quantity,
           CASE WHEN count(*) > 1
                THEN GREATEST(1, round(extract(epoch FROM (max(created_at) - min(created_at))) / 86400 / (count(*) - 1)))::integer END AS usual_gap_days
    FROM mine GROUP BY product_id
  )
  SELECT p.product_id, pr.name, pr.slug, pr.image_url, pr.price, pr.price_tiers, pr.moq, pr.unit,
         p.times_ordered, p.last_quantity, p.last_ordered_at, p.usual_gap_days,
         floor(extract(epoch FROM (now() - p.last_ordered_at)) / 86400)::integer
  FROM per p
  JOIN public.products pr ON pr.id = p.product_id
  WHERE pr.is_active IS NOT FALSE AND pr.stock_quantity > 0 AND COALESCE(pr.is_preorder, false) = false
    AND now() - p.last_ordered_at >= make_interval(days => COALESCE(p.usual_gap_days, 30))
  ORDER BY (extract(epoch FROM (now() - p.last_ordered_at)) / 86400) / COALESCE(p.usual_gap_days, 30) DESC
  LIMIT LEAST(GREATEST(COALESCE(_limit, 6), 1), 20);
$$;
REVOKE ALL ON FUNCTION public.suggest_reorders(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.suggest_reorders(integer) TO authenticated;

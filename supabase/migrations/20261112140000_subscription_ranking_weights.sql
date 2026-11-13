CREATE TABLE IF NOT EXISTS public.marketplace_ranking_weights (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  ranking_enabled boolean NOT NULL DEFAULT false,
  subscription_boost numeric(6,2) NOT NULL DEFAULT 10.00 CHECK (subscription_boost BETWEEN 0 AND 100),
  availability_boost numeric(6,2) NOT NULL DEFAULT 5.00 CHECK (availability_boost BETWEEN 0 AND 100),
  recency_boost numeric(6,2) NOT NULL DEFAULT 5.00 CHECK (recency_boost BETWEEN 0 AND 100),
  popularity_boost numeric(6,2) NOT NULL DEFAULT 5.00 CHECK (popularity_boost BETWEEN 0 AND 100),
  review_boost numeric(6,2) NOT NULL DEFAULT 5.00 CHECK (review_boost BETWEEN 0 AND 100),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.marketplace_ranking_weights (
  id, ranking_enabled, subscription_boost, availability_boost, recency_boost, popularity_boost, review_boost
)
VALUES (true, false, 10.00, 5.00, 5.00, 5.00, 5.00)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.marketplace_ranking_weights ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage ranking weights" ON public.marketplace_ranking_weights;
CREATE POLICY "Admins manage ranking weights" ON public.marketplace_ranking_weights
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
REVOKE ALL ON public.marketplace_ranking_weights FROM PUBLIC, anon;
GRANT SELECT ON public.marketplace_ranking_weights TO authenticated;

CREATE OR REPLACE FUNCTION public.marketplace_visibility_score(_vendor_id uuid)
RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _weights public.marketplace_ranking_weights%ROWTYPE;
  _plan text;
  _plan_boost numeric := 0;
BEGIN
  SELECT * INTO _weights FROM public.marketplace_ranking_weights WHERE id = true;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  _plan := public.effective_supplier_plan(_vendor_id);
  SELECT COALESCE(visibility_boost, 0)::numeric INTO _plan_boost
  FROM public.supplier_membership_plans WHERE slug = _plan;

  RETURN COALESCE(_plan_boost, 0) + COALESCE(_weights.subscription_boost, 0);
END $$;
REVOKE ALL ON FUNCTION public.marketplace_visibility_score(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marketplace_visibility_score(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.product_ranking_score(_product_id uuid)
RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _product public.products%ROWTYPE;
  _weights public.marketplace_ranking_weights%ROWTYPE;
  _vendor_boost numeric := 0;
  _avg_rating numeric := 0;
  _recent_orders bigint := 0;
  _age_days integer := 0;
  _score numeric := 0;
BEGIN
  SELECT * INTO _product FROM public.products WHERE id = _product_id;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  SELECT * INTO _weights FROM public.marketplace_ranking_weights WHERE id = true;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  SELECT COALESCE(public.marketplace_visibility_score(_product.vendor_id), 0) INTO _vendor_boost;
  SELECT COALESCE(avg(rating), 0) INTO _avg_rating FROM public.reviews WHERE product_id = _product_id;
  SELECT count(*) INTO _recent_orders
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  WHERE oi.product_id = _product_id AND o.created_at >= now() - interval '30 days';

  _age_days := GREATEST(0, EXTRACT(day FROM (now() - _product.created_at))::integer);

  _score := (
    CASE WHEN _product.is_active THEN 1 ELSE 0 END * 100
    + _vendor_boost
    + COALESCE(_weights.availability_boost, 0) * CASE WHEN _product.stock_quantity > 0 THEN 1 ELSE 0 END
    + COALESCE(_weights.recency_boost, 0) * GREATEST(0, 1 - (_age_days / 365.0))
    + COALESCE(_weights.popularity_boost, 0) * LEAST(1, _recent_orders / 100.0)
    + COALESCE(_weights.review_boost, 0) * (COALESCE(_avg_rating, 0) / 5.0)
  );

  RETURN _score;
END $$;
REVOKE ALL ON FUNCTION public.product_ranking_score(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.product_ranking_score(uuid) TO authenticated;

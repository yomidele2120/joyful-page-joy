-- Optional per-category product limits on a plan, e.g. "Free: at most 3 phones". A category with no row here is
-- only held to the plan's overall product limit. Enforced in the database.
CREATE TABLE IF NOT EXISTS public.plan_category_limits (
  plan_slug text NOT NULL REFERENCES public.supplier_membership_plans(slug) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  product_limit integer NOT NULL CHECK (product_limit >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (plan_slug, category_id)
);
ALTER TABLE public.plan_category_limits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can read plan category limits" ON public.plan_category_limits;
CREATE POLICY "Anyone can read plan category limits" ON public.plan_category_limits FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Admins manage plan category limits" ON public.plan_category_limits;
CREATE POLICY "Admins manage plan category limits" ON public.plan_category_limits FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
REVOKE ALL ON public.plan_category_limits FROM PUBLIC, anon;
GRANT SELECT ON public.plan_category_limits TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.plan_category_limits TO authenticated;

CREATE OR REPLACE FUNCTION public.products_enforce_category_limit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _plan text; _limit integer; _count integer; _cat text;
BEGIN
  IF NEW.category_id IS NULL OR public.plan_is_trusted_caller() THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.category_id IS NOT DISTINCT FROM OLD.category_id THEN RETURN NEW; END IF;

  _plan := public.effective_supplier_plan(NEW.vendor_id);
  SELECT product_limit INTO _limit FROM public.plan_category_limits WHERE plan_slug = _plan AND category_id = NEW.category_id;
  IF _limit IS NULL THEN RETURN NEW; END IF;

  PERFORM pg_advisory_xact_lock(hashtext('plan_cat:' || NEW.vendor_id::text || NEW.category_id::text));
  SELECT count(*) INTO _count FROM (
    SELECT 1 FROM public.products WHERE vendor_id = NEW.vendor_id AND category_id = NEW.category_id AND id IS DISTINCT FROM NEW.id
    LIMIT greatest(_limit, 1)) c;
  IF _count >= _limit THEN
    SELECT name INTO _cat FROM public.categories WHERE id = NEW.category_id;
    RAISE EXCEPTION 'Your % plan allows % products in %. Upgrade your plan to add more.',
      (SELECT name FROM public.supplier_membership_plans WHERE slug = _plan), _limit, coalesce(_cat, 'this category')
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_products_enforce_category_limit ON public.products;
CREATE TRIGGER trg_products_enforce_category_limit
  BEFORE INSERT OR UPDATE OF category_id ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.products_enforce_category_limit();

-- Seller plan tiers with real limits.
-- Five tiers (free, silver, premium, gold, diamond). Every number is a column the admin can edit in the plan catalog:
--   product_limit  how many products the seller may have (empty = no limit)
--   pinned_limit   how many products the seller may keep pinned at the top
--   renew_hours    how often the seller's listings are moved back to the top (empty = never)
-- The limits are enforced here, in the database, so they cannot be skipped from the browser.

ALTER TABLE public.supplier_membership_plans DROP CONSTRAINT IF EXISTS supplier_membership_plans_slug_check;
ALTER TABLE public.supplier_membership_plans
  ADD CONSTRAINT supplier_membership_plans_slug_check CHECK (slug IN ('free', 'silver', 'premium', 'gold', 'diamond'));

DO $$
DECLARE _fresh boolean := NOT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'supplier_membership_plans' AND column_name = 'product_limit');
BEGIN
  ALTER TABLE public.supplier_membership_plans ADD COLUMN IF NOT EXISTS sort_order smallint NOT NULL DEFAULT 0;
  ALTER TABLE public.supplier_membership_plans ADD COLUMN IF NOT EXISTS product_limit integer CHECK (product_limit IS NULL OR product_limit >= 1);
  ALTER TABLE public.supplier_membership_plans ADD COLUMN IF NOT EXISTS pinned_limit smallint NOT NULL DEFAULT 0 CHECK (pinned_limit BETWEEN 0 AND 100);
  ALTER TABLE public.supplier_membership_plans ADD COLUMN IF NOT EXISTS renew_hours smallint CHECK (renew_hours IS NULL OR renew_hours BETWEEN 1 AND 720);

  INSERT INTO public.supplier_membership_plans (slug, name, price_kobo, period_days, visibility_boost, features, purchase_enabled)
  VALUES ('gold', 'Gold', NULL, 30, 30, '{}'::jsonb, false),
         ('diamond', 'Diamond', NULL, 30, 40, '{}'::jsonb, false)
  ON CONFLICT (slug) DO NOTHING;

  -- Starting values, only set the first time this runs. They are placeholders: set the real numbers in the admin plan catalog.
  IF _fresh THEN
    UPDATE public.supplier_membership_plans p SET
      sort_order = v.so, product_limit = v.pl, pinned_limit = v.pin, renew_hours = v.rh
    FROM (VALUES ('free', 0, 20, 0, NULL::int), ('silver', 1, 50, 3, 48), ('premium', 2, 150, 5, 24),
                 ('gold', 3, 500, 10, 12), ('diamond', 4, NULL::int, 20, 6)) AS v(slug, so, pl, pin, rh)
    WHERE p.slug = v.slug;
  END IF;
END $$;

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS bumped_at timestamptz NOT NULL DEFAULT now();
UPDATE public.products SET bumped_at = created_at WHERE bumped_at > created_at AND created_at < now() - interval '1 minute';

CREATE INDEX IF NOT EXISTS idx_products_public_rank ON public.products (is_pinned DESC, bumped_at DESC, id DESC) WHERE is_public;
CREATE INDEX IF NOT EXISTS idx_products_public_rank_cat ON public.products (category_id, is_pinned DESC, bumped_at DESC, id DESC) WHERE is_public;
CREATE INDEX IF NOT EXISTS idx_products_public_rank_vendor ON public.products (vendor_id, is_pinned DESC, bumped_at DESC, id DESC) WHERE is_public;

-- Trusted callers: the service role, cron, and admins. Everyone else is a seller and is held to the plan.
CREATE OR REPLACE FUNCTION public.plan_is_trusted_caller() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin');
$$;
REVOKE ALL ON FUNCTION public.plan_is_trusted_caller() FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.products_enforce_plan() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _plan public.supplier_membership_plans%ROWTYPE;
  _count integer;
BEGIN
  IF public.plan_is_trusted_caller() THEN RETURN NEW; END IF;

  -- Sellers cannot move their own listings up the list: the clock is only set by the server.
  IF TG_OP = 'INSERT' THEN
    NEW.bumped_at := now();
  ELSIF NEW.bumped_at IS DISTINCT FROM OLD.bumped_at AND coalesce(current_setting('app.listing_renewal', true), '') <> '1' THEN
    NEW.bumped_at := OLD.bumped_at;
  END IF;

  SELECT * INTO _plan FROM public.supplier_membership_plans WHERE slug = public.effective_supplier_plan(NEW.vendor_id);

  IF TG_OP = 'INSERT' AND _plan.product_limit IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('plan_products:' || NEW.vendor_id::text));
    SELECT count(*) INTO _count FROM (SELECT 1 FROM public.products WHERE vendor_id = NEW.vendor_id LIMIT _plan.product_limit) c;
    IF _count >= _plan.product_limit THEN
      RAISE EXCEPTION 'Your % plan allows % products. Upgrade your plan to add more.', _plan.name, _plan.product_limit
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF NEW.is_pinned AND (TG_OP = 'INSERT' OR NOT OLD.is_pinned) THEN
    PERFORM pg_advisory_xact_lock(hashtext('plan_pins:' || NEW.vendor_id::text));
    SELECT count(*) INTO _count FROM public.products WHERE vendor_id = NEW.vendor_id AND is_pinned;
    IF _count >= coalesce(_plan.pinned_limit, 0) THEN
      IF coalesce(_plan.pinned_limit, 0) = 0 THEN
        RAISE EXCEPTION 'Your % plan does not include pinned products. Upgrade your plan to pin products.', _plan.name
          USING ERRCODE = 'P0001';
      ELSE
        RAISE EXCEPTION 'Your % plan allows % pinned products. Unpin one first or upgrade your plan.', _plan.name, _plan.pinned_limit
          USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_products_enforce_plan ON public.products;
CREATE TRIGGER trg_products_enforce_plan
  BEFORE INSERT OR UPDATE OF is_pinned, bumped_at ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.products_enforce_plan();

-- What the seller sees on their plan screen and the add-product form.
CREATE OR REPLACE FUNCTION public.my_plan_usage() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _vendor uuid;
  _plan public.supplier_membership_plans%ROWTYPE;
BEGIN
  SELECT id INTO _vendor FROM public.vendors WHERE user_id = auth.uid() LIMIT 1;
  IF _vendor IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO _plan FROM public.supplier_membership_plans WHERE slug = public.effective_supplier_plan(_vendor);
  RETURN jsonb_build_object(
    'plan_slug', _plan.slug, 'plan_name', _plan.name,
    'product_limit', _plan.product_limit,
    'product_count', (SELECT count(*) FROM public.products WHERE vendor_id = _vendor),
    'pinned_limit', _plan.pinned_limit,
    'pinned_count', (SELECT count(*) FROM public.products WHERE vendor_id = _vendor AND is_pinned),
    'renew_hours', _plan.renew_hours);
END $$;
REVOKE ALL ON FUNCTION public.my_plan_usage() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_plan_usage() TO authenticated;

-- Scheduled job: drop pins a seller no longer has room for (plan ended or was lowered), then move listings that are
-- due for renewal back to the top. Each product renews on its own clock, so renewals are spread out, not all at once.
CREATE OR REPLACE FUNCTION public.run_listing_renewals() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _unpinned int; _renewed int;
BEGIN
  PERFORM set_config('app.listing_renewal', '1', true);

  WITH v AS (SELECT DISTINCT vendor_id FROM public.products WHERE is_pinned),
  lim AS (
    SELECT v.vendor_id,
           coalesce((SELECT pl.pinned_limit FROM public.supplier_membership_plans pl
                     WHERE pl.slug = public.effective_supplier_plan(v.vendor_id)), 0) AS l
    FROM v),
  ranked AS (
    SELECT p.id, row_number() OVER (PARTITION BY p.vendor_id ORDER BY p.bumped_at DESC, p.id) AS rn, lim.l
    FROM public.products p JOIN lim ON lim.vendor_id = p.vendor_id WHERE p.is_pinned)
  UPDATE public.products p SET is_pinned = false FROM ranked r WHERE p.id = r.id AND r.rn > r.l;
  GET DIAGNOSTICS _unpinned = ROW_COUNT;

  WITH due_vendors AS (
    SELECT vd.id AS vendor_id, pl.renew_hours
    FROM public.vendors vd
    JOIN public.supplier_membership_plans pl ON pl.slug = public.effective_supplier_plan(vd.id)
    WHERE pl.renew_hours IS NOT NULL),
  due AS (
    SELECT p.id FROM public.products p JOIN due_vendors d ON d.vendor_id = p.vendor_id
    WHERE p.is_public AND NOT p.is_pinned AND p.bumped_at <= now() - (d.renew_hours * interval '1 hour')
    LIMIT 20000)
  UPDATE public.products p SET bumped_at = now() FROM due WHERE p.id = due.id;
  GET DIAGNOSTICS _renewed = ROW_COUNT;

  RETURN jsonb_build_object('unpinned', _unpinned, 'renewed', _renewed);
END $$;
REVOKE ALL ON FUNCTION public.run_listing_renewals() FROM PUBLIC, anon, authenticated;

-- Run it every 30 minutes when pg_cron is available. If it is not, schedule public.run_listing_renewals() yourself.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'listing-renewals';
    PERFORM cron.schedule('listing-renewals', '*/30 * * * *', 'select public.run_listing_renewals()');
  END IF;
END $$;

-- The new tiers need rows in the other plan-based tables too, copied from Premium as a starting point (editable in admin).
INSERT INTO public.call_plan_quotas (plan_slug, daily_minutes, monthly_minutes, max_concurrent_calls)
SELECT t.slug, q.daily_minutes, q.monthly_minutes, q.max_concurrent_calls
FROM (VALUES ('gold'), ('diamond')) t(slug), public.call_plan_quotas q WHERE q.plan_slug = 'premium'
ON CONFLICT (plan_slug) DO NOTHING;

INSERT INTO public.call_queue_capacity (plan_slug, max_waiting)
SELECT t.slug, c.max_waiting FROM (VALUES ('gold'), ('diamond')) t(slug), public.call_queue_capacity c WHERE c.plan_slug = 'premium'
ON CONFLICT (plan_slug) DO NOTHING;

INSERT INTO public.advertising_plan_features
  (plan_slug, homepage_promotion_enabled, max_advertised_products, external_ads_enabled, sponsored_placement_enabled,
   featured_banner_enabled, campaign_duration_days, social_banner_enabled, max_social_profiles, banner_generations_allowed, priority_weight)
SELECT t.slug, f.homepage_promotion_enabled, f.max_advertised_products, f.external_ads_enabled, f.sponsored_placement_enabled,
       f.featured_banner_enabled, f.campaign_duration_days, f.social_banner_enabled, f.max_social_profiles, f.banner_generations_allowed, f.priority_weight
FROM (VALUES ('gold'), ('diamond')) t(slug), public.advertising_plan_features f WHERE f.plan_slug = 'premium'
ON CONFLICT (plan_slug) DO NOTHING;


-- Expiry reminder emails cover every paid tier.
CREATE OR REPLACE FUNCTION public.queue_supplier_membership_expiry_emails()
RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE _membership record; _queued integer := 0; _offset integer;
BEGIN
  FOR _membership IN
    SELECT m.vendor_id, m.plan_slug, m.expires_at, v.user_id
    FROM public.vendor_memberships m JOIN public.vendors v ON v.id = m.vendor_id
    WHERE m.status = 'active' AND m.plan_slug IN ('silver', 'premium', 'gold', 'diamond')
      AND m.expires_at > now() AND m.expires_at <= now() + interval '7 days'
  LOOP
    _offset := CASE WHEN _membership.expires_at <= now() + interval '1 day' THEN 1 ELSE 7 END;
    PERFORM public.enqueue_email_notification(
      'membership-expiry:' || _membership.vendor_id::text || ':' || _membership.expires_at::text || ':' || _offset,
      'vendor.membership_expiring', _membership.user_id,
      jsonb_build_object('vendor_id', _membership.vendor_id, 'plan_slug', _membership.plan_slug,
                         'expires_at', _membership.expires_at, 'days_left', _offset));
    _queued := _queued + 1;
  END LOOP;
  RETURN _queued;
END $$;

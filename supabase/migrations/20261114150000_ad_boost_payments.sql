-- =====================================================================
-- AD BOOST PAYMENTS: a vendor can buy extra views ("boost") for a running promotion, paid through Paystack.
-- Kept separate from the plan subscription (supplier_membership_payments) and from any external ad-platform spend.
-- Admin defines the packages and prices; nothing is priced here. A payment is applied ONLY by finalize_ad_boost_payment(),
-- which the edge functions call after Paystack confirms the charge server-side (amount and currency must match the record).
-- Requires 20261114090000_vendor_advertising.sql AND 20261114120000_call_queue_and_audit.sql (audit trigger function). Safe to run more than once.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.ad_boost_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 60),
  impressions integer NOT NULL CHECK (impressions BETWEEN 100 AND 10000000),
  price_kobo bigint NOT NULL CHECK (price_kobo > 0),
  currency text NOT NULL DEFAULT 'NGN' CHECK (currency = 'NGN'),
  is_active boolean NOT NULL DEFAULT false,
  sort_order smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ad_boost_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.vendor_advertising_campaigns(id) ON DELETE CASCADE,
  package_id uuid REFERENCES public.ad_boost_packages(id) ON DELETE SET NULL,
  package_name text NOT NULL,
  impressions integer NOT NULL CHECK (impressions > 0),
  paystack_reference text NOT NULL UNIQUE,
  amount_kobo bigint NOT NULL CHECK (amount_kobo > 0),
  currency text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed', 'needs_review')),
  status_detail text,
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_ad_boost_pay_vendor ON public.ad_boost_payments (vendor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ad_boost_pay_campaign ON public.ad_boost_payments (campaign_id);

ALTER TABLE public.vendor_advertising_campaigns
  ADD COLUMN IF NOT EXISTS boost_impressions bigint NOT NULL DEFAULT 0 CHECK (boost_impressions >= 0),
  ADD COLUMN IF NOT EXISTS boost_start_count bigint;     -- impressions_count when the first boost was applied

ALTER TABLE public.ad_boost_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_boost_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Read active boost packages" ON public.ad_boost_packages;
CREATE POLICY "Read active boost packages" ON public.ad_boost_packages FOR SELECT TO authenticated
  USING (is_active OR public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Admins manage boost packages" ON public.ad_boost_packages;
CREATE POLICY "Admins manage boost packages" ON public.ad_boost_packages FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Vendors read own boost payments" ON public.ad_boost_payments;
CREATE POLICY "Vendors read own boost payments" ON public.ad_boost_payments FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = vendor_id AND v.user_id = auth.uid()));
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.ad_boost_payments FROM anon, authenticated;   -- written only by edge functions / functions below
REVOKE ALL ON public.ad_boost_payments FROM anon;
REVOKE ALL ON public.ad_boost_packages FROM anon;

-- Remaining boosted views for a campaign (derived, so nothing needs to be decremented on every impression).
CREATE OR REPLACE FUNCTION public.ad_boost_remaining(_boost bigint, _start bigint, _impressions bigint) RETURNS bigint
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN coalesce(_boost, 0) <= 0 THEN 0
              ELSE greatest(0, _boost - greatest(0, coalesce(_impressions, 0) - coalesce(_start, 0))) END;
$$;

-- Applies a verified payment. Service role only. Idempotent: the same reference twice adds the views once.
CREATE OR REPLACE FUNCTION public.finalize_ad_boost_payment(_reference text, _amount_kobo bigint, _currency text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _p public.ad_boost_payments%ROWTYPE; _c public.vendor_advertising_campaigns%ROWTYPE; _e jsonb; _has_c boolean;
BEGIN
  SELECT * INTO _p FROM public.ad_boost_payments WHERE paystack_reference = _reference FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF _p.status = 'success' THEN RETURN true; END IF;
  IF _p.status NOT IN ('pending', 'needs_review') OR _p.amount_kobo <> _amount_kobo OR _p.currency <> _currency THEN RETURN false; END IF;

  SELECT * INTO _c FROM public.vendor_advertising_campaigns WHERE id = _p.campaign_id AND vendor_id = _p.vendor_id FOR UPDATE;
  _has_c := FOUND;
  _e := public.ad_entitlement(_p.vendor_id);
  -- Money has been taken but the views cannot be applied (campaign gone/ended, or plan lapsed): flag for an admin, never silently keep it.
  IF NOT _has_c OR _c.status NOT IN ('active', 'paused', 'pending_review') OR _c.end_date <= now() OR NOT (_e ->> 'active')::boolean THEN
    UPDATE public.ad_boost_payments SET status = 'needs_review', paid_at = coalesce(paid_at, now()),
      status_detail = 'Payment received but the promotion is no longer running. Refund or reapply manually.' WHERE id = _p.id;
    PERFORM public.ad_notify_admins('A boost payment was received for a promotion that is no longer running. Please review it.');
    RETURN true;      -- the charge itself is verified; the case is now with an admin
  END IF;

  UPDATE public.vendor_advertising_campaigns
     SET boost_impressions = boost_impressions + _p.impressions,
         boost_start_count = coalesce(boost_start_count, impressions_count)
   WHERE id = _c.id;
  UPDATE public.ad_boost_payments SET status = 'success', paid_at = now(), status_detail = NULL WHERE id = _p.id;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.finalize_ad_boost_payment(text, bigint, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_ad_boost_payment(text, bigint, text) TO service_role;

-- Homepage query: same as before, plus boosted views (they lift the plan's impression cap and are shown first).
CREATE OR REPLACE FUNCTION public.get_homepage_ads(_placement text, _limit integer DEFAULT 30) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _placement NOT IN ('featured', 'sponsored_row', 'rotating') THEN RAISE EXCEPTION 'Unknown placement.'; END IF;
  RETURN coalesce((
    SELECT jsonb_agg(x) FROM (
      SELECT c.id, c.vendor_id, c.campaign_type, c.headline, c.description, c.cta_text, c.banner_image_url, c.priority,
             c.destination_url, c.impressions_count, c.clicks_count, c.start_date, c.end_date,
             v.store_name, v.logo_url, coalesce(v.product_categories[1], v.business_type) AS category,
             f.priority_weight, f.impression_allocation,
             public.ad_boost_remaining(c.boost_impressions, c.boost_start_count, c.impressions_count) AS boost_remaining,
             CASE WHEN c.campaign_type = 'product_promotion' THEN (
               SELECT coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'slug', p.slug, 'name', p.name,
                                         'image', coalesce(p.thumb_url, p.image_url)) ORDER BY ap.position), '[]'::jsonb)
                 FROM (SELECT * FROM public.vendor_advertising_products a2 WHERE a2.campaign_id = c.id ORDER BY a2.position LIMIT 4) ap
                 JOIN public.products p ON p.id = ap.product_id AND p.is_active AND p.is_public)
             ELSE '[]'::jsonb END AS products
        FROM public.vendor_advertising_campaigns c
        JOIN public.vendors v ON v.id = c.vendor_id AND v.is_approved
        JOIN public.vendor_memberships m ON m.vendor_id = c.vendor_id AND m.status = 'active'
                                        AND (m.expires_at IS NULL OR m.expires_at > now())
        JOIN public.supplier_membership_plans sp ON sp.slug = m.plan_slug AND sp.is_active
        JOIN public.advertising_plan_features f ON f.plan_slug = m.plan_slug AND f.homepage_promotion_enabled
        CROSS JOIN public.advertising_settings s
       WHERE s.ads_enabled AND c.status = 'active' AND c.start_date <= now() AND c.end_date > now()
         AND c.banner_image_url IS NOT NULL AND c.headline IS NOT NULL
         AND _placement = ANY (c.placements)
         AND (_placement = 'rotating'
              OR (_placement = 'featured' AND f.featured_banner_enabled)
              OR (_placement = 'sponsored_row' AND f.sponsored_placement_enabled))
         AND (f.impression_allocation IS NULL OR c.impressions_count < f.impression_allocation
              OR public.ad_boost_remaining(c.boost_impressions, c.boost_start_count, c.impressions_count) > 0)
       ORDER BY (public.ad_boost_remaining(c.boost_impressions, c.boost_start_count, c.impressions_count) > 0) DESC, c.priority DESC, c.id
       LIMIT least(greatest(coalesce(_limit, 30), 1), 60)
    ) x), '[]'::jsonb);
END $$;

-- Vendor view: packages on offer + own boost history.
CREATE OR REPLACE FUNCTION public.my_ad_boosts() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _v uuid := public.ad_require_vendor();
BEGIN
  RETURN jsonb_build_object(
    'packages', coalesce((SELECT jsonb_agg(jsonb_build_object('id', id, 'name', name, 'impressions', impressions, 'price_kobo', price_kobo, 'currency', currency) ORDER BY sort_order, price_kobo)
                            FROM public.ad_boost_packages WHERE is_active), '[]'::jsonb),
    'payments', coalesce((SELECT jsonb_agg(jsonb_build_object('id', id, 'campaign_id', campaign_id, 'package_name', package_name, 'impressions', impressions,
                            'amount_kobo', amount_kobo, 'status', status, 'created_at', created_at, 'paid_at', paid_at) ORDER BY created_at DESC)
                            FROM (SELECT * FROM public.ad_boost_payments WHERE vendor_id = _v ORDER BY created_at DESC LIMIT 20) p), '[]'::jsonb),
    'campaigns', coalesce((SELECT jsonb_agg(jsonb_build_object('campaign_id', c.id,
                            'boost_remaining', public.ad_boost_remaining(c.boost_impressions, c.boost_start_count, c.impressions_count)))
                            FROM public.vendor_advertising_campaigns c WHERE c.vendor_id = _v), '[]'::jsonb));
END $$;

-- Admin: money in (successful boost payments only) and items that need attention.
CREATE OR REPLACE FUNCTION public.admin_ad_boost_summary() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.ad_require_admin();
  RETURN jsonb_build_object(
    'revenue_kobo_30d', (SELECT coalesce(sum(amount_kobo), 0) FROM public.ad_boost_payments WHERE status = 'success' AND paid_at >= now() - interval '30 days'),
    'revenue_kobo_all', (SELECT coalesce(sum(amount_kobo), 0) FROM public.ad_boost_payments WHERE status = 'success'),
    'paid_count', (SELECT count(*) FROM public.ad_boost_payments WHERE status = 'success'),
    'needs_review', coalesce((SELECT jsonb_agg(jsonb_build_object('id', p.id, 'store_name', v.store_name, 'amount_kobo', p.amount_kobo,
                              'reference', p.paystack_reference, 'detail', p.status_detail, 'created_at', p.created_at) ORDER BY p.created_at DESC)
                              FROM public.ad_boost_payments p JOIN public.vendors v ON v.id = p.vendor_id WHERE p.status = 'needs_review'), '[]'::jsonb),
    'recent', coalesce((SELECT jsonb_agg(jsonb_build_object('id', p.id, 'store_name', v.store_name, 'package_name', p.package_name, 'amount_kobo', p.amount_kobo,
                              'status', p.status, 'created_at', p.created_at) ORDER BY p.created_at DESC)
                              FROM (SELECT * FROM public.ad_boost_payments ORDER BY created_at DESC LIMIT 30) p JOIN public.vendors v ON v.id = p.vendor_id), '[]'::jsonb));
END $$;

DO $$
DECLARE _f text;
BEGIN
  FOREACH _f IN ARRAY ARRAY['my_ad_boosts()', 'admin_ad_boost_summary()', 'ad_boost_remaining(bigint,bigint,bigint)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', _f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', _f);
  END LOOP;
  EXECUTE 'REVOKE ALL ON FUNCTION public.get_homepage_ads(text, integer) FROM PUBLIC';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_homepage_ads(text, integer) TO anon, authenticated';
  IF to_regclass('public.ad_boost_packages') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_audit_ad_boost_packages ON public.ad_boost_packages';
    EXECUTE 'CREATE TRIGGER trg_audit_ad_boost_packages AFTER INSERT OR UPDATE OR DELETE ON public.ad_boost_packages FOR EACH ROW EXECUTE FUNCTION public.audit_admin_change()';
  END IF;
END $$;

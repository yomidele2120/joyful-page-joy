-- =====================================================================
-- VENDOR ADVERTISING & HOMEPAGE PROMOTION
--
-- Extends the existing supplier membership system (supplier_membership_plans -> vendor_memberships ->
-- supplier_membership_payments -> finalize_supplier_membership_payment). Nothing about payments is
-- duplicated: when a membership payment is finalised by trusted server code, a trigger on vendor_memberships
-- grants the advertising benefits and queues the banner-generation job in the SAME transaction.
--
--   advertising_settings           admin switches and limits (one row)
--   advertising_plan_features      ad benefits per membership plan
--   vendor_advertising_campaigns   one row per campaign (shop or product promotion)
--   vendor_advertising_banners     every generated banner version + moderation state
--   vendor_advertising_products    products attached to a campaign
--   vendor_social_profiles         public social profile LINKS (no passwords, no tokens). The older
--                                  vendor_social_accounts table stores OAuth tokens and is left untouched.
--   advertising_generation_jobs    AI banner job queue (retries, quotas, cost, failures)
--   advertising_impressions/clicks de-duplicated analytics events
--   external_ad_campaigns          requests for Google/Facebook/Instagram/TikTok ads (never simulated)
--
-- Vendors have NO direct write access to any of these tables: every vendor action goes through a
-- SECURITY DEFINER function that checks ownership, plan limits and input. Safe to run more than once.
-- =====================================================================

-- ---------------------------------------------------------------- settings
CREATE TABLE IF NOT EXISTS public.advertising_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  ads_enabled boolean NOT NULL DEFAULT true,
  require_approval boolean NOT NULL DEFAULT true,
  featured_banner_limit smallint NOT NULL DEFAULT 1 CHECK (featured_banner_limit BETWEEN 1 AND 10),
  sponsored_banner_limit smallint NOT NULL DEFAULT 4 CHECK (sponsored_banner_limit BETWEEN 0 AND 12),
  sponsored_row_interval smallint NOT NULL DEFAULT 3 CHECK (sponsored_row_interval BETWEEN 1 AND 20),
  rotating_limit smallint NOT NULL DEFAULT 6 CHECK (rotating_limit BETWEEN 1 AND 24),
  rotation_minutes smallint NOT NULL DEFAULT 30 CHECK (rotation_minutes BETWEEN 1 AND 1440),
  social_banner_enabled boolean NOT NULL DEFAULT true,
  social_display_minutes smallint NOT NULL DEFAULT 30 CHECK (social_display_minutes BETWEEN 1 AND 240),
  social_rotation_minutes smallint NOT NULL DEFAULT 60 CHECK (social_rotation_minutes BETWEEN 1 AND 1440),
  social_max_per_day smallint NOT NULL DEFAULT 3 CHECK (social_max_per_day BETWEEN 1 AND 20),
  social_dismiss_hours smallint NOT NULL DEFAULT 24 CHECK (social_dismiss_hours BETWEEN 1 AND 720),
  ai_generation_enabled boolean NOT NULL DEFAULT true,
  ai_daily_limit integer NOT NULL DEFAULT 200 CHECK (ai_daily_limit BETWEEN 0 AND 100000),
  ai_monthly_budget_usd numeric(10,2) NOT NULL DEFAULT 50 CHECK (ai_monthly_budget_usd >= 0),
  ai_cost_per_image_usd numeric(8,4) NOT NULL DEFAULT 0.04 CHECK (ai_cost_per_image_usd >= 0),
  ai_max_attempts smallint NOT NULL DEFAULT 3 CHECK (ai_max_attempts BETWEEN 1 AND 6),
  regen_cooldown_minutes smallint NOT NULL DEFAULT 10 CHECK (regen_cooldown_minutes BETWEEN 0 AND 1440),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.advertising_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------- plan benefits
CREATE TABLE IF NOT EXISTS public.advertising_plan_features (
  plan_slug text PRIMARY KEY REFERENCES public.supplier_membership_plans(slug) ON DELETE CASCADE,
  homepage_promotion_enabled boolean NOT NULL DEFAULT false,
  max_advertised_products integer NOT NULL DEFAULT 0 CHECK (max_advertised_products BETWEEN 0 AND 500),
  external_ads_enabled boolean NOT NULL DEFAULT false,
  sponsored_placement_enabled boolean NOT NULL DEFAULT false,
  featured_banner_enabled boolean NOT NULL DEFAULT false,
  campaign_duration_days integer NOT NULL DEFAULT 30 CHECK (campaign_duration_days BETWEEN 1 AND 366),
  social_banner_enabled boolean NOT NULL DEFAULT false,
  max_social_profiles smallint NOT NULL DEFAULT 0 CHECK (max_social_profiles BETWEEN 0 AND 3),
  banner_generations_allowed integer NOT NULL DEFAULT 0 CHECK (banner_generations_allowed BETWEEN 0 AND 1000),
  impression_allocation bigint CHECK (impression_allocation IS NULL OR impression_allocation >= 0),
  priority_weight smallint NOT NULL DEFAULT 1 CHECK (priority_weight BETWEEN 1 AND 10),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- Starting values only. Admins edit them in the dashboard; a plan still cannot be bought until its price is set
-- and purchase_enabled is switched on in the Supplier plans tab.
INSERT INTO public.advertising_plan_features
  (plan_slug, homepage_promotion_enabled, max_advertised_products, external_ads_enabled, sponsored_placement_enabled,
   featured_banner_enabled, campaign_duration_days, social_banner_enabled, max_social_profiles, banner_generations_allowed, priority_weight)
VALUES
  ('free',    false, 0,  false, false, false, 30, false, 0, 0, 1),
  ('silver',  true,  10, false, false, false, 30, true,  2, 3, 1),
  ('premium', true,  50, true,  true,  true,  30, true,  3, 6, 3)
ON CONFLICT (plan_slug) DO NOTHING;

-- ---------------------------------------------------------------- campaigns
CREATE TABLE IF NOT EXISTS public.vendor_advertising_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  campaign_type text NOT NULL CHECK (campaign_type IN ('shop_promotion', 'product_promotion')),
  -- The membership payment that funded this campaign (kept for history; nullable if an admin granted the plan).
  subscription_id uuid REFERENCES public.supplier_membership_payments(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending_generation' CHECK (status IN
    ('pending_generation', 'generating', 'pending_review', 'active', 'paused', 'rejected', 'expired', 'failed', 'cancelled')),
  paused_by text CHECK (paused_by IS NULL OR paused_by IN ('vendor', 'admin')),
  start_date timestamptz NOT NULL DEFAULT now(),
  end_date timestamptz NOT NULL,
  placements text[] NOT NULL DEFAULT ARRAY['rotating']::text[]
    CHECK (cardinality(placements) >= 1 AND placements <@ ARRAY['featured', 'sponsored_row', 'rotating']::text[]),
  priority smallint NOT NULL DEFAULT 0 CHECK (priority BETWEEN 0 AND 100),  -- admin only
  target_shop_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  target_product_ids uuid[] NOT NULL DEFAULT '{}',
  banner_id uuid,
  banner_image_url text CHECK (banner_image_url IS NULL OR banner_image_url ~ '^https://'),
  banner_public_id text,
  headline text CHECK (headline IS NULL OR char_length(headline) <= 80),
  description text CHECK (description IS NULL OR char_length(description) <= 200),
  cta_text text NOT NULL DEFAULT 'Visit shop' CHECK (char_length(cta_text) BETWEEN 2 AND 24),
  destination_url text NOT NULL CHECK (destination_url ~ '^/shop/[0-9a-f-]{36}$'),
  custom_headline text CHECK (custom_headline IS NULL OR char_length(custom_headline) <= 80),
  custom_description text CHECK (custom_description IS NULL OR char_length(custom_description) <= 200),
  pending_headline text CHECK (pending_headline IS NULL OR char_length(pending_headline) <= 80),
  pending_description text CHECK (pending_description IS NULL OR char_length(pending_description) <= 200),
  message_review text CHECK (message_review IS NULL OR message_review = 'pending'),
  admin_note text CHECK (admin_note IS NULL OR char_length(admin_note) <= 500),
  impressions_count bigint NOT NULL DEFAULT 0,
  clicks_count bigint NOT NULL DEFAULT 0,
  shop_visits_count bigint NOT NULL DEFAULT 0,
  product_visits_count bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),  -- not now(): "latest campaign" must be unambiguous inside one transaction
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- A campaign can only ever send visitors to its own vendor's shop.
  CONSTRAINT ad_campaign_own_shop CHECK (target_shop_id = vendor_id),
  CONSTRAINT ad_campaign_window CHECK (end_date > start_date),
  CONSTRAINT ad_campaign_product_count CHECK (cardinality(target_product_ids) <= 500)
);
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_live ON public.vendor_advertising_campaigns (status, end_date) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_vendor ON public.vendor_advertising_campaigns (vendor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_status ON public.vendor_advertising_campaigns (status, created_at DESC);
-- At most one non-finished shop campaign and one product campaign per vendor.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ad_campaign_one_open_per_type ON public.vendor_advertising_campaigns (vendor_id, campaign_type)
  WHERE status IN ('pending_generation', 'generating', 'pending_review', 'active', 'paused');

-- ---------------------------------------------------------------- banners
CREATE TABLE IF NOT EXISTS public.vendor_advertising_banners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.vendor_advertising_campaigns(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version >= 1),
  status text NOT NULL DEFAULT 'ready' CHECK (status IN ('ready', 'rejected', 'superseded')),
  image_url text NOT NULL CHECK (image_url ~ '^https://'),
  public_id text,
  width integer CHECK (width IS NULL OR width > 0),
  height integer CHECK (height IS NULL OR height > 0),
  headline text NOT NULL CHECK (char_length(headline) BETWEEN 3 AND 80),
  description text NOT NULL CHECK (char_length(description) BETWEEN 10 AND 200),
  art_category text,
  ai_provider text,
  ai_model text,
  prompt_hash text,
  generation_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  moderation_status text NOT NULL DEFAULT 'pending' CHECK (moderation_status IN ('pending', 'approved', 'rejected')),
  moderation_flags text[] NOT NULL DEFAULT '{}',
  moderation_note text CHECK (moderation_note IS NULL OR char_length(moderation_note) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, version)
);
CREATE INDEX IF NOT EXISTS idx_ad_banners_vendor ON public.vendor_advertising_banners (vendor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ad_banners_review ON public.vendor_advertising_banners (moderation_status, created_at DESC);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ad_campaign_banner_fk') THEN
    ALTER TABLE public.vendor_advertising_campaigns
      ADD CONSTRAINT ad_campaign_banner_fk FOREIGN KEY (banner_id) REFERENCES public.vendor_advertising_banners(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ---------------------------------------------------------------- products on a campaign
CREATE TABLE IF NOT EXISTS public.vendor_advertising_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.vendor_advertising_campaigns(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  position smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, product_id)
);
CREATE INDEX IF NOT EXISTS idx_ad_products_vendor ON public.vendor_advertising_products (vendor_id);
CREATE INDEX IF NOT EXISTS idx_ad_products_product ON public.vendor_advertising_products (product_id);

-- ---------------------------------------------------------------- social profile links
CREATE TABLE IF NOT EXISTS public.vendor_social_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('instagram', 'facebook', 'tiktok')),
  profile_url text NOT NULL CHECK (profile_url ~ '^https://' AND char_length(profile_url) <= 200),
  handle text NOT NULL CHECK (char_length(handle) BETWEEN 2 AND 50),
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 60),
  -- Only an admin can mark a profile verified; vendors cannot set this.
  verification_status text NOT NULL DEFAULT 'unverified' CHECK (verification_status IN ('unverified', 'verified', 'rejected')),
  promo_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vendor_id, platform)
);
CREATE INDEX IF NOT EXISTS idx_social_profiles_vendor ON public.vendor_social_profiles (vendor_id) WHERE promo_enabled;

-- ---------------------------------------------------------------- generation jobs
CREATE TABLE IF NOT EXISTS public.advertising_generation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.vendor_advertising_campaigns(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('initial', 'product', 'regenerate', 'admin_revision')),
  counts_toward_quota boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  attempts smallint NOT NULL DEFAULT 0,
  max_attempts smallint NOT NULL DEFAULT 3,
  run_after timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  last_attempt_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  error_code text,
  error text CHECK (error IS NULL OR char_length(error) <= 1000),
  admin_note text CHECK (admin_note IS NULL OR char_length(admin_note) <= 500),
  estimated_cost_usd numeric(10,4) NOT NULL DEFAULT 0 CHECK (estimated_cost_usd >= 0),
  idempotency_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ad_jobs_queue ON public.advertising_generation_jobs (run_after) WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS idx_ad_jobs_vendor ON public.advertising_generation_jobs (vendor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ad_jobs_status ON public.advertising_generation_jobs (status, created_at DESC);
-- Duplicate-generation guard: a campaign can have only one queued or running job at a time.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ad_jobs_one_open_per_campaign ON public.advertising_generation_jobs (campaign_id)
  WHERE status IN ('queued', 'running');

-- ---------------------------------------------------------------- analytics events
CREATE TABLE IF NOT EXISTS public.advertising_impressions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  campaign_id uuid REFERENCES public.vendor_advertising_campaigns(id) ON DELETE CASCADE,
  social_profile_id uuid REFERENCES public.vendor_social_profiles(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  placement text NOT NULL CHECK (placement IN ('featured', 'sponsored_row', 'rotating', 'social_banner')),
  visitor_id text NOT NULL CHECK (visitor_id ~ '^[A-Za-z0-9_-]{8,64}$'),
  device text CHECK (device IS NULL OR device IN ('mobile', 'tablet', 'desktop')),
  bucket timestamptz NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ad_impression_dedupe ON public.advertising_impressions
  (COALESCE(campaign_id, '00000000-0000-0000-0000-000000000000'::uuid),
   COALESCE(social_profile_id, '00000000-0000-0000-0000-000000000000'::uuid), visitor_id, placement, bucket);
CREATE INDEX IF NOT EXISTS idx_ad_impr_campaign ON public.advertising_impressions (campaign_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_ad_impr_vendor ON public.advertising_impressions (vendor_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_ad_impr_visitor ON public.advertising_impressions (visitor_id, occurred_at);

CREATE TABLE IF NOT EXISTS public.advertising_clicks (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  campaign_id uuid REFERENCES public.vendor_advertising_campaigns(id) ON DELETE CASCADE,
  social_profile_id uuid REFERENCES public.vendor_social_profiles(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('banner_click', 'shop_visit', 'product_visit', 'social_click')),
  placement text NOT NULL CHECK (placement IN ('featured', 'sponsored_row', 'rotating', 'social_banner', 'shop_page', 'product_page')),
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  visitor_id text NOT NULL CHECK (visitor_id ~ '^[A-Za-z0-9_-]{8,64}$'),
  device text CHECK (device IS NULL OR device IN ('mobile', 'tablet', 'desktop')),
  bucket timestamptz NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ad_click_dedupe ON public.advertising_clicks
  (COALESCE(campaign_id, '00000000-0000-0000-0000-000000000000'::uuid),
   COALESCE(social_profile_id, '00000000-0000-0000-0000-000000000000'::uuid),
   COALESCE(product_id, '00000000-0000-0000-0000-000000000000'::uuid), visitor_id, event_type, placement, bucket);
CREATE INDEX IF NOT EXISTS idx_ad_click_campaign ON public.advertising_clicks (campaign_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_ad_click_vendor ON public.advertising_clicks (vendor_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_ad_click_visitor ON public.advertising_clicks (visitor_id, occurred_at);

-- ---------------------------------------------------------------- external ad requests
CREATE TABLE IF NOT EXISTS public.external_ad_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('google_ads', 'facebook_ads', 'instagram_ads', 'tiktok_ads')),
  scope text NOT NULL CHECK (scope IN ('shop', 'products')),
  product_ids uuid[] NOT NULL DEFAULT '{}',
  objective text NOT NULL CHECK (objective IN ('traffic', 'awareness', 'sales')),
  -- The vendor's own ad spend. It is never charged through the ITHUBAFRICA membership payment.
  budget_amount numeric(14,2) CHECK (budget_amount IS NULL OR (budget_amount >= 0 AND budget_amount <= 10000000)),
  budget_currency text NOT NULL DEFAULT 'NGN' CHECK (budget_currency = 'NGN'),
  duration_days integer NOT NULL CHECK (duration_days BETWEEN 1 AND 90),
  spend_authorized boolean NOT NULL DEFAULT false,
  spend_authorized_at timestamptz,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN
    ('draft', 'pending_integration', 'pending_authorization', 'pending_review', 'active', 'paused', 'rejected', 'ended', 'failed', 'cancelled')),
  status_detail text CHECK (status_detail IS NULL OR char_length(status_detail) <= 500),
  external_campaign_id text,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_external_ads_vendor ON public.external_ad_campaigns (vendor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_external_ads_status ON public.external_ad_campaigns (status, created_at DESC);

-- ---------------------------------------------------------------- updated_at triggers
DO $$
DECLARE _t text;
BEGIN
  FOREACH _t IN ARRAY ARRAY['advertising_settings', 'advertising_plan_features', 'vendor_advertising_campaigns',
                            'vendor_social_profiles', 'external_ad_campaigns'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s_updated ON public.%1$s', _t);
    EXECUTE format('CREATE TRIGGER trg_%1$s_updated BEFORE UPDATE ON public.%1$s FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()', _t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------- row level security
ALTER TABLE public.advertising_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advertising_plan_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_advertising_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_advertising_banners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_advertising_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_social_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advertising_generation_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advertising_impressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advertising_clicks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_ad_campaigns ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.advertising_settings, public.advertising_plan_features, public.vendor_advertising_campaigns,
  public.vendor_advertising_banners, public.vendor_advertising_products, public.vendor_social_profiles,
  public.advertising_generation_jobs, public.advertising_impressions, public.advertising_clicks,
  public.external_ad_campaigns FROM PUBLIC, anon, authenticated;

-- Plan benefits are shown to every signed-in vendor (they are the "what do I get" table); only admins change them.
DROP POLICY IF EXISTS "Read ad plan features" ON public.advertising_plan_features;
CREATE POLICY "Read ad plan features" ON public.advertising_plan_features FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Admins manage ad plan features" ON public.advertising_plan_features;
CREATE POLICY "Admins manage ad plan features" ON public.advertising_plan_features FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
GRANT SELECT ON public.advertising_plan_features TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.advertising_plan_features TO authenticated;

DROP POLICY IF EXISTS "Admins manage ad settings" ON public.advertising_settings;
CREATE POLICY "Admins manage ad settings" ON public.advertising_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
GRANT SELECT, INSERT, UPDATE ON public.advertising_settings TO authenticated;

-- Vendors can READ their own rows; they can never insert, update or delete (all changes go through functions).
DO $$
DECLARE _t text;
BEGIN
  FOREACH _t IN ARRAY ARRAY['vendor_advertising_campaigns', 'vendor_advertising_banners', 'vendor_advertising_products',
                            'vendor_social_profiles', 'advertising_generation_jobs', 'external_ad_campaigns'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Vendors read own" ON public.%I', _t);
    EXECUTE format($p$CREATE POLICY "Vendors read own" ON public.%I FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = vendor_id AND v.user_id = auth.uid()))$p$, _t);
    EXECUTE format('DROP POLICY IF EXISTS "Admins manage" ON public.%I', _t);
    EXECUTE format($p$CREATE POLICY "Admins manage" ON public.%I FOR ALL TO authenticated
      USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'))$p$, _t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', _t);
  END LOOP;
END $$;
GRANT INSERT, UPDATE, DELETE ON public.vendor_advertising_campaigns, public.vendor_advertising_banners,
  public.vendor_advertising_products, public.vendor_social_profiles, public.advertising_generation_jobs,
  public.external_ad_campaigns TO authenticated;  -- reachable only through the admin policy above

-- Events: written only by record_ad_event(); admins and the owning vendor may read.
DO $$
DECLARE _t text;
BEGIN
  FOREACH _t IN ARRAY ARRAY['advertising_impressions', 'advertising_clicks'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Vendors read own events" ON public.%I', _t);
    EXECUTE format($p$CREATE POLICY "Vendors read own events" ON public.%I FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = vendor_id AND v.user_id = auth.uid()))$p$, _t);
    EXECUTE format('DROP POLICY IF EXISTS "Admins read events" ON public.%I', _t);
    EXECUTE format($p$CREATE POLICY "Admins read events" ON public.%I FOR SELECT TO authenticated
      USING (public.has_role(auth.uid(), 'admin'))$p$, _t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', _t);
  END LOOP;
END $$;

-- =====================================================================
-- FUNCTIONS: helpers
-- =====================================================================
CREATE OR REPLACE FUNCTION public.ad_is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'admin');
$$;

CREATE OR REPLACE FUNCTION public.ad_require_admin() RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.ad_is_admin() THEN RAISE EXCEPTION 'Admin access required.'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.ad_require_vendor() RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to continue.'; END IF;
  SELECT id INTO _id FROM public.vendors WHERE user_id = auth.uid() AND is_approved = true LIMIT 1;
  IF _id IS NULL THEN RAISE EXCEPTION 'Only approved suppliers can use advertising.'; END IF;
  RETURN _id;
END $$;

-- Notifications must never be able to break a payment or an admin action.
CREATE OR REPLACE FUNCTION public.ad_notify_vendor(_vendor_id uuid, _message text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.notify_user((SELECT user_id FROM public.vendors WHERE id = _vendor_id), 'account', _message,
                             '/supplier-dashboard?tab=advertising', _vendor_id, NULL);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'ad_notify_vendor failed: %', SQLERRM;
END $$;

CREATE OR REPLACE FUNCTION public.ad_notify_admins(_message text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _a uuid;
BEGIN
  FOR _a IN SELECT user_id FROM public.user_roles WHERE role = 'admin' LOOP
    PERFORM public.notify_user(_a, 'account', _message, '/admin?tab=advertising', NULL, NULL);
  END LOOP;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'ad_notify_admins failed: %', SQLERRM;
END $$;

-- Promotional text rules. The generator and the vendor message form both use these: no digits (so no prices,
-- percentages or counts), no currency or % symbols, no links or @handles, and none of the claim words that would
-- amount to an invented discount, guarantee, certification or stock statement.
CREATE OR REPLACE FUNCTION public.ad_copy_is_safe(_t text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT _t IS NOT NULL
    AND char_length(btrim(_t)) > 0
    AND _t !~ '[<>0-9%₦$€£#]'
    AND _t !~* '(https?:|www\.|@)'
    AND _t !~* '\m(free|guarantee|guaranteed|guarantees|warranty|certified|certification|authentic|genuine|official|cheapest|cheap|discount|discounts|sale|clearance|stock|bargain|giveaway)\M'
    AND _t !~* '(lowest price|best price|price drop|money back|limited time|while stocks)';
$$;

-- Validates and canonicalises a social profile link. Mirrors src/lib/ads/socialValidation.ts.
CREATE OR REPLACE FUNCTION public.ad_normalize_social(_platform text, _url text, _handle text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  _u text := btrim(coalesce(_url, ''));
  _host text; _path text; _trim text; _seg text; _h text; _canon text;
  _given text := lower(regexp_replace(btrim(coalesce(_handle, '')), '^@', ''));
BEGIN
  IF _u !~* '^https://[^/?#@[:space:]:]+(/[^?#[:space:]]*)?([?#].*)?$' THEN
    RAISE EXCEPTION 'Profile link must start with https:// and must not contain a username, password or port.';
  END IF;
  _host := lower(substring(_u FROM '^https://([^/?#]+)'));
  _path := coalesce(substring(_u FROM '^https://[^/?#]+(/[^?#]*)'), '');
  _trim := btrim(_path, '/');
  IF _trim = '' THEN RAISE EXCEPTION 'The link must point to a profile, not the home page.'; END IF;
  IF position('/' IN _trim) > 0 THEN RAISE EXCEPTION 'The link must go to the profile itself (no extra path).'; END IF;
  _seg := _trim;

  IF _platform = 'instagram' THEN
    IF _host NOT IN ('instagram.com', 'www.instagram.com') THEN RAISE EXCEPTION 'That is not an Instagram link.'; END IF;
    IF _seg !~ '^[A-Za-z0-9._]{1,30}$' THEN RAISE EXCEPTION 'That does not look like an Instagram profile.'; END IF;
    IF lower(_seg) IN ('p', 'reel', 'reels', 'explore', 'accounts', 'stories', 'direct', 'tv', 'about', 'developer', 'legal') THEN
      RAISE EXCEPTION 'That does not look like an Instagram profile.'; END IF;
    _h := _seg; _canon := 'https://www.instagram.com/' || _seg || '/';
  ELSIF _platform = 'facebook' THEN
    IF _host NOT IN ('facebook.com', 'www.facebook.com', 'm.facebook.com', 'web.facebook.com') THEN
      RAISE EXCEPTION 'That is not a Facebook link.'; END IF;
    IF _seg !~ '^[A-Za-z0-9.]{5,50}$' THEN RAISE EXCEPTION 'That does not look like a Facebook page.'; END IF;
    IF lower(_seg) IN ('profile.php', 'sharer', 'sharer.php', 'share', 'groups', 'watch', 'marketplace', 'pages', 'people',
                       'events', 'login', 'dialog', 'plugins', 'tr', 'l.php', 'policy', 'help', 'gaming', 'stories', 'reel') THEN
      RAISE EXCEPTION 'That does not look like a Facebook page.'; END IF;
    _h := _seg; _canon := 'https://www.facebook.com/' || _seg;
  ELSIF _platform = 'tiktok' THEN
    IF _host NOT IN ('tiktok.com', 'www.tiktok.com') THEN RAISE EXCEPTION 'That is not a TikTok link.'; END IF;
    IF _seg !~ '^@[A-Za-z0-9._]{2,24}$' THEN RAISE EXCEPTION 'TikTok profile links look like tiktok.com/@yourname.'; END IF;
    _h := substr(_seg, 2); _canon := 'https://www.tiktok.com/@' || _h;
  ELSE
    RAISE EXCEPTION 'Unsupported platform.';
  END IF;

  IF _given <> '' AND _given <> lower(_h) THEN RAISE EXCEPTION 'The handle does not match the profile link.'; END IF;
  RETURN jsonb_build_object('url', _canon, 'handle', _h);
END $$;

-- =====================================================================
-- ENTITLEMENT (what a vendor's CURRENT plan allows). Derived at read time, so an expired plan loses benefits
-- immediately without waiting for any scheduled job.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.ad_entitlement(_vendor_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _m public.vendor_memberships%ROWTYPE;
  _f public.advertising_plan_features%ROWTYPE;
  _plan text; _has_m boolean; _has_f boolean; _active boolean; _used integer; _since timestamptz;
  _days integer; _renewal text;
BEGIN
  SELECT * INTO _m FROM public.vendor_memberships WHERE vendor_id = _vendor_id;
  _has_m := FOUND;
  _plan := public.effective_supplier_plan(_vendor_id);
  SELECT * INTO _f FROM public.advertising_plan_features WHERE plan_slug = _plan;
  _has_f := FOUND;
  _active := _has_m AND _has_f AND _plan <> 'free' AND _m.status = 'active'
             AND (_m.expires_at IS NULL OR _m.expires_at > now());
  _since := CASE WHEN _has_m THEN _m.period_started_at ELSE now() END;
  SELECT count(*)::integer INTO _used FROM public.advertising_generation_jobs j
   WHERE j.vendor_id = _vendor_id AND j.counts_toward_quota AND j.status IN ('queued', 'running', 'succeeded')
     AND j.created_at >= _since;
  IF NOT _has_m OR _m.expires_at IS NULL THEN _renewal := 'none';
  ELSIF _m.expires_at <= now() THEN _renewal := 'expired';
  ELSIF _m.expires_at <= now() + interval '7 days' THEN _renewal := 'expiring_soon';
  ELSE _renewal := 'active'; END IF;
  RETURN jsonb_build_object(
    'plan_slug', _plan,
    'active', _active,
    'expires_at', CASE WHEN _has_m THEN _m.expires_at END,
    'period_started_at', CASE WHEN _has_m THEN _m.period_started_at END,
    'renewal_status', _renewal,
    'features', CASE WHEN _has_f THEN to_jsonb(_f) ELSE '{}'::jsonb END,
    'generations_used', _used,
    'generations_allowed', CASE WHEN _has_f THEN _f.banner_generations_allowed ELSE 0 END
  );
END $$;

CREATE OR REPLACE FUNCTION public.ad_placements_for(_features jsonb) RETURNS text[]
LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY['rotating']::text[]
      || CASE WHEN coalesce((_features ->> 'featured_banner_enabled')::boolean, false) THEN ARRAY['featured']::text[] ELSE '{}'::text[] END
      || CASE WHEN coalesce((_features ->> 'sponsored_placement_enabled')::boolean, false) THEN ARRAY['sponsored_row']::text[] ELSE '{}'::text[] END;
$$;

-- Queue a generation job. The partial unique index stops two open jobs per campaign; the key stops repeats.
CREATE OR REPLACE FUNCTION public.ad_enqueue_job(_campaign uuid, _vendor uuid, _kind text, _counts boolean, _key text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid; _max smallint;
BEGIN
  SELECT ai_max_attempts INTO _max FROM public.advertising_settings WHERE id;
  INSERT INTO public.advertising_generation_jobs (campaign_id, vendor_id, kind, counts_toward_quota, max_attempts, idempotency_key)
  VALUES (_campaign, _vendor, _kind, _counts, coalesce(_max, 3), _key)
  ON CONFLICT DO NOTHING
  RETURNING id INTO _id;
  RETURN _id;   -- NULL when an identical or open job already exists
END $$;

-- =====================================================================
-- AUTOMATIC CAMPAIGN CREATION ON PAYMENT
-- Runs from a trigger on vendor_memberships, i.e. inside the transaction in which trusted server code
-- finalised a verified Paystack payment. A frontend "payment succeeded" message can never reach this.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.ensure_ad_campaign_for_vendor(_vendor_id uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _e jsonb; _f jsonb; _s public.advertising_settings%ROWTYPE; _last public.vendor_advertising_campaigns%ROWTYPE;
  _exp timestamptz; _end timestamptz; _sub uuid; _new uuid; _placements text[]; _reuse boolean;
BEGIN
  SELECT * INTO _s FROM public.advertising_settings WHERE id;
  IF NOT _s.ads_enabled THEN RETURN NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.vendors WHERE id = _vendor_id AND is_approved) THEN RETURN NULL; END IF;

  _e := public.ad_entitlement(_vendor_id);
  _f := _e -> 'features';
  IF NOT (_e ->> 'active')::boolean OR NOT coalesce((_f ->> 'homepage_promotion_enabled')::boolean, false) THEN
    RETURN NULL;   -- plan has no homepage promotion: nothing to activate
  END IF;

  _exp := (_e ->> 'expires_at')::timestamptz;
  _end := now() + make_interval(days => (_f ->> 'campaign_duration_days')::integer);
  IF _exp IS NOT NULL AND _exp < _end THEN _end := _exp; END IF;
  _placements := public.ad_placements_for(_f);
  SELECT id INTO _sub FROM public.supplier_membership_payments
   WHERE vendor_id = _vendor_id AND status = 'success' ORDER BY paid_at DESC NULLS LAST, created_at DESC LIMIT 1;

  SELECT * INTO _last FROM public.vendor_advertising_campaigns
   WHERE vendor_id = _vendor_id AND campaign_type = 'shop_promotion' ORDER BY created_at DESC LIMIT 1 FOR UPDATE;

  -- Renewal / upgrade while a campaign is still open: extend it and refresh its placements. No new banner needed.
  IF FOUND AND _last.status IN ('pending_generation', 'generating', 'pending_review', 'active', 'paused') THEN
    UPDATE public.vendor_advertising_campaigns
       SET end_date = greatest(end_date, _end), placements = _placements,
           subscription_id = coalesce(_sub, subscription_id)
     WHERE id = _last.id;
    RETURN _last.id;
  END IF;

  -- Campaign ended earlier: start a fresh one. If it ended NATURALLY (expired) and its banner was approved, that banner
  -- is reused so renewing costs no new AI generation. A rejected/cancelled/failed campaign never reuses its banner.
  _reuse := FOUND AND _last.status = 'expired' AND _last.banner_image_url IS NOT NULL AND _last.banner_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.vendor_advertising_banners b WHERE b.id = _last.banner_id AND b.moderation_status = 'approved');
  INSERT INTO public.vendor_advertising_campaigns
    (vendor_id, campaign_type, subscription_id, status, start_date, end_date, placements, target_shop_id,
     destination_url, banner_id, banner_image_url, banner_public_id, headline, description,
     custom_headline, custom_description)
  VALUES
    (_vendor_id, 'shop_promotion', _sub, CASE WHEN _reuse THEN 'active' ELSE 'pending_generation' END, now(), _end, _placements,
     _vendor_id, '/shop/' || _vendor_id::text,
     CASE WHEN _reuse THEN _last.banner_id END, CASE WHEN _reuse THEN _last.banner_image_url END,
     CASE WHEN _reuse THEN _last.banner_public_id END, CASE WHEN _reuse THEN _last.headline END,
     CASE WHEN _reuse THEN _last.description END,
     CASE WHEN _reuse THEN _last.custom_headline END, CASE WHEN _reuse THEN _last.custom_description END)
  RETURNING id INTO _new;

  IF NOT _reuse THEN
    PERFORM public.ad_enqueue_job(_new, _vendor_id, 'initial', true, 'initial:' || _new::text);
  END IF;
  RETURN _new;
END $$;

CREATE OR REPLACE FUNCTION public.trg_membership_grants_ads() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- A fault in the advertising code must never roll back a customer's payment.
  BEGIN
    PERFORM public.ensure_ad_campaign_for_vendor(NEW.vendor_id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'ensure_ad_campaign_for_vendor failed for %: %', NEW.vendor_id, SQLERRM;
  END;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_membership_grants_ads ON public.vendor_memberships;
CREATE TRIGGER trg_membership_grants_ads
  AFTER INSERT OR UPDATE OF plan_slug, expires_at, status ON public.vendor_memberships
  FOR EACH ROW EXECUTE FUNCTION public.trg_membership_grants_ads();

-- =====================================================================
-- DEFENCE IN DEPTH: product limits are enforced by a trigger as well as by the vendor functions.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.trg_ad_products_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _c public.vendor_advertising_campaigns%ROWTYPE; _max integer; _n integer;
BEGIN
  SELECT * INTO _c FROM public.vendor_advertising_campaigns WHERE id = NEW.campaign_id;
  IF NOT FOUND OR _c.vendor_id <> NEW.vendor_id THEN RAISE EXCEPTION 'Campaign does not belong to this vendor.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.products p WHERE p.id = NEW.product_id AND p.vendor_id = NEW.vendor_id AND p.is_active) THEN
    RAISE EXCEPTION 'You can only advertise your own active products.'; END IF;
  _max := coalesce(((public.ad_entitlement(NEW.vendor_id)) -> 'features' ->> 'max_advertised_products')::integer, 0);
  SELECT count(*) INTO _n FROM public.vendor_advertising_products WHERE campaign_id = NEW.campaign_id;
  IF _n + 1 > _max THEN RAISE EXCEPTION 'Your plan allows up to % advertised products.', _max; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_ad_products_guard ON public.vendor_advertising_products;
CREATE TRIGGER trg_ad_products_guard BEFORE INSERT ON public.vendor_advertising_products
  FOR EACH ROW EXECUTE FUNCTION public.trg_ad_products_guard();

-- =====================================================================
-- EXPIRY. Public reads already ignore expired/unentitled campaigns; this sweeper makes the stored status
-- match and cancels pointless jobs. History is kept: rows are marked, never deleted.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.expire_advertising_campaigns() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _n integer;
BEGIN
  WITH ended AS (
    UPDATE public.vendor_advertising_campaigns c SET status = 'expired'
     WHERE c.status IN ('pending_generation', 'generating', 'pending_review', 'active', 'paused')
       AND (c.end_date <= now() OR NOT EXISTS (
             SELECT 1 FROM public.vendor_memberships m
               JOIN public.advertising_plan_features f ON f.plan_slug = m.plan_slug
              WHERE m.vendor_id = c.vendor_id AND m.status = 'active'
                AND (m.expires_at IS NULL OR m.expires_at > now()) AND f.homepage_promotion_enabled))
    RETURNING c.id
  ), cancelled AS (
    UPDATE public.advertising_generation_jobs j
       SET status = 'cancelled', finished_at = now(), error = 'Campaign ended before the job ran.'
     WHERE j.status = 'queued' AND j.campaign_id IN (SELECT id FROM ended)
    RETURNING j.id
  )
  SELECT count(*) INTO _n FROM ended;
  RETURN _n;
END $$;

-- =====================================================================
-- JOB QUEUE (service role only; used by the ad-process-jobs edge function)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.claim_advertising_job(_worker text DEFAULT 'worker') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _s public.advertising_settings%ROWTYPE; _id uuid; _today integer; _month numeric; _j public.advertising_generation_jobs%ROWTYPE;
BEGIN
  SELECT * INTO _s FROM public.advertising_settings WHERE id;
  IF NOT _s.ads_enabled OR NOT _s.ai_generation_enabled THEN RETURN NULL; END IF;

  -- Recover jobs whose worker died (running for over 10 minutes).
  UPDATE public.advertising_generation_jobs SET status = 'queued', locked_at = NULL
   WHERE status = 'running' AND locked_at < now() - interval '10 minutes' AND attempts < max_attempts;
  UPDATE public.advertising_generation_jobs SET status = 'failed', finished_at = now(), error_code = 'stale',
         error = 'Worker stopped responding and retries were used up.'
   WHERE status = 'running' AND locked_at < now() - interval '10 minutes' AND attempts >= max_attempts;

  -- Admin-configured usage limits. Jobs simply wait (they are not failed) until the window resets or limits are raised.
  SELECT count(*) INTO _today FROM public.advertising_generation_jobs WHERE last_attempt_at >= date_trunc('day', now());
  IF _today >= _s.ai_daily_limit THEN RETURN NULL; END IF;
  SELECT coalesce(sum(estimated_cost_usd), 0) INTO _month FROM public.advertising_generation_jobs
   WHERE last_attempt_at >= date_trunc('month', now());
  IF _month >= _s.ai_monthly_budget_usd THEN RETURN NULL; END IF;

  SELECT id INTO _id FROM public.advertising_generation_jobs
   WHERE status = 'queued' AND run_after <= now() ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED;
  IF _id IS NULL THEN RETURN NULL; END IF;

  UPDATE public.advertising_generation_jobs
     SET status = 'running', attempts = attempts + 1, locked_at = now(), last_attempt_at = now(),
         started_at = coalesce(started_at, now())
   WHERE id = _id RETURNING * INTO _j;
  UPDATE public.vendor_advertising_campaigns SET status = 'generating'
   WHERE id = _j.campaign_id AND status IN ('pending_generation', 'failed');
  RETURN to_jsonb(_j) || jsonb_build_object('worker', _worker);
END $$;

CREATE OR REPLACE FUNCTION public.finish_advertising_job_success(
  _job uuid, _image_url text, _public_id text, _width integer, _height integer,
  _headline text, _description text, _art_category text, _provider text, _model text, _prompt_hash text,
  _meta jsonb, _cost numeric, _flags text[]
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _j public.advertising_generation_jobs%ROWTYPE; _c public.vendor_advertising_campaigns%ROWTYPE;
  _s public.advertising_settings%ROWTYPE; _ver integer; _bid uuid; _auto boolean;
BEGIN
  SELECT * INTO _j FROM public.advertising_generation_jobs WHERE id = _job FOR UPDATE;
  IF NOT FOUND OR _j.status <> 'running' THEN RAISE EXCEPTION 'Job is not running.'; END IF;
  SELECT * INTO _c FROM public.vendor_advertising_campaigns WHERE id = _j.campaign_id FOR UPDATE;
  SELECT * INTO _s FROM public.advertising_settings WHERE id;
  _auto := NOT _s.require_approval;

  SELECT coalesce(max(version), 0) + 1 INTO _ver FROM public.vendor_advertising_banners WHERE campaign_id = _c.id;
  INSERT INTO public.vendor_advertising_banners
    (campaign_id, vendor_id, version, status, image_url, public_id, width, height, headline, description, art_category,
     ai_provider, ai_model, prompt_hash, generation_metadata, moderation_status, moderation_flags)
  VALUES (_c.id, _c.vendor_id, _ver, 'ready', _image_url, _public_id, _width, _height, _headline, _description, _art_category,
          _provider, _model, _prompt_hash, coalesce(_meta, '{}'::jsonb), CASE WHEN _auto THEN 'approved' ELSE 'pending' END,
          coalesce(_flags, '{}'))
  RETURNING id INTO _bid;

  UPDATE public.advertising_generation_jobs
     SET status = 'succeeded', finished_at = now(), locked_at = NULL, error = NULL, error_code = NULL,
         estimated_cost_usd = estimated_cost_usd + coalesce(_cost, 0)
   WHERE id = _job;

  IF _c.status IN ('expired', 'cancelled', 'rejected') THEN
    RETURN _bid;   -- campaign ended while generating; keep the banner for history only
  END IF;

  IF _auto THEN
    PERFORM public.ad_apply_banner(_c.id, _bid);
  ELSIF _c.banner_id IS NULL THEN
    UPDATE public.vendor_advertising_campaigns SET status = 'pending_review' WHERE id = _c.id AND status <> 'paused';
    PERFORM public.ad_notify_admins('A new advertising banner is waiting for review.');
  ELSE
    PERFORM public.ad_notify_admins('A regenerated advertising banner is waiting for review.');
  END IF;
  RETURN _bid;
END $$;

-- Makes a banner the live one for its campaign and (re)computes the visible copy.
CREATE OR REPLACE FUNCTION public.ad_apply_banner(_campaign uuid, _banner uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _b public.vendor_advertising_banners%ROWTYPE; _c public.vendor_advertising_campaigns%ROWTYPE;
BEGIN
  SELECT * INTO _b FROM public.vendor_advertising_banners WHERE id = _banner AND campaign_id = _campaign;
  IF NOT FOUND THEN RAISE EXCEPTION 'Banner not found for this campaign.'; END IF;
  SELECT * INTO _c FROM public.vendor_advertising_campaigns WHERE id = _campaign FOR UPDATE;
  UPDATE public.vendor_advertising_banners SET status = 'superseded' WHERE campaign_id = _campaign AND id <> _banner AND status = 'ready';
  UPDATE public.vendor_advertising_banners SET moderation_status = 'approved', status = 'ready' WHERE id = _banner;
  UPDATE public.vendor_advertising_campaigns
     SET banner_id = _b.id, banner_image_url = _b.image_url, banner_public_id = _b.public_id,
         headline = coalesce(custom_headline, _b.headline), description = coalesce(custom_description, _b.description),
         status = CASE WHEN status IN ('pending_generation', 'generating', 'pending_review', 'failed') THEN 'active' ELSE status END
   WHERE id = _campaign;
  IF _c.status IN ('pending_generation', 'generating', 'pending_review', 'failed') THEN
    PERFORM public.ad_notify_vendor(_c.vendor_id, 'Your homepage advertising banner is now live.');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.finish_advertising_job_failure(
  _job uuid, _error text, _code text, _retryable boolean, _cost numeric DEFAULT 0
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _j public.advertising_generation_jobs%ROWTYPE; _final boolean;
BEGIN
  SELECT * INTO _j FROM public.advertising_generation_jobs WHERE id = _job FOR UPDATE;
  IF NOT FOUND THEN RETURN 'missing'; END IF;
  _final := NOT coalesce(_retryable, true) OR _j.attempts >= _j.max_attempts;
  IF _final THEN
    UPDATE public.advertising_generation_jobs
       SET status = 'failed', finished_at = now(), locked_at = NULL, error_code = left(_code, 60), error = left(_error, 1000),
           estimated_cost_usd = estimated_cost_usd + coalesce(_cost, 0)
     WHERE id = _job;
    UPDATE public.vendor_advertising_campaigns SET status = 'failed'
     WHERE id = _j.campaign_id AND banner_id IS NULL AND status IN ('pending_generation', 'generating');
    PERFORM public.ad_notify_admins('A banner generation job failed: ' || left(coalesce(_code, 'error'), 60));
    PERFORM public.ad_notify_vendor(_j.vendor_id, 'We could not generate your advertising banner. Our team has been alerted.');
    RETURN 'failed';
  END IF;
  UPDATE public.advertising_generation_jobs
     SET status = 'queued', locked_at = NULL, error_code = left(_code, 60), error = left(_error, 1000),
         run_after = now() + make_interval(mins => power(2, attempts)::integer),
         estimated_cost_usd = estimated_cost_usd + coalesce(_cost, 0)
   WHERE id = _job;
  RETURN 'retry';
END $$;

-- =====================================================================
-- VENDOR FUNCTIONS. Every check (ownership, plan, limits, quota, input) happens here, on the server.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.ad_apply_copy(_campaign uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.vendor_advertising_campaigns c
     SET headline = coalesce(c.custom_headline, b.headline), description = coalesce(c.custom_description, b.description)
    FROM public.vendor_advertising_banners b
   WHERE c.id = _campaign AND b.id = c.banner_id;
$$;

CREATE OR REPLACE FUNCTION public.my_advertising_overview() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _v uuid := public.ad_require_vendor(); _s public.advertising_settings%ROWTYPE;
BEGIN
  SELECT * INTO _s FROM public.advertising_settings WHERE id;
  RETURN jsonb_build_object(
    'vendor_id', _v,
    'entitlement', public.ad_entitlement(_v),
    'settings', jsonb_build_object('ads_enabled', _s.ads_enabled, 'require_approval', _s.require_approval,
                                   'regen_cooldown_minutes', _s.regen_cooldown_minutes),
    'campaigns', coalesce((SELECT jsonb_agg(to_jsonb(c) - 'admin_note' ORDER BY c.created_at DESC)
                             FROM (SELECT * FROM public.vendor_advertising_campaigns WHERE vendor_id = _v
                                    ORDER BY created_at DESC LIMIT 20) c), '[]'::jsonb),
    'campaign_products', coalesce((SELECT jsonb_agg(jsonb_build_object('campaign_id', ap.campaign_id, 'product_id', ap.product_id,
                                    'name', p.name, 'thumb_url', coalesce(p.thumb_url, p.image_url)) ORDER BY ap.position)
                             FROM public.vendor_advertising_products ap JOIN public.products p ON p.id = ap.product_id
                            WHERE ap.vendor_id = _v), '[]'::jsonb),
    'banners', coalesce((SELECT jsonb_agg(jsonb_build_object('id', b.id, 'campaign_id', b.campaign_id, 'version', b.version,
                                    'image_url', b.image_url, 'headline', b.headline, 'description', b.description,
                                    'moderation_status', b.moderation_status, 'created_at', b.created_at) ORDER BY b.created_at DESC)
                             FROM (SELECT * FROM public.vendor_advertising_banners WHERE vendor_id = _v
                                    ORDER BY created_at DESC LIMIT 10) b), '[]'::jsonb),
    'jobs', coalesce((SELECT jsonb_agg(jsonb_build_object('id', j.id, 'campaign_id', j.campaign_id, 'kind', j.kind,
                                    'status', j.status, 'attempts', j.attempts, 'error_code', j.error_code, 'created_at', j.created_at)
                                    ORDER BY j.created_at DESC)
                             FROM (SELECT * FROM public.advertising_generation_jobs WHERE vendor_id = _v
                                    ORDER BY created_at DESC LIMIT 6) j), '[]'::jsonb),
    'social_profiles', coalesce((SELECT jsonb_agg(to_jsonb(sp) ORDER BY sp.platform)
                             FROM public.vendor_social_profiles sp WHERE sp.vendor_id = _v), '[]'::jsonb),
    'external_campaigns', coalesce((SELECT jsonb_agg(to_jsonb(e) - 'external_campaign_id' ORDER BY e.created_at DESC)
                             FROM (SELECT * FROM public.external_ad_campaigns WHERE vendor_id = _v
                                    ORDER BY created_at DESC LIMIT 20) e), '[]'::jsonb)
  );
END $$;

CREATE OR REPLACE FUNCTION public.vendor_set_campaign_products(_campaign uuid, _product_ids uuid[]) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _v uuid := public.ad_require_vendor(); _c public.vendor_advertising_campaigns%ROWTYPE; _e jsonb; _max integer; _ids uuid[];
BEGIN
  SELECT * INTO _c FROM public.vendor_advertising_campaigns WHERE id = _campaign AND vendor_id = _v FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Campaign not found.'; END IF;
  IF _c.status IN ('expired', 'cancelled', 'rejected') THEN RAISE EXCEPTION 'This campaign has ended.'; END IF;
  _e := public.ad_entitlement(_v);
  IF NOT (_e ->> 'active')::boolean THEN RAISE EXCEPTION 'Your advertising plan is not active.'; END IF;
  _max := (_e -> 'features' ->> 'max_advertised_products')::integer;
  _ids := ARRAY(SELECT DISTINCT x FROM unnest(coalesce(_product_ids, '{}'::uuid[])) AS x);
  IF cardinality(_ids) > _max THEN RAISE EXCEPTION 'Your plan allows up to % advertised products.', _max; END IF;
  IF _c.campaign_type = 'product_promotion' AND cardinality(_ids) = 0 THEN RAISE EXCEPTION 'Select at least one product.'; END IF;
  IF (SELECT count(*) FROM public.products WHERE id = ANY (_ids) AND vendor_id = _v AND is_active) <> cardinality(_ids) THEN
    RAISE EXCEPTION 'You can only advertise your own active products.'; END IF;
  DELETE FROM public.vendor_advertising_products WHERE campaign_id = _campaign;
  INSERT INTO public.vendor_advertising_products (campaign_id, vendor_id, product_id, position)
    SELECT _campaign, _v, t.id, t.ord::smallint FROM unnest(_ids) WITH ORDINALITY AS t(id, ord);
  UPDATE public.vendor_advertising_campaigns SET target_product_ids = _ids WHERE id = _campaign;
  RETURN cardinality(_ids);
END $$;

CREATE OR REPLACE FUNCTION public.vendor_create_product_campaign(_product_ids uuid[]) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _v uuid := public.ad_require_vendor(); _e jsonb; _f jsonb; _max integer; _ids uuid[]; _id uuid; _end timestamptz; _exp timestamptz; _sub uuid;
BEGIN
  IF NOT (SELECT ads_enabled FROM public.advertising_settings WHERE id) THEN RAISE EXCEPTION 'Advertising is temporarily unavailable.'; END IF;
  _e := public.ad_entitlement(_v); _f := _e -> 'features';
  IF NOT (_e ->> 'active')::boolean OR NOT coalesce((_f ->> 'homepage_promotion_enabled')::boolean, false) THEN
    RAISE EXCEPTION 'Your plan does not include homepage promotion.'; END IF;
  IF (_e ->> 'generations_used')::integer >= (_e ->> 'generations_allowed')::integer THEN
    RAISE EXCEPTION 'You have used all banner generations included in your plan.'; END IF;
  _max := (_f ->> 'max_advertised_products')::integer;
  _ids := ARRAY(SELECT DISTINCT x FROM unnest(coalesce(_product_ids, '{}'::uuid[])) AS x);
  IF cardinality(_ids) = 0 THEN RAISE EXCEPTION 'Select at least one product.'; END IF;
  IF cardinality(_ids) > _max THEN RAISE EXCEPTION 'Your plan allows up to % advertised products.', _max; END IF;
  IF (SELECT count(*) FROM public.products WHERE id = ANY (_ids) AND vendor_id = _v AND is_active) <> cardinality(_ids) THEN
    RAISE EXCEPTION 'You can only advertise your own active products.'; END IF;
  _exp := (_e ->> 'expires_at')::timestamptz;
  _end := now() + make_interval(days => (_f ->> 'campaign_duration_days')::integer);
  IF _exp IS NOT NULL AND _exp < _end THEN _end := _exp; END IF;
  SELECT id INTO _sub FROM public.supplier_membership_payments WHERE vendor_id = _v AND status = 'success'
   ORDER BY paid_at DESC NULLS LAST LIMIT 1;
  BEGIN
    INSERT INTO public.vendor_advertising_campaigns
      (vendor_id, campaign_type, subscription_id, status, start_date, end_date, placements, target_shop_id, destination_url, target_product_ids)
    VALUES (_v, 'product_promotion', _sub, 'pending_generation', now(), _end, public.ad_placements_for(_f), _v, '/shop/' || _v::text, _ids)
    RETURNING id INTO _id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'You already have an open product promotion. Edit it or wait for it to end.';
  END;
  INSERT INTO public.vendor_advertising_products (campaign_id, vendor_id, product_id, position)
    SELECT _id, _v, t.id, t.ord::smallint FROM unnest(_ids) WITH ORDINALITY AS t(id, ord);
  PERFORM public.ad_enqueue_job(_id, _v, 'product', true, 'initial:' || _id::text);
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.vendor_update_campaign_message(_campaign uuid, _headline text, _description text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _v uuid := public.ad_require_vendor(); _c public.vendor_advertising_campaigns%ROWTYPE; _h text; _d text; _approval boolean;
BEGIN
  SELECT * INTO _c FROM public.vendor_advertising_campaigns WHERE id = _campaign AND vendor_id = _v FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Campaign not found.'; END IF;
  IF _c.status IN ('expired', 'cancelled', 'rejected') THEN RAISE EXCEPTION 'This campaign has ended.'; END IF;
  _h := nullif(btrim(coalesce(_headline, '')), '');
  _d := nullif(btrim(coalesce(_description, '')), '');
  IF _h IS NOT NULL AND (char_length(_h) NOT BETWEEN 3 AND 60 OR NOT public.ad_copy_is_safe(_h)) THEN
    RAISE EXCEPTION 'Headline must be 3-60 characters with no numbers, prices, links or claims like free, guaranteed, certified or discount.'; END IF;
  IF _d IS NOT NULL AND (char_length(_d) NOT BETWEEN 10 AND 160 OR NOT public.ad_copy_is_safe(_d)) THEN
    RAISE EXCEPTION 'Description must be 10-160 characters with no numbers, prices, links or claims like free, guaranteed, certified or discount.'; END IF;
  SELECT require_approval INTO _approval FROM public.advertising_settings WHERE id;
  -- Clearing both fields only returns to the AI copy that was already reviewed, so it never needs approval.
  IF _approval AND (_h IS NOT NULL OR _d IS NOT NULL) THEN
    UPDATE public.vendor_advertising_campaigns
       SET pending_headline = _h, pending_description = _d, message_review = 'pending' WHERE id = _campaign;
    PERFORM public.ad_notify_admins('A vendor changed their advertising message and it needs review.');
    RETURN 'pending_review';
  END IF;
  UPDATE public.vendor_advertising_campaigns
     SET custom_headline = _h, custom_description = _d, pending_headline = NULL, pending_description = NULL, message_review = NULL
   WHERE id = _campaign;
  PERFORM public.ad_apply_copy(_campaign);
  RETURN 'applied';
END $$;

CREATE OR REPLACE FUNCTION public.vendor_request_banner_regeneration(_campaign uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _v uuid := public.ad_require_vendor(); _c public.vendor_advertising_campaigns%ROWTYPE; _e jsonb; _s public.advertising_settings%ROWTYPE;
  _n integer; _jid uuid; _last timestamptz;
BEGIN
  SELECT * INTO _c FROM public.vendor_advertising_campaigns WHERE id = _campaign AND vendor_id = _v FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Campaign not found.'; END IF;
  IF _c.status NOT IN ('active', 'paused', 'pending_review', 'failed') THEN RAISE EXCEPTION 'This campaign cannot be regenerated right now.'; END IF;
  IF _c.end_date <= now() THEN RAISE EXCEPTION 'This campaign has ended.'; END IF;
  SELECT * INTO _s FROM public.advertising_settings WHERE id;
  IF NOT _s.ai_generation_enabled THEN RAISE EXCEPTION 'Banner generation is temporarily unavailable.'; END IF;
  _e := public.ad_entitlement(_v);
  IF NOT (_e ->> 'active')::boolean THEN RAISE EXCEPTION 'Your advertising plan is not active.'; END IF;
  IF (_e ->> 'generations_used')::integer >= (_e ->> 'generations_allowed')::integer THEN
    RAISE EXCEPTION 'You have used all banner generations included in your plan. Renew or upgrade for more.'; END IF;
  SELECT max(created_at) INTO _last FROM public.advertising_generation_jobs WHERE campaign_id = _campaign AND status <> 'cancelled';
  IF _last IS NOT NULL AND _last > now() - make_interval(mins => _s.regen_cooldown_minutes) THEN
    RAISE EXCEPTION 'Please wait % minutes between banner generations.', _s.regen_cooldown_minutes; END IF;
  SELECT count(*) INTO _n FROM public.advertising_generation_jobs WHERE campaign_id = _campaign;
  _jid := public.ad_enqueue_job(_campaign, _v, 'regenerate', true, 'regen:' || _campaign::text || ':' || (_n + 1)::text);
  IF _jid IS NULL THEN RAISE EXCEPTION 'A banner is already being generated for this campaign.'; END IF;
  UPDATE public.vendor_advertising_campaigns SET status = 'pending_generation' WHERE id = _campaign AND status = 'failed';
  RETURN jsonb_build_object('job_id', _jid,
    'generations_remaining', greatest(0, (_e ->> 'generations_allowed')::integer - (_e ->> 'generations_used')::integer - 1));
END $$;

CREATE OR REPLACE FUNCTION public.vendor_set_campaign_paused(_campaign uuid, _paused boolean) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _v uuid := public.ad_require_vendor(); _c public.vendor_advertising_campaigns%ROWTYPE;
BEGIN
  SELECT * INTO _c FROM public.vendor_advertising_campaigns WHERE id = _campaign AND vendor_id = _v FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Campaign not found.'; END IF;
  IF _paused THEN
    IF _c.status <> 'active' THEN RAISE EXCEPTION 'Only a live campaign can be paused.'; END IF;
    UPDATE public.vendor_advertising_campaigns SET status = 'paused', paused_by = 'vendor' WHERE id = _campaign;
    RETURN 'paused';
  END IF;
  IF _c.status <> 'paused' THEN RAISE EXCEPTION 'This campaign is not paused.'; END IF;
  IF _c.paused_by = 'admin' THEN RAISE EXCEPTION 'This campaign was paused by ITHUBAFRICA. Please contact support.'; END IF;
  IF _c.end_date <= now() OR _c.banner_id IS NULL THEN RAISE EXCEPTION 'This campaign cannot be resumed.'; END IF;
  IF NOT (public.ad_entitlement(_v) ->> 'active')::boolean THEN RAISE EXCEPTION 'Your advertising plan is not active.'; END IF;
  UPDATE public.vendor_advertising_campaigns SET status = 'active', paused_by = NULL WHERE id = _campaign;
  RETURN 'active';
END $$;

-- ---- social profile links (no passwords, no tokens)
CREATE OR REPLACE FUNCTION public.vendor_upsert_social_profile(_platform text, _url text, _handle text, _display_name text, _enabled boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _v uuid := public.ad_require_vendor(); _n jsonb; _name text := btrim(coalesce(_display_name, '')); _e jsonb; _max integer; _on integer; _row public.vendor_social_profiles%ROWTYPE;
BEGIN
  _n := public.ad_normalize_social(_platform, _url, _handle);
  IF char_length(_name) NOT BETWEEN 1 AND 60 OR _name ~ '[<>]' OR _name ~* '(https?:|www\.)' THEN
    RAISE EXCEPTION 'Display name must be 1-60 characters and cannot contain links.'; END IF;
  IF coalesce(_enabled, true) THEN
    _e := public.ad_entitlement(_v);
    IF (_e ->> 'active')::boolean AND coalesce((_e -> 'features' ->> 'social_banner_enabled')::boolean, false) THEN
      _max := (_e -> 'features' ->> 'max_social_profiles')::integer;
      SELECT count(*) INTO _on FROM public.vendor_social_profiles WHERE vendor_id = _v AND promo_enabled AND platform <> _platform;
      IF _on >= _max THEN RAISE EXCEPTION 'Your plan allows promoting up to % social profiles.', _max; END IF;
    END IF;
  END IF;
  INSERT INTO public.vendor_social_profiles (vendor_id, platform, profile_url, handle, display_name, promo_enabled)
  VALUES (_v, _platform, _n ->> 'url', _n ->> 'handle', _name, coalesce(_enabled, true))
  ON CONFLICT (vendor_id, platform) DO UPDATE
    SET profile_url = EXCLUDED.profile_url, handle = EXCLUDED.handle, display_name = EXCLUDED.display_name,
        promo_enabled = EXCLUDED.promo_enabled,
        verification_status = CASE WHEN public.vendor_social_profiles.profile_url <> EXCLUDED.profile_url
                                   THEN 'unverified' ELSE public.vendor_social_profiles.verification_status END
  RETURNING * INTO _row;
  RETURN to_jsonb(_row);
END $$;

CREATE OR REPLACE FUNCTION public.vendor_delete_social_profile(_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _v uuid := public.ad_require_vendor(); _n integer;
BEGIN
  DELETE FROM public.vendor_social_profiles WHERE id = _id AND vendor_id = _v;
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n > 0;
END $$;

-- ---- external advertising. This only RECORDS the vendor's request. No ad platform API is called anywhere in this
-- codebase yet, so a request is never shown as running: it stays "pending_integration" until a service-role
-- integration (not built) moves it forward. The vendor's own ad budget is never charged by ITHUBAFRICA.
CREATE OR REPLACE FUNCTION public.vendor_request_external_campaign(
  _platform text, _scope text, _product_ids uuid[], _objective text, _budget numeric, _duration_days integer, _authorize_spend boolean
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _v uuid := public.ad_require_vendor(); _e jsonb; _ids uuid[]; _max integer; _id uuid; _open integer;
BEGIN
  _e := public.ad_entitlement(_v);
  IF NOT (_e ->> 'active')::boolean OR NOT coalesce((_e -> 'features' ->> 'external_ads_enabled')::boolean, false) THEN
    RAISE EXCEPTION 'Your plan does not include external advertising.'; END IF;
  IF _platform NOT IN ('google_ads', 'facebook_ads', 'instagram_ads', 'tiktok_ads') THEN RAISE EXCEPTION 'Unsupported platform.'; END IF;
  IF _scope NOT IN ('shop', 'products') THEN RAISE EXCEPTION 'Choose shop or products.'; END IF;
  IF _objective NOT IN ('traffic', 'awareness', 'sales') THEN RAISE EXCEPTION 'Unsupported campaign type.'; END IF;
  IF _duration_days IS NULL OR _duration_days NOT BETWEEN 1 AND 90 THEN RAISE EXCEPTION 'Duration must be 1-90 days.'; END IF;
  IF _budget IS NOT NULL AND (_budget < 0 OR _budget > 10000000) THEN RAISE EXCEPTION 'Budget is out of range.'; END IF;
  IF coalesce(_authorize_spend, false) AND coalesce(_budget, 0) <= 0 THEN
    RAISE EXCEPTION 'Enter the budget you are authorising before submitting.'; END IF;
  IF _scope = 'products' THEN
    _ids := ARRAY(SELECT DISTINCT x FROM unnest(coalesce(_product_ids, '{}'::uuid[])) AS x);
    _max := (_e -> 'features' ->> 'max_advertised_products')::integer;
    IF cardinality(_ids) = 0 THEN RAISE EXCEPTION 'Select at least one product.'; END IF;
    IF cardinality(_ids) > _max THEN RAISE EXCEPTION 'Your plan allows up to % advertised products.', _max; END IF;
    IF (SELECT count(*) FROM public.products WHERE id = ANY (_ids) AND vendor_id = _v AND is_active) <> cardinality(_ids) THEN
      RAISE EXCEPTION 'You can only advertise your own active products.'; END IF;
  ELSE
    _ids := '{}';
  END IF;
  SELECT count(*) INTO _open FROM public.external_ad_campaigns
   WHERE vendor_id = _v AND status NOT IN ('rejected', 'ended', 'failed', 'cancelled');
  IF _open >= 10 THEN RAISE EXCEPTION 'You have too many open external campaigns. Cancel one first.'; END IF;
  INSERT INTO public.external_ad_campaigns
    (vendor_id, platform, scope, product_ids, objective, budget_amount, duration_days, spend_authorized, spend_authorized_at, status, status_detail)
  VALUES (_v, _platform, _scope, _ids, _objective, _budget, _duration_days, coalesce(_authorize_spend, false),
          CASE WHEN coalesce(_authorize_spend, false) THEN now() END,
          CASE WHEN coalesce(_authorize_spend, false) THEN 'pending_integration' ELSE 'draft' END,
          CASE WHEN coalesce(_authorize_spend, false)
               THEN 'Waiting for ITHUBAFRICA to connect this ad platform. Nothing is running and no money has been spent.'
               ELSE 'Draft. Authorise your budget to submit this request. Nothing is running and no money has been spent.' END)
  RETURNING id INTO _id;
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.vendor_cancel_external_campaign(_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _v uuid := public.ad_require_vendor(); _n integer;
BEGIN
  UPDATE public.external_ad_campaigns SET status = 'cancelled', status_detail = 'Cancelled by the vendor.'
   WHERE id = _id AND vendor_id = _v AND status IN ('draft', 'pending_integration', 'pending_authorization', 'pending_review');
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n > 0;
END $$;

-- =====================================================================
-- PUBLIC READ FUNCTIONS (anonymous visitors). Eligibility is decided here, in one indexed query:
-- active status, inside the date window, paid plan still valid, vendor approved, impression allocation not used up.
-- Rotation/fairness ordering is done in the client from the counters returned (see src/lib/ads/adRotation.ts).
-- =====================================================================
CREATE OR REPLACE FUNCTION public.get_public_ad_settings() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'ads_enabled', ads_enabled, 'featured_banner_limit', featured_banner_limit, 'sponsored_banner_limit', sponsored_banner_limit,
    'sponsored_row_interval', sponsored_row_interval, 'rotating_limit', rotating_limit, 'rotation_minutes', rotation_minutes,
    'social_banner_enabled', social_banner_enabled)
  FROM public.advertising_settings WHERE id;
$$;

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
         AND (f.impression_allocation IS NULL OR c.impressions_count < f.impression_allocation)
       ORDER BY c.priority DESC, c.id
       LIMIT least(greatest(coalesce(_limit, 30), 1), 60)
    ) x), '[]'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION public.get_shop_social_banner(_vendor_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _s public.advertising_settings%ROWTYPE; _accounts jsonb; _v record;
BEGIN
  SELECT * INTO _s FROM public.advertising_settings WHERE id;
  IF NOT _s.ads_enabled OR NOT _s.social_banner_enabled THEN RETURN NULL; END IF;
  SELECT v.id, v.store_name, v.logo_url, f.max_social_profiles INTO _v
    FROM public.vendors v
    JOIN public.vendor_memberships m ON m.vendor_id = v.id AND m.status = 'active' AND (m.expires_at IS NULL OR m.expires_at > now())
    JOIN public.supplier_membership_plans sp ON sp.slug = m.plan_slug AND sp.is_active
    JOIN public.advertising_plan_features f ON f.plan_slug = m.plan_slug AND f.social_banner_enabled
   WHERE v.id = _vendor_id AND v.is_approved;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT jsonb_agg(jsonb_build_object('id', t.id, 'platform', t.platform, 'handle', t.handle, 'display_name', t.display_name,
                                      'profile_url', t.profile_url, 'verified', t.verification_status = 'verified') ORDER BY t.platform)
    INTO _accounts
    FROM (SELECT * FROM public.vendor_social_profiles
           WHERE vendor_id = _vendor_id AND promo_enabled AND verification_status <> 'rejected'
           ORDER BY platform LIMIT _v.max_social_profiles) t;
  IF _accounts IS NULL THEN RETURN NULL; END IF;   -- no valid enabled profile: no banner
  RETURN jsonb_build_object(
    'vendor', jsonb_build_object('id', _v.id, 'store_name', _v.store_name, 'logo_url', _v.logo_url),
    'accounts', _accounts,
    'settings', jsonb_build_object('display_minutes', _s.social_display_minutes, 'rotation_minutes', _s.social_rotation_minutes,
                                   'max_per_day', _s.social_max_per_day, 'dismiss_hours', _s.social_dismiss_hours));
END $$;

-- =====================================================================
-- EVENT TRACKING (anonymous). Invalid, expired, repeated and self-generated events are dropped silently.
-- Impressions are counted once per visitor / campaign / placement per 30 minutes; clicks once per 10 minutes.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.record_ad_event(
  _event text, _campaign uuid, _placement text, _visitor text,
  _social uuid DEFAULT NULL, _product uuid DEFAULT NULL, _device text DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _c public.vendor_advertising_campaigns%ROWTYPE; _vendor uuid; _owner uuid; _recent integer; _n integer; _bucket timestamptz;
BEGIN
  IF _event IS NULL OR _event NOT IN ('impression', 'banner_click', 'shop_visit', 'product_visit', 'social_click') THEN RETURN false; END IF;
  IF _visitor IS NULL OR _visitor !~ '^[A-Za-z0-9_-]{8,64}$' THEN RETURN false; END IF;
  IF _device IS NOT NULL AND _device NOT IN ('mobile', 'tablet', 'desktop') THEN _device := NULL; END IF;

  SELECT (SELECT count(*) FROM public.advertising_impressions WHERE visitor_id = _visitor AND occurred_at > now() - interval '1 hour')
       + (SELECT count(*) FROM public.advertising_clicks WHERE visitor_id = _visitor AND occurred_at > now() - interval '1 hour')
    INTO _recent;
  IF _recent >= 300 THEN RETURN false; END IF;   -- obvious automation

  _placement := CASE _event WHEN 'shop_visit' THEN 'shop_page' WHEN 'product_visit' THEN 'product_page'
                            WHEN 'social_click' THEN 'social_banner' ELSE _placement END;

  IF _event = 'social_click' OR (_event = 'impression' AND _placement = 'social_banner') THEN
    IF _social IS NULL THEN RETURN false; END IF;
    SELECT sp.vendor_id, v.user_id INTO _vendor, _owner
      FROM public.vendor_social_profiles sp JOIN public.vendors v ON v.id = sp.vendor_id
     WHERE sp.id = _social AND sp.promo_enabled AND v.is_approved;
    IF _vendor IS NULL THEN RETURN false; END IF;
    _campaign := NULL; _product := NULL;
  ELSE
    IF _campaign IS NULL OR _placement NOT IN ('featured', 'sponsored_row', 'rotating', 'shop_page', 'product_page') THEN RETURN false; END IF;
    SELECT * INTO _c FROM public.vendor_advertising_campaigns WHERE id = _campaign;
    IF NOT FOUND THEN RETURN false; END IF;
    IF _event IN ('impression', 'banner_click')
       AND NOT (_c.status = 'active' AND _c.start_date <= now() AND _c.end_date > now()) THEN RETURN false; END IF;
    IF _event IN ('impression', 'banner_click') AND _placement NOT IN ('featured', 'sponsored_row', 'rotating') THEN RETURN false; END IF;
    _vendor := _c.vendor_id; _social := NULL;
    SELECT user_id INTO _owner FROM public.vendors WHERE id = _vendor;
    IF _event = 'product_visit' THEN
      IF _product IS NULL OR NOT EXISTS (SELECT 1 FROM public.products WHERE id = _product AND vendor_id = _vendor) THEN RETURN false; END IF;
    ELSE
      _product := NULL;
    END IF;
  END IF;
  IF _owner IS NOT NULL AND _owner = auth.uid() THEN RETURN false; END IF;   -- vendors cannot inflate their own numbers

  IF _event = 'impression' THEN
    _bucket := date_bin(interval '30 minutes', now(), timestamptz '2000-01-01 00:00:00+00');
    INSERT INTO public.advertising_impressions (campaign_id, social_profile_id, vendor_id, placement, visitor_id, device, bucket)
    VALUES (_campaign, _social, _vendor, _placement, _visitor, _device, _bucket) ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS _n = ROW_COUNT;
    IF _n = 1 AND _campaign IS NOT NULL THEN
      UPDATE public.vendor_advertising_campaigns SET impressions_count = impressions_count + 1 WHERE id = _campaign;
    END IF;
  ELSE
    _bucket := date_bin(CASE WHEN _event IN ('shop_visit', 'product_visit') THEN interval '30 minutes' ELSE interval '10 minutes' END,
                        now(), timestamptz '2000-01-01 00:00:00+00');
    INSERT INTO public.advertising_clicks (campaign_id, social_profile_id, vendor_id, event_type, placement, product_id, visitor_id, device, bucket)
    VALUES (_campaign, _social, _vendor, _event, _placement, _product, _visitor, _device, _bucket) ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS _n = ROW_COUNT;
    IF _n = 1 AND _campaign IS NOT NULL THEN
      UPDATE public.vendor_advertising_campaigns
         SET clicks_count = clicks_count + (_event = 'banner_click')::integer,
             shop_visits_count = shop_visits_count + (_event = 'shop_visit')::integer,
             product_visits_count = product_visits_count + (_event = 'product_visit')::integer
       WHERE id = _campaign;
    END IF;
  END IF;
  RETURN _n = 1;
END $$;

-- =====================================================================
-- ANALYTICS
-- =====================================================================
CREATE OR REPLACE FUNCTION public.vendor_ad_analytics(_days integer DEFAULT 30) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _v uuid := public.ad_require_vendor(); _d integer := least(greatest(coalesce(_days, 30), 1), 365); _since timestamptz;
BEGIN
  _since := now() - make_interval(days => _d);
  RETURN jsonb_build_object(
    'days', _d,
    'campaigns', coalesce((SELECT jsonb_agg(jsonb_build_object('id', c.id, 'campaign_type', c.campaign_type, 'status', c.status,
        'start_date', c.start_date, 'end_date', c.end_date, 'duration_days', greatest(1, ceil(extract(epoch FROM (c.end_date - c.start_date)) / 86400)::integer),
        'impressions', c.impressions_count, 'clicks', c.clicks_count, 'shop_visits', c.shop_visits_count, 'product_visits', c.product_visits_count,
        'ctr', CASE WHEN c.impressions_count > 0 THEN round(c.clicks_count::numeric * 100 / c.impressions_count, 2) ELSE 0 END)
        ORDER BY c.created_at DESC) FROM public.vendor_advertising_campaigns c WHERE c.vendor_id = _v), '[]'::jsonb),
    'daily', coalesce((SELECT jsonb_agg(jsonb_build_object('day', d.day, 'impressions', d.i, 'clicks', d.c) ORDER BY d.day) FROM (
        SELECT g.day::date AS day,
               (SELECT count(*) FROM public.advertising_impressions i WHERE i.vendor_id = _v AND i.campaign_id IS NOT NULL
                   AND i.occurred_at >= g.day AND i.occurred_at < g.day + interval '1 day') AS i,
               (SELECT count(*) FROM public.advertising_clicks k WHERE k.vendor_id = _v AND k.event_type = 'banner_click'
                   AND k.occurred_at >= g.day AND k.occurred_at < g.day + interval '1 day') AS c
          FROM generate_series(date_trunc('day', _since), date_trunc('day', now()), interval '1 day') AS g(day)) d), '[]'::jsonb),
    'social', jsonb_build_object(
      'impressions', (SELECT count(*) FROM public.advertising_impressions WHERE vendor_id = _v AND placement = 'social_banner' AND occurred_at >= _since),
      'clicks', (SELECT count(*) FROM public.advertising_clicks WHERE vendor_id = _v AND event_type = 'social_click' AND occurred_at >= _since))
  );
END $$;

CREATE OR REPLACE FUNCTION public.admin_ad_analytics(_days integer DEFAULT 30) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _d integer := least(greatest(coalesce(_days, 30), 1), 365); _since timestamptz; _imp bigint; _clk bigint;
BEGIN
  PERFORM public.ad_require_admin();
  _since := now() - make_interval(days => _d);
  SELECT count(*) INTO _imp FROM public.advertising_impressions WHERE campaign_id IS NOT NULL AND occurred_at >= _since;
  SELECT count(*) INTO _clk FROM public.advertising_clicks WHERE event_type = 'banner_click' AND occurred_at >= _since;
  RETURN jsonb_build_object(
    'days', _d,
    'totals', jsonb_build_object('impressions', _imp, 'clicks', _clk,
      'ctr', CASE WHEN _imp > 0 THEN round(_clk::numeric * 100 / _imp, 2) ELSE 0 END,
      'shop_visits', (SELECT count(*) FROM public.advertising_clicks WHERE event_type = 'shop_visit' AND occurred_at >= _since),
      'product_visits', (SELECT count(*) FROM public.advertising_clicks WHERE event_type = 'product_visit' AND occurred_at >= _since),
      'social_clicks', (SELECT count(*) FROM public.advertising_clicks WHERE event_type = 'social_click' AND occurred_at >= _since)),
    'by_placement', coalesce((SELECT jsonb_agg(jsonb_build_object('placement', p.placement, 'impressions', p.i, 'clicks', p.c))
        FROM (SELECT pl.placement,
                     (SELECT count(*) FROM public.advertising_impressions i WHERE i.placement = pl.placement AND i.occurred_at >= _since) AS i,
                     (SELECT count(*) FROM public.advertising_clicks k WHERE k.placement = pl.placement AND k.event_type = 'banner_click' AND k.occurred_at >= _since) AS c
                FROM (VALUES ('featured'), ('sponsored_row'), ('rotating'), ('social_banner')) AS pl(placement)) p), '[]'::jsonb),
    'top_campaigns', coalesce((SELECT jsonb_agg(t) FROM (
        SELECT c.id, v.store_name, c.campaign_type, c.status, c.impressions_count AS impressions, c.clicks_count AS clicks,
               c.shop_visits_count AS shop_visits,
               CASE WHEN c.impressions_count > 0 THEN round(c.clicks_count::numeric * 100 / c.impressions_count, 2) ELSE 0 END AS ctr
          FROM public.vendor_advertising_campaigns c JOIN public.vendors v ON v.id = c.vendor_id
         ORDER BY c.impressions_count DESC LIMIT 15) t), '[]'::jsonb)
  );
END $$;

-- =====================================================================
-- ADMIN FUNCTIONS
-- =====================================================================
CREATE OR REPLACE FUNCTION public.admin_list_ad_campaigns(_status text DEFAULT NULL, _limit integer DEFAULT 100) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.ad_require_admin();
  RETURN coalesce((SELECT jsonb_agg(t.rowdata ORDER BY t.created_at DESC) FROM (
    SELECT c.created_at,
           to_jsonb(c) || jsonb_build_object(
             'store_name', v.store_name, 'plan_slug', public.effective_supplier_plan(c.vendor_id),
             'ctr', CASE WHEN c.impressions_count > 0 THEN round(c.clicks_count::numeric * 100 / c.impressions_count, 2) ELSE 0 END,
             'pending_banner', (SELECT to_jsonb(b) - 'generation_metadata' FROM public.vendor_advertising_banners b
                                 WHERE b.campaign_id = c.id AND b.moderation_status = 'pending' ORDER BY b.version DESC LIMIT 1)) AS rowdata
      FROM public.vendor_advertising_campaigns c JOIN public.vendors v ON v.id = c.vendor_id
     WHERE _status IS NULL OR c.status = _status
     ORDER BY c.created_at DESC LIMIT least(greatest(coalesce(_limit, 100), 1), 300)) t), '[]'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION public.admin_list_ad_vendors() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.ad_require_admin();
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object(
      'vendor_id', v.id, 'store_name', v.store_name, 'plan_slug', m.plan_slug, 'membership_status', m.status,
      'expires_at', m.expires_at, 'currently_active', m.status = 'active' AND (m.expires_at IS NULL OR m.expires_at > now()),
      'homepage_promotion', f.homepage_promotion_enabled,
      'latest_campaign_status', (SELECT c.status FROM public.vendor_advertising_campaigns c WHERE c.vendor_id = v.id ORDER BY c.created_at DESC LIMIT 1))
      ORDER BY m.expires_at DESC NULLS LAST)
    FROM public.vendor_memberships m JOIN public.vendors v ON v.id = m.vendor_id
    LEFT JOIN public.advertising_plan_features f ON f.plan_slug = m.plan_slug
   WHERE m.plan_slug <> 'free'), '[]'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION public.admin_set_campaign_status(_campaign uuid, _status text, _note text DEFAULT NULL) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _c public.vendor_advertising_campaigns%ROWTYPE; _e jsonb; _b uuid;
BEGIN
  PERFORM public.ad_require_admin();
  IF _status NOT IN ('active', 'paused', 'rejected', 'cancelled') THEN RAISE EXCEPTION 'Unsupported status.'; END IF;
  SELECT * INTO _c FROM public.vendor_advertising_campaigns WHERE id = _campaign FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Campaign not found.'; END IF;
  IF _status = 'active' THEN
    _e := public.ad_entitlement(_c.vendor_id);
    IF NOT (_e ->> 'active')::boolean OR NOT coalesce((_e -> 'features' ->> 'homepage_promotion_enabled')::boolean, false) THEN
      RAISE EXCEPTION 'This vendor has no active plan with homepage promotion, so the campaign cannot be activated.'; END IF;
    IF _c.end_date <= now() THEN RAISE EXCEPTION 'This campaign has already ended.'; END IF;
    IF _c.status IN ('cancelled', 'expired') THEN RAISE EXCEPTION 'Ended campaigns cannot be reactivated.'; END IF;
    IF _c.banner_id IS NULL THEN
      SELECT id INTO _b FROM public.vendor_advertising_banners WHERE campaign_id = _campaign AND moderation_status <> 'rejected'
       ORDER BY version DESC LIMIT 1;
      IF _b IS NULL THEN RAISE EXCEPTION 'No banner has been generated yet.'; END IF;
      PERFORM public.ad_apply_banner(_campaign, _b);
    END IF;
    UPDATE public.vendor_advertising_campaigns SET status = 'active', paused_by = NULL, admin_note = left(_note, 500) WHERE id = _campaign;
  ELSIF _status = 'paused' THEN
    UPDATE public.vendor_advertising_campaigns SET status = 'paused', paused_by = 'admin', admin_note = left(_note, 500)
     WHERE id = _campaign AND status = 'active';
  ELSE
    UPDATE public.vendor_advertising_campaigns SET status = _status, paused_by = NULL, admin_note = left(_note, 500) WHERE id = _campaign;
    UPDATE public.advertising_generation_jobs SET status = 'cancelled', finished_at = now(), error = 'Campaign was closed by an admin.'
     WHERE campaign_id = _campaign AND status = 'queued';
  END IF;
  PERFORM public.ad_notify_vendor(_c.vendor_id, CASE _status
    WHEN 'active' THEN 'Your advertising campaign was approved and is live.'
    WHEN 'paused' THEN 'Your advertising campaign was paused by ITHUBAFRICA.'
    ELSE 'Your advertising campaign was closed by ITHUBAFRICA.' END);
  RETURN _status;
END $$;

CREATE OR REPLACE FUNCTION public.admin_set_campaign_priority(_campaign uuid, _priority integer) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.ad_require_admin();
  IF _priority IS NULL OR _priority NOT BETWEEN 0 AND 100 THEN RAISE EXCEPTION 'Priority must be 0-100.'; END IF;
  UPDATE public.vendor_advertising_campaigns SET priority = _priority WHERE id = _campaign;
  IF NOT FOUND THEN RAISE EXCEPTION 'Campaign not found.'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.admin_review_banner(_banner uuid, _approve boolean, _note text DEFAULT NULL) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _b public.vendor_advertising_banners%ROWTYPE; _c public.vendor_advertising_campaigns%ROWTYPE; _e jsonb;
BEGIN
  PERFORM public.ad_require_admin();
  SELECT * INTO _b FROM public.vendor_advertising_banners WHERE id = _banner;
  IF NOT FOUND THEN RAISE EXCEPTION 'Banner not found.'; END IF;
  SELECT * INTO _c FROM public.vendor_advertising_campaigns WHERE id = _b.campaign_id FOR UPDATE;
  IF coalesce(_approve, false) THEN
    IF _c.status IN ('expired', 'cancelled') OR _c.end_date <= now() THEN RAISE EXCEPTION 'This campaign has ended.'; END IF;
    _e := public.ad_entitlement(_c.vendor_id);
    IF NOT (_e ->> 'active')::boolean THEN RAISE EXCEPTION 'This vendor has no active advertising plan.'; END IF;
    PERFORM public.ad_apply_banner(_b.campaign_id, _banner);
    UPDATE public.vendor_advertising_banners SET moderation_note = left(_note, 500) WHERE id = _banner;
    RETURN 'approved';
  END IF;
  UPDATE public.vendor_advertising_banners SET moderation_status = 'rejected', status = 'rejected', moderation_note = left(_note, 500) WHERE id = _banner;
  IF _c.banner_id IS NULL AND _c.status = 'pending_review' THEN
    UPDATE public.vendor_advertising_campaigns SET status = 'rejected', admin_note = left(_note, 500) WHERE id = _c.id;
  END IF;
  PERFORM public.ad_notify_vendor(_c.vendor_id, 'An advertising banner was not approved. You can request a new one from your advertising dashboard.');
  RETURN 'rejected';
END $$;

CREATE OR REPLACE FUNCTION public.admin_review_message(_campaign uuid, _approve boolean) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _c public.vendor_advertising_campaigns%ROWTYPE;
BEGIN
  PERFORM public.ad_require_admin();
  SELECT * INTO _c FROM public.vendor_advertising_campaigns WHERE id = _campaign FOR UPDATE;
  IF NOT FOUND OR _c.message_review IS NULL THEN RAISE EXCEPTION 'No message is waiting for review.'; END IF;
  IF coalesce(_approve, false) THEN
    UPDATE public.vendor_advertising_campaigns
       SET custom_headline = pending_headline, custom_description = pending_description,
           pending_headline = NULL, pending_description = NULL, message_review = NULL WHERE id = _campaign;
    PERFORM public.ad_apply_copy(_campaign);
    PERFORM public.ad_notify_vendor(_c.vendor_id, 'Your advertising message was approved.');
    RETURN 'approved';
  END IF;
  UPDATE public.vendor_advertising_campaigns SET pending_headline = NULL, pending_description = NULL, message_review = NULL WHERE id = _campaign;
  PERFORM public.ad_notify_vendor(_c.vendor_id, 'Your advertising message was not approved. Please edit it and try again.');
  RETURN 'rejected';
END $$;

CREATE OR REPLACE FUNCTION public.admin_request_banner_revision(_campaign uuid, _note text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _c public.vendor_advertising_campaigns%ROWTYPE; _jid uuid;
BEGIN
  PERFORM public.ad_require_admin();
  SELECT * INTO _c FROM public.vendor_advertising_campaigns WHERE id = _campaign FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Campaign not found.'; END IF;
  IF _c.status IN ('expired', 'cancelled') OR _c.end_date <= now() THEN RAISE EXCEPTION 'This campaign has ended.'; END IF;
  -- Admin revisions do not use the vendor's generation allowance.
  _jid := public.ad_enqueue_job(_campaign, _c.vendor_id, 'admin_revision', false,
                                'admin:' || _campaign::text || ':' || floor(extract(epoch FROM clock_timestamp()))::text);
  IF _jid IS NULL THEN RAISE EXCEPTION 'A banner is already being generated for this campaign.'; END IF;
  UPDATE public.advertising_generation_jobs SET admin_note = left(_note, 500) WHERE id = _jid;
  UPDATE public.vendor_advertising_campaigns SET status = 'pending_generation' WHERE id = _campaign AND status IN ('rejected', 'failed');
  RETURN _jid;
END $$;

CREATE OR REPLACE FUNCTION public.admin_list_generation_jobs(_status text DEFAULT NULL, _limit integer DEFAULT 100) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.ad_require_admin();
  RETURN coalesce((SELECT jsonb_agg(to_jsonb(j) || jsonb_build_object('store_name', v.store_name) ORDER BY j.created_at DESC)
    FROM (SELECT * FROM public.advertising_generation_jobs WHERE _status IS NULL OR status = _status
           ORDER BY created_at DESC LIMIT least(greatest(coalesce(_limit, 100), 1), 300)) j
    JOIN public.vendors v ON v.id = j.vendor_id), '[]'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION public.admin_ai_usage_summary() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _s public.advertising_settings%ROWTYPE;
BEGIN
  PERFORM public.ad_require_admin();
  SELECT * INTO _s FROM public.advertising_settings WHERE id;
  RETURN jsonb_build_object(
    'attempts_today', (SELECT count(*) FROM public.advertising_generation_jobs WHERE last_attempt_at >= date_trunc('day', now())),
    'daily_limit', _s.ai_daily_limit,
    'estimated_cost_month_usd', (SELECT coalesce(sum(estimated_cost_usd), 0) FROM public.advertising_generation_jobs
                                  WHERE last_attempt_at >= date_trunc('month', now())),
    'monthly_budget_usd', _s.ai_monthly_budget_usd,
    'queued', (SELECT count(*) FROM public.advertising_generation_jobs WHERE status = 'queued'),
    'running', (SELECT count(*) FROM public.advertising_generation_jobs WHERE status = 'running'),
    'failed_30d', (SELECT count(*) FROM public.advertising_generation_jobs WHERE status = 'failed' AND created_at >= now() - interval '30 days'),
    'succeeded_30d', (SELECT count(*) FROM public.advertising_generation_jobs WHERE status = 'succeeded' AND created_at >= now() - interval '30 days'),
    'cost_is_estimate', true);
END $$;

CREATE OR REPLACE FUNCTION public.admin_set_social_verification(_profile uuid, _status text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.ad_require_admin();
  IF _status NOT IN ('unverified', 'verified', 'rejected') THEN RAISE EXCEPTION 'Unsupported status.'; END IF;
  UPDATE public.vendor_social_profiles SET verification_status = _status WHERE id = _profile;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found.'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.admin_list_social_profiles() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.ad_require_admin();
  RETURN coalesce((SELECT jsonb_agg(to_jsonb(sp) || jsonb_build_object('store_name', v.store_name) ORDER BY sp.created_at DESC)
    FROM public.vendor_social_profiles sp JOIN public.vendors v ON v.id = sp.vendor_id), '[]'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION public.admin_list_external_campaigns(_status text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.ad_require_admin();
  RETURN coalesce((SELECT jsonb_agg(to_jsonb(e) || jsonb_build_object('store_name', v.store_name) ORDER BY e.created_at DESC)
    FROM (SELECT * FROM public.external_ad_campaigns WHERE _status IS NULL OR status = _status
           ORDER BY created_at DESC LIMIT 200) e JOIN public.vendors v ON v.id = e.vendor_id), '[]'::jsonb);
END $$;

-- Admins may reject, pause or close an external request, but can NOT mark one "active": only a real platform
-- integration (service role) may do that, so a campaign can never be shown as running when it is not.
CREATE OR REPLACE FUNCTION public.admin_set_external_status(_id uuid, _status text, _note text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.ad_require_admin();
  IF _status NOT IN ('pending_review', 'rejected', 'cancelled', 'paused', 'ended', 'failed') THEN
    RAISE EXCEPTION 'Unsupported status. External campaigns become active only through a connected ad platform.'; END IF;
  UPDATE public.external_ad_campaigns SET status = _status, status_detail = left(coalesce(_note, status_detail), 500) WHERE id = _id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found.'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.admin_sweep_expired_campaigns() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.ad_require_admin();
  RETURN public.expire_advertising_campaigns();
END $$;

CREATE OR REPLACE FUNCTION public.admin_purge_ad_events(_older_than_days integer DEFAULT 180) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _a integer; _b integer;
BEGIN
  PERFORM public.ad_require_admin();
  IF _older_than_days IS NULL OR _older_than_days < 30 THEN RAISE EXCEPTION 'Keep at least 30 days of events.'; END IF;
  DELETE FROM public.advertising_impressions WHERE occurred_at < now() - make_interval(days => _older_than_days);
  GET DIAGNOSTICS _a = ROW_COUNT;
  DELETE FROM public.advertising_clicks WHERE occurred_at < now() - make_interval(days => _older_than_days);
  GET DIAGNOSTICS _b = ROW_COUNT;
  RETURN _a + _b;
END $$;

-- =====================================================================
-- EXECUTE PERMISSIONS. Everything is closed first, then opened deliberately.
--   anon + signed-in : only the four public read/tracking functions
--   signed-in only   : vendor and admin functions (admin functions re-check the admin role themselves)
--   service role only: entitlement lookup, campaign creation, job queue, sweeper and other internals
-- =====================================================================
DO $$
DECLARE
  _r record;
  _public text[] := ARRAY['get_public_ad_settings', 'get_homepage_ads', 'get_shop_social_banner', 'record_ad_event'];
  _signed_in text[] := ARRAY['my_advertising_overview', 'vendor_set_campaign_products', 'vendor_create_product_campaign',
    'vendor_update_campaign_message', 'vendor_request_banner_regeneration', 'vendor_set_campaign_paused',
    'vendor_upsert_social_profile', 'vendor_delete_social_profile', 'vendor_request_external_campaign',
    'vendor_cancel_external_campaign', 'vendor_ad_analytics', 'admin_ad_analytics', 'admin_list_ad_campaigns',
    'admin_list_ad_vendors', 'admin_set_campaign_status', 'admin_set_campaign_priority', 'admin_review_banner',
    'admin_review_message', 'admin_request_banner_revision', 'admin_list_generation_jobs', 'admin_ai_usage_summary',
    'admin_set_social_verification', 'admin_list_social_profiles', 'admin_list_external_campaigns',
    'admin_set_external_status', 'admin_sweep_expired_campaigns', 'admin_purge_ad_events'];
  _internal text[] := ARRAY['ad_is_admin', 'ad_require_admin', 'ad_require_vendor', 'ad_notify_vendor', 'ad_notify_admins',
    'ad_copy_is_safe', 'ad_normalize_social', 'ad_entitlement', 'ad_placements_for', 'ad_enqueue_job',
    'ensure_ad_campaign_for_vendor', 'trg_membership_grants_ads', 'trg_ad_products_guard', 'expire_advertising_campaigns',
    'claim_advertising_job', 'finish_advertising_job_success', 'finish_advertising_job_failure', 'ad_apply_banner', 'ad_apply_copy'];
BEGIN
  FOR _r IN SELECT p.oid::regprocedure AS sig, p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public' AND p.proname = ANY (_public || _signed_in || _internal) LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', _r.sig);
    IF _r.proname = ANY (_public) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated', _r.sig);
    ELSIF _r.proname = ANY (_signed_in) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', _r.sig);
    END IF;
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', _r.sig);
  END LOOP;
END $$;

-- Sponsored products on the central ITHUBAFRICA TikTok Ads account.
--  * Vendors ask for a product to be promoted; admins approve and put it in a campaign.
--  * Campaigns, budgets and the numbers copied from TikTok Ads Manager are admin-only.
--  * Vendors read their own requests and their own report only. They cannot change budgets or results.
--  * Nothing here charges anyone. Budgets are records.
-- Website figures (views, add to cart, orders, revenue) come from analytics_events and order_attribution.

CREATE TABLE IF NOT EXISTS public.sponsored_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE DEFAULT ('sp' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 120),
  scope text NOT NULL DEFAULT 'product' CHECK (scope IN ('vendor','product','category','marketplace')),
  vendor_id uuid REFERENCES public.vendors(id) ON DELETE SET NULL,
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  tiktok_campaign_id text CHECK (tiktok_campaign_id IS NULL OR char_length(tiktok_campaign_id) <= 60),
  objective text NOT NULL DEFAULT 'sales' CHECK (objective IN ('traffic','awareness','sales')),
  funding_source text NOT NULL DEFAULT 'ithubafrica' CHECK (funding_source IN ('vendor','ithubafrica','shared')),
  vendor_contribution numeric(14,2) NOT NULL DEFAULT 0 CHECK (vendor_contribution >= 0),
  budget_allocated numeric(14,2) NOT NULL DEFAULT 0 CHECK (budget_allocated >= 0 AND budget_allocated <= 1000000000),
  start_date date, end_date date,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending_approval','approved','active','paused','completed','rejected')),
  status_note text CHECK (status_note IS NULL OR char_length(status_note) <= 500),
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sponsored_dates_ok CHECK (start_date IS NULL OR end_date IS NULL OR end_date >= start_date)
);

CREATE TABLE IF NOT EXISTS public.sponsored_campaign_products (
  campaign_id uuid NOT NULL REFERENCES public.sponsored_campaigns(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  budget_share numeric(8,2) CHECK (budget_share IS NULL OR budget_share > 0),   -- relative weight; empty = equal split
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_id, product_id)
);

CREATE TABLE IF NOT EXISTS public.sponsored_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  preferred_budget numeric(14,2) CHECK (preferred_budget IS NULL OR (preferred_budget >= 0 AND preferred_budget <= 10000000)),
  note text CHECK (note IS NULL OR char_length(note) <= 500),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','withdrawn')),
  admin_note text CHECK (admin_note IS NULL OR char_length(admin_note) <= 500),
  campaign_id uuid REFERENCES public.sponsored_campaigns(id) ON DELETE SET NULL,
  decided_by uuid, decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS sponsored_one_pending ON public.sponsored_requests (product_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS sponsored_requests_vendor ON public.sponsored_requests (vendor_id, created_at DESC);

-- What TikTok Ads Manager reports, typed in by an admin (one row per campaign per day). Never estimated.
CREATE TABLE IF NOT EXISTS public.sponsored_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.sponsored_campaigns(id) ON DELETE CASCADE,
  metric_date date NOT NULL,
  spend numeric(14,2) NOT NULL DEFAULT 0 CHECK (spend >= 0),
  impressions bigint NOT NULL DEFAULT 0 CHECK (impressions >= 0),
  clicks bigint NOT NULL DEFAULT 0 CHECK (clicks >= 0),
  entered_by uuid, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, metric_date)
);

-- A product's vendor is always taken from the product, never from the caller.
CREATE OR REPLACE FUNCTION public.sponsored_cp_set_vendor() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  SELECT vendor_id INTO NEW.vendor_id FROM public.products WHERE id = NEW.product_id;
  IF NEW.vendor_id IS NULL THEN RAISE EXCEPTION 'product has no vendor'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_sponsored_cp_vendor ON public.sponsored_campaign_products;
CREATE TRIGGER trg_sponsored_cp_vendor BEFORE INSERT OR UPDATE OF product_id ON public.sponsored_campaign_products
  FOR EACH ROW EXECUTE FUNCTION public.sponsored_cp_set_vendor();
DROP TRIGGER IF EXISTS trg_sponsored_campaigns_updated ON public.sponsored_campaigns;
CREATE TRIGGER trg_sponsored_campaigns_updated BEFORE UPDATE ON public.sponsored_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ------------------------------------------------------------------ access
ALTER TABLE public.sponsored_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sponsored_campaign_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sponsored_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sponsored_metrics ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sponsored_campaigns, public.sponsored_campaign_products, public.sponsored_requests, public.sponsored_metrics FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sponsored_campaigns, public.sponsored_campaign_products, public.sponsored_requests, public.sponsored_metrics TO authenticated;

DO $$ DECLARE _t text; BEGIN
  FOREACH _t IN ARRAY ARRAY['sponsored_campaigns','sponsored_campaign_products','sponsored_requests','sponsored_metrics'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Admins manage" ON public.%I', _t);
    EXECUTE format($p$CREATE POLICY "Admins manage" ON public.%I FOR ALL TO authenticated
      USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'))$p$, _t);
  END LOOP;
END $$;
-- Vendors may read only their own requests. They get campaign and results data through sponsored_report() below.
DROP POLICY IF EXISTS "Vendors read own requests" ON public.sponsored_requests;
CREATE POLICY "Vendors read own requests" ON public.sponsored_requests FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = vendor_id AND v.user_id = auth.uid()));
-- (Table-level INSERT/UPDATE grants exist only for the admin policy; the vendor policy above is SELECT only.)

-- ------------------------------------------------------------------ vendor actions
CREATE OR REPLACE FUNCTION public.submit_sponsored_request(_product_id uuid, _budget numeric, _note text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _v uuid; _id uuid;
BEGIN
  SELECT v.id INTO _v FROM public.vendors v JOIN public.products p ON p.vendor_id = v.id
   WHERE p.id = _product_id AND v.user_id = auth.uid();
  IF _v IS NULL THEN RAISE EXCEPTION 'You can only request promotion for your own products'; END IF;
  IF _budget IS NOT NULL AND (_budget < 0 OR _budget > 10000000) THEN RAISE EXCEPTION 'Budget is out of range'; END IF;
  IF EXISTS (SELECT 1 FROM public.sponsored_requests WHERE product_id = _product_id AND status = 'pending') THEN
    RAISE EXCEPTION 'This product already has a request waiting for review';
  END IF;
  INSERT INTO public.sponsored_requests (vendor_id, product_id, preferred_budget, note)
  VALUES (_v, _product_id, _budget, left(nullif(trim(_note), ''), 500)) RETURNING id INTO _id;
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.withdraw_sponsored_request(_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.sponsored_requests r SET status = 'withdrawn'
   WHERE r.id = _id AND r.status = 'pending'
     AND EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = r.vendor_id AND v.user_id = auth.uid());
END $$;

-- Admin decision. Approving can put the product straight into a campaign.
CREATE OR REPLACE FUNCTION public.decide_sponsored_request(_id uuid, _approve boolean, _note text, _campaign_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _r public.sponsored_requests%ROWTYPE;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Not allowed'; END IF;
  SELECT * INTO _r FROM public.sponsored_requests WHERE id = _id FOR UPDATE;
  IF NOT FOUND OR _r.status <> 'pending' THEN RAISE EXCEPTION 'This request is no longer pending'; END IF;
  UPDATE public.sponsored_requests SET status = CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,
    admin_note = left(nullif(trim(_note), ''), 500), campaign_id = CASE WHEN _approve THEN _campaign_id END,
    decided_by = auth.uid(), decided_at = now() WHERE id = _id;
  IF _approve AND _campaign_id IS NOT NULL THEN
    INSERT INTO public.sponsored_campaign_products (campaign_id, product_id, vendor_id) VALUES (_campaign_id, _r.product_id, _r.vendor_id)
    ON CONFLICT DO NOTHING;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.submit_sponsored_request(uuid, numeric, text), public.withdraw_sponsored_request(uuid),
  public.decide_sponsored_request(uuid, boolean, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_sponsored_request(uuid, numeric, text), public.withdraw_sponsored_request(uuid),
  public.decide_sponsored_request(uuid, boolean, text, uuid) TO authenticated;

-- ------------------------------------------------------------------ one report for admins (everything) and vendors (own products only)
CREATE OR REPLACE FUNCTION public.sponsored_report(
  _vendor uuid DEFAULT NULL, _campaign uuid DEFAULT NULL, _category uuid DEFAULT NULL, _product uuid DEFAULT NULL,
  _from date DEFAULT NULL, _to date DEFAULT NULL)
RETURNS TABLE (
  campaign_id uuid, campaign_code text, campaign_name text, status text, funding_source text, start_date date, end_date date,
  tiktok_campaign_id text, vendor_id uuid, store_name text, product_id uuid, product_name text, product_slug text, category_name text,
  budget_share numeric, allocated_budget numeric, tiktok_data_entered boolean,
  spend numeric, impressions numeric, clicks numeric,
  product_views bigint, add_to_carts bigint, checkouts bigint, purchases bigint, revenue numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _admin boolean := coalesce(public.has_role(auth.uid(), 'admin'), false); _my uuid;
BEGIN
  IF NOT _admin THEN
    SELECT v.id INTO _my FROM public.vendors v WHERE v.user_id = auth.uid();
    IF _my IS NULL THEN RAISE EXCEPTION 'Not allowed'; END IF;
    _vendor := _my;   -- a vendor can never ask for anyone else's figures
  END IF;
  RETURN QUERY
  WITH shares AS (
    SELECT cp.campaign_id, cp.product_id, cp.vendor_id,
           coalesce(cp.budget_share, 1) AS w,
           coalesce(cp.budget_share, 1) / NULLIF(sum(coalesce(cp.budget_share, 1)) OVER (PARTITION BY cp.campaign_id), 0) AS share
      FROM public.sponsored_campaign_products cp
  ), m AS (
    SELECT sm.campaign_id, sum(sm.spend) AS spend, sum(sm.impressions) AS impressions, sum(sm.clicks) AS clicks, count(*) AS days
      FROM public.sponsored_metrics sm
     WHERE (_from IS NULL OR sm.metric_date >= _from) AND (_to IS NULL OR sm.metric_date <= _to) GROUP BY sm.campaign_id
  ), ev AS (
    SELECT e.campaign AS code, e.product_id,
           count(*) FILTER (WHERE e.event = 'ViewContent') AS views, count(*) FILTER (WHERE e.event = 'AddToCart') AS carts
      FROM public.analytics_events e
     WHERE e.campaign IS NOT NULL AND e.product_id IS NOT NULL
       AND (_from IS NULL OR e.created_at::date >= _from) AND (_to IS NULL OR e.created_at::date <= _to)
     GROUP BY e.campaign, e.product_id
  ), ord AS (
    SELECT oa.ad_campaign_id AS cid, oi.product_id AS pid,
           count(DISTINCT o.id) AS checkouts,
           count(DISTINCT o.id) FILTER (WHERE o.status IN ('paid','processing','shipped','delivered')) AS purchases,
           coalesce(sum(oi.price * oi.quantity) FILTER (WHERE o.status IN ('paid','processing','shipped','delivered')), 0) AS revenue
      FROM public.order_attribution oa
      JOIN public.orders o ON o.id = oa.order_id
      JOIN public.order_items oi ON oi.order_id = o.id
     WHERE oa.ad_campaign_id IS NOT NULL
       AND (_from IS NULL OR o.created_at::date >= _from) AND (_to IS NULL OR o.created_at::date <= _to)
     GROUP BY oa.ad_campaign_id, oi.product_id
  )
  SELECT c.id, c.code, c.name, c.status, c.funding_source, c.start_date, c.end_date,
         CASE WHEN _admin THEN c.tiktok_campaign_id END, v.id, v.store_name, p.id, p.name, p.slug, cat.name,
         s.share, round(c.budget_allocated * s.share, 2),
         (m.days IS NOT NULL),
         CASE WHEN m.days IS NULL THEN NULL ELSE round(m.spend * s.share, 2) END,
         CASE WHEN m.days IS NULL THEN NULL ELSE round(m.impressions * s.share) END,
         CASE WHEN m.days IS NULL THEN NULL ELSE round(m.clicks * s.share) END,
         coalesce(ev.views, 0), coalesce(ev.carts, 0), coalesce(ord.checkouts, 0), coalesce(ord.purchases, 0), coalesce(ord.revenue, 0)
    FROM shares s
    JOIN public.sponsored_campaigns c ON c.id = s.campaign_id
    JOIN public.products p ON p.id = s.product_id
    JOIN public.vendors v ON v.id = s.vendor_id
    LEFT JOIN public.categories cat ON cat.id = p.category_id
    LEFT JOIN m ON m.campaign_id = c.id
    LEFT JOIN ev ON ev.code = c.code AND ev.product_id = p.id
    LEFT JOIN ord ON ord.cid = c.id AND ord.pid = p.id
   WHERE (_vendor IS NULL OR s.vendor_id = _vendor) AND (_campaign IS NULL OR c.id = _campaign)
     AND (_category IS NULL OR p.category_id = _category) AND (_product IS NULL OR p.id = _product)
     AND (_admin OR c.status IN ('approved','active','paused','completed'))   -- vendors never see drafts or rejected campaigns
   ORDER BY c.created_at DESC, p.name;
END $$;
REVOKE ALL ON FUNCTION public.sponsored_report(uuid, uuid, uuid, uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sponsored_report(uuid, uuid, uuid, uuid, date, date) TO authenticated;

-- =====================================================================
-- First-party site analytics ("our own pixel")
--
--   public.analytics_events  one row per tracked action (page view, product
--                            view, add to cart, ...). Anonymous: a random
--                            visitor id, no name / email / phone / IP.
--   analytics_summary(days)  admin-only: totals, daily chart, funnel, top
--                            products, searches, sources, devices, pages
--   purge_analytics(days)    admin-only: deletes events older than N days
--
-- Anyone visiting the site may ADD an event (the table validates every
-- field), but only admins can READ them. Sales numbers come from the
-- orders table, never from events a browser reported.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.analytics_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  visitor_id    text NOT NULL,
  session_id    text NOT NULL,
  event         text NOT NULL,
  path          text,
  product_id    uuid,
  order_id      uuid,
  search_term   text,
  label         text,
  value         numeric(14,2),
  source        text,
  campaign      text,
  referrer_host text,
  device        text,
  CONSTRAINT analytics_event_allowed CHECK (event IN
    ('PageView','ViewContent','Search','AddToCart','InitiateCheckout','Purchase','CompleteRegistration','Lead')),
  CONSTRAINT analytics_visitor_len  CHECK (char_length(visitor_id) BETWEEN 8 AND 64),
  CONSTRAINT analytics_session_len  CHECK (char_length(session_id) BETWEEN 8 AND 64),
  CONSTRAINT analytics_path_len     CHECK (path IS NULL OR char_length(path) <= 300),
  CONSTRAINT analytics_search_len   CHECK (search_term IS NULL OR char_length(search_term) <= 100),
  CONSTRAINT analytics_label_len    CHECK (label IS NULL OR char_length(label) <= 40),
  CONSTRAINT analytics_source_len   CHECK (source IS NULL OR char_length(source) <= 60),
  CONSTRAINT analytics_campaign_len CHECK (campaign IS NULL OR char_length(campaign) <= 100),
  CONSTRAINT analytics_referrer_len CHECK (referrer_host IS NULL OR char_length(referrer_host) <= 100),
  CONSTRAINT analytics_device_allowed CHECK (device IS NULL OR device IN ('mobile','tablet','desktop')),
  CONSTRAINT analytics_value_range  CHECK (value IS NULL OR (value >= 0 AND value < 1000000000))
);

CREATE INDEX IF NOT EXISTS idx_analytics_created ON public.analytics_events (created_at);
CREATE INDEX IF NOT EXISTS idx_analytics_event_created ON public.analytics_events (event, created_at);
CREATE INDEX IF NOT EXISTS idx_analytics_product ON public.analytics_events (product_id) WHERE product_id IS NOT NULL;

ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.analytics_events FROM anon, authenticated;
GRANT INSERT ON public.analytics_events TO anon, authenticated;
GRANT SELECT ON public.analytics_events TO authenticated;

-- Visitors can only add events stamped "now" (no back-dating), and every column is
-- checked by the constraints above.
DROP POLICY IF EXISTS "Anyone can record analytics" ON public.analytics_events;
CREATE POLICY "Anyone can record analytics" ON public.analytics_events
  FOR INSERT TO anon, authenticated
  WITH CHECK (created_at BETWEEN now() - interval '5 minutes' AND now() + interval '5 minutes');

DROP POLICY IF EXISTS "Admins read analytics" ON public.analytics_events;
CREATE POLICY "Admins read analytics" ON public.analytics_events
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- ---------------------------------------------------------------------
-- Dashboard numbers (admin only). Days are counted in Nigerian time.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.analytics_summary(_days integer DEFAULT 7)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n_days     integer := LEAST(GREATEST(COALESCE(_days, 7), 1), 365);
  tz         constant text := 'Africa/Lagos';
  today      date := (now() AT TIME ZONE tz)::date;
  start_day  date := (now() AT TIME ZONE tz)::date - (LEAST(GREATEST(COALESCE(_days, 7), 1), 365) - 1);
  since      timestamptz := (((now() AT TIME ZONE tz)::date - (LEAST(GREATEST(COALESCE(_days, 7), 1), 365) - 1))::timestamp AT TIME ZONE tz);
  result     jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = '42501';
  END IF;

  WITH ev AS (
    SELECT * FROM public.analytics_events WHERE created_at >= since
  )
  SELECT jsonb_build_object(
    'days', n_days,
    'since', since,
    'active_now', (SELECT count(DISTINCT visitor_id) FROM public.analytics_events WHERE created_at >= now() - interval '5 minutes'),
    'totals', (SELECT jsonb_build_object(
        'visitors', count(DISTINCT visitor_id),
        'sessions', count(DISTINCT session_id),
        'pageviews', count(*) FILTER (WHERE event = 'PageView'),
        'leads', count(*) FILTER (WHERE event = 'Lead'),
        'registrations', count(*) FILTER (WHERE event = 'CompleteRegistration')
      ) FROM ev),
    'daily', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'day', to_char(g.day, 'YYYY-MM-DD'),
        'visitors', COALESCE(x.visitors, 0),
        'pageviews', COALESCE(x.pageviews, 0)
      ) ORDER BY g.day), '[]'::jsonb)
      FROM generate_series(start_day::timestamp, today::timestamp, interval '1 day') AS g(day)
      LEFT JOIN (
        SELECT (created_at AT TIME ZONE tz)::date AS day,
               count(DISTINCT visitor_id) AS visitors,
               count(*) FILTER (WHERE event = 'PageView') AS pageviews
        FROM ev GROUP BY 1
      ) x ON x.day = g.day::date),
    'funnel', (SELECT jsonb_build_object(
        'viewed',    count(DISTINCT visitor_id) FILTER (WHERE event = 'ViewContent'),
        'carted',    count(DISTINCT visitor_id) FILTER (WHERE event = 'AddToCart'),
        'checkout',  count(DISTINCT visitor_id) FILTER (WHERE event = 'InitiateCheckout'),
        'purchased', count(DISTINCT visitor_id) FILTER (WHERE event = 'Purchase')
      ) FROM ev),
    'top_products', (SELECT COALESCE(jsonb_agg(t), '[]'::jsonb) FROM (
        SELECT e.product_id, p.name,
               count(*) FILTER (WHERE e.event = 'ViewContent') AS views,
               count(*) FILTER (WHERE e.event = 'AddToCart') AS carts
        FROM ev e LEFT JOIN public.products p ON p.id = e.product_id
        WHERE e.product_id IS NOT NULL AND e.event IN ('ViewContent', 'AddToCart')
        GROUP BY e.product_id, p.name
        ORDER BY views DESC, carts DESC
        LIMIT 10) t),
    'top_searches', (SELECT COALESCE(jsonb_agg(t), '[]'::jsonb) FROM (
        SELECT lower(btrim(search_term)) AS term, count(*) AS searches
        FROM ev WHERE event = 'Search' AND btrim(COALESCE(search_term, '')) <> ''
        GROUP BY 1 ORDER BY 2 DESC LIMIT 10) t),
    'sources', (SELECT COALESCE(jsonb_agg(t), '[]'::jsonb) FROM (
        SELECT COALESCE(source, 'direct') AS source, count(DISTINCT session_id) AS sessions
        FROM ev WHERE event = 'PageView'
        GROUP BY 1 ORDER BY 2 DESC LIMIT 8) t),
    'devices', (SELECT COALESCE(jsonb_agg(t), '[]'::jsonb) FROM (
        SELECT COALESCE(device, 'unknown') AS device, count(DISTINCT session_id) AS sessions
        FROM ev WHERE event = 'PageView'
        GROUP BY 1 ORDER BY 2 DESC) t),
    'top_pages', (SELECT COALESCE(jsonb_agg(t), '[]'::jsonb) FROM (
        SELECT path, count(*) AS views, count(DISTINCT visitor_id) AS visitors
        FROM ev WHERE event = 'PageView' AND path IS NOT NULL
        GROUP BY 1 ORDER BY 2 DESC LIMIT 10) t),
    'orders', (SELECT jsonb_build_object('count', count(*), 'value', COALESCE(sum(total), 0))
        FROM public.orders
        WHERE created_at >= since AND status IN ('paid', 'processing', 'shipped', 'delivered'))
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.analytics_summary(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.analytics_summary(integer) TO authenticated;

-- Keeps the table from growing forever. Run by hand, or schedule it (see SITE_ANALYTICS_SETUP.md).
CREATE OR REPLACE FUNCTION public.purge_analytics(_keep_days integer DEFAULT 180)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE removed bigint;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.analytics_events WHERE created_at < now() - make_interval(days => GREATEST(COALESCE(_keep_days, 180), 7));
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_analytics(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purge_analytics(integer) TO authenticated;

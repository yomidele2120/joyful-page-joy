-- Admin analytics v2: ledger-based money totals, period comparison, supplier scorecard,
-- shopper drop-off and search insights. Every function is admin-only and read-only.
-- Days are counted in Nigerian time (Africa/Lagos), like analytics_summary().
-- "Counted" orders are the ones that were actually paid: paid, processing, shipped, delivered.

CREATE INDEX IF NOT EXISTS idx_orders_created_status ON public.orders (created_at, status);
CREATE INDEX IF NOT EXISTS idx_analytics_session ON public.analytics_events (session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_refunds_created ON public.refunds (created_at);

-- ---------------------------------------------------------------------
-- 1. Overview: all-time totals + this period vs the period before it
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_overview(_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n_days    integer := LEAST(GREATEST(COALESCE(_days, 30), 1), 365);
  tz        constant text := 'Africa/Lagos';
  today     date := (now() AT TIME ZONE tz)::date;
  since     timestamptz := (((now() AT TIME ZONE tz)::date - (LEAST(GREATEST(COALESCE(_days, 30), 1), 365) - 1))::timestamp AT TIME ZONE tz);
  prev_since timestamptz := (((now() AT TIME ZONE tz)::date - (2 * LEAST(GREATEST(COALESCE(_days, 30), 1), 365) - 1))::timestamp AT TIME ZONE tz);
  counted   text[] := ARRAY['paid','processing','shipped','delivered'];
  result    jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = '42501';
  END IF;

  WITH
  o AS (SELECT id, total, status, created_at FROM public.orders WHERE created_at >= prev_since),
  oc AS (SELECT * FROM o WHERE status = ANY(counted)),
  pay AS (
    SELECT p.commission_amount, p.vendor_net, p.payout_status, ord.created_at
    FROM public.order_item_payables p
    JOIN public.orders ord ON ord.id = p.order_id
    WHERE ord.status = ANY(counted) AND p.payout_status <> 'refunded'
  ),
  per AS (
    SELECT
      CASE WHEN created_at >= since THEN 'current' ELSE 'previous' END AS bucket,
      count(*) AS orders, COALESCE(sum(total), 0) AS gmv
    FROM oc GROUP BY 1
  ),
  comm AS (
    SELECT CASE WHEN created_at >= since THEN 'current' ELSE 'previous' END AS bucket,
           COALESCE(sum(commission_amount), 0) AS commission
    FROM pay WHERE created_at >= prev_since GROUP BY 1
  ),
  ref AS (
    SELECT CASE WHEN created_at >= since THEN 'current' ELSE 'previous' END AS bucket,
           COALESCE(sum(amount), 0) AS refunded
    FROM public.refunds WHERE created_at >= prev_since AND status IN ('processing','processed') GROUP BY 1
  ),
  cust AS (
    SELECT CASE WHEN created_at >= since THEN 'current' ELSE 'previous' END AS bucket, count(*) AS c
    FROM public.profiles WHERE created_at >= prev_since GROUP BY 1
  ),
  sup AS (
    SELECT CASE WHEN created_at >= since THEN 'current' ELSE 'previous' END AS bucket, count(*) AS c
    FROM public.vendors WHERE created_at >= prev_since GROUP BY 1
  ),
  vis AS (
    SELECT CASE WHEN created_at >= since THEN 'current' ELSE 'previous' END AS bucket,
           count(DISTINCT visitor_id) AS visitors
    FROM public.analytics_events WHERE created_at >= prev_since GROUP BY 1
  ),
  buy AS (
    SELECT CASE WHEN o2.created_at >= since THEN 'current' ELSE 'previous' END AS bucket,
           count(DISTINCT o2.user_id) AS buyers,
           count(DISTINCT o2.user_id) FILTER (WHERE EXISTS (
             SELECT 1 FROM public.orders older
             WHERE older.user_id = o2.user_id AND older.status = ANY(counted) AND older.created_at < o2.created_at
           )) AS repeat_buyers
    FROM public.orders o2
    WHERE o2.status = ANY(counted) AND o2.created_at >= prev_since GROUP BY 1
  )
  SELECT jsonb_build_object(
    'days', n_days,
    'since', since,
    'previous_since', prev_since,
    'current', jsonb_build_object(
      'orders',        COALESCE((SELECT orders FROM per WHERE bucket = 'current'), 0),
      'gmv',           COALESCE((SELECT gmv FROM per WHERE bucket = 'current'), 0),
      'commission',    COALESCE((SELECT commission FROM comm WHERE bucket = 'current'), 0),
      'refunded',      COALESCE((SELECT refunded FROM ref WHERE bucket = 'current'), 0),
      'new_customers', COALESCE((SELECT c FROM cust WHERE bucket = 'current'), 0),
      'new_suppliers', COALESCE((SELECT c FROM sup WHERE bucket = 'current'), 0),
      'visitors',      COALESCE((SELECT visitors FROM vis WHERE bucket = 'current'), 0),
      'buyers',        COALESCE((SELECT buyers FROM buy WHERE bucket = 'current'), 0),
      'repeat_buyers', COALESCE((SELECT repeat_buyers FROM buy WHERE bucket = 'current'), 0)
    ),
    'previous', jsonb_build_object(
      'orders',        COALESCE((SELECT orders FROM per WHERE bucket = 'previous'), 0),
      'gmv',           COALESCE((SELECT gmv FROM per WHERE bucket = 'previous'), 0),
      'commission',    COALESCE((SELECT commission FROM comm WHERE bucket = 'previous'), 0),
      'refunded',      COALESCE((SELECT refunded FROM ref WHERE bucket = 'previous'), 0),
      'new_customers', COALESCE((SELECT c FROM cust WHERE bucket = 'previous'), 0),
      'new_suppliers', COALESCE((SELECT c FROM sup WHERE bucket = 'previous'), 0),
      'visitors',      COALESCE((SELECT visitors FROM vis WHERE bucket = 'previous'), 0),
      'buyers',        COALESCE((SELECT buyers FROM buy WHERE bucket = 'previous'), 0),
      'repeat_buyers', COALESCE((SELECT repeat_buyers FROM buy WHERE bucket = 'previous'), 0)
    ),
    'all_time', jsonb_build_object(
      'orders',         (SELECT count(*) FROM public.orders),
      'counted_orders', (SELECT count(*) FROM public.orders WHERE status = ANY(counted)),
      'gmv',            (SELECT COALESCE(sum(total), 0) FROM public.orders WHERE status = ANY(counted)),
      'payments_received', (SELECT COALESCE(sum(amount), 0) FROM public.payments WHERE status = 'success'),
      'successful_payments', (SELECT count(*) FROM public.payments WHERE status = 'success'),
      'commission',     (SELECT COALESCE(sum(commission_amount), 0) FROM pay),
      'supplier_net',   (SELECT COALESCE(sum(vendor_net), 0) FROM pay),
      'owed_to_suppliers', (SELECT COALESCE(sum(vendor_net), 0) FROM pay WHERE payout_status IN ('held','available','processing')),
      'paid_out',       (SELECT COALESCE(sum(vendor_net), 0) FROM pay WHERE payout_status = 'paid'),
      'users',          (SELECT count(*) FROM public.profiles),
      'products',       (SELECT count(*) FROM public.products),
      'suppliers',      (SELECT count(*) FROM public.vendors),
      'pending_suppliers', (SELECT count(*) FROM public.vendors WHERE NOT is_approved)
    ),
    'status_mix', (SELECT COALESCE(jsonb_agg(jsonb_build_object('status', status, 'orders', c) ORDER BY c DESC), '[]'::jsonb)
                   FROM (SELECT status, count(*) AS c FROM o WHERE created_at >= since GROUP BY status) s),
    'daily', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'day', to_char(g.day, 'YYYY-MM-DD'),
                'orders', COALESCE(x.orders, 0),
                'gmv', COALESCE(x.gmv, 0),
                'commission', COALESCE(c.commission, 0)
              ) ORDER BY g.day), '[]'::jsonb)
              FROM generate_series((since AT TIME ZONE tz)::date::timestamp, today::timestamp, interval '1 day') AS g(day)
              LEFT JOIN (SELECT (created_at AT TIME ZONE tz)::date AS day, count(*) AS orders, sum(total) AS gmv
                         FROM oc WHERE created_at >= since GROUP BY 1) x ON x.day = g.day::date
              LEFT JOIN (SELECT (created_at AT TIME ZONE tz)::date AS day, sum(commission_amount) AS commission
                         FROM pay WHERE created_at >= since GROUP BY 1) c ON c.day = g.day::date)
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_overview(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_overview(integer) TO authenticated;

-- ---------------------------------------------------------------------
-- 2. Supplier scorecard
-- Health score (0-100) = 40% shipped within the SLA + 40% few disputes + 20% few refunds.
-- Needs at least 3 shipments in the period, otherwise the supplier is shown as "new".
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_supplier_scorecard(_days integer DEFAULT 30, _ship_sla_hours integer DEFAULT 48)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n_days integer := LEAST(GREATEST(COALESCE(_days, 30), 1), 365);
  tz     constant text := 'Africa/Lagos';
  since  timestamptz := (((now() AT TIME ZONE tz)::date - (LEAST(GREATEST(COALESCE(_days, 30), 1), 365) - 1))::timestamp AT TIME ZONE tz);
  sla    interval := make_interval(hours => LEAST(GREATEST(COALESCE(_ship_sla_hours, 48), 1), 720));
  result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = '42501';
  END IF;

  WITH ord AS (
    SELECT id, created_at FROM public.orders
    WHERE created_at >= since AND status NOT IN ('pending', 'cancelled')
  ),
  sales AS (
    SELECT p.vendor_id, count(DISTINCT p.order_id) AS orders,
           COALESCE(sum(p.gross_amount), 0) AS gmv, COALESCE(sum(p.commission_amount), 0) AS commission
    FROM public.order_item_payables p JOIN ord ON ord.id = p.order_id
    WHERE p.payout_status <> 'refunded' GROUP BY p.vendor_id
  ),
  ship AS (
    SELECT s.vendor_id,
           count(*) AS shipments,
           count(*) FILTER (WHERE s.shipped_at IS NOT NULL OR now() - o.created_at > sla) AS due,
           count(*) FILTER (WHERE s.shipped_at IS NOT NULL AND s.shipped_at - o.created_at <= sla) AS on_time,
           count(*) FILTER (WHERE s.shipped_at IS NULL AND s.status = 'pending' AND now() - o.created_at > sla) AS overdue,
           count(*) FILTER (WHERE s.disputed_at IS NOT NULL) AS disputes,
           round((avg(extract(epoch FROM (s.shipped_at - o.created_at)) / 3600) FILTER (WHERE s.shipped_at IS NOT NULL))::numeric, 1) AS avg_ship_hours
    FROM public.order_shipments s JOIN ord o ON o.id = s.order_id GROUP BY s.vendor_id
  ),
  rf AS (
    SELECT r.vendor_id, count(*) AS refunds, COALESCE(sum(r.amount), 0) AS refunded
    FROM public.refunds r
    WHERE r.created_at >= since AND r.vendor_id IS NOT NULL AND r.status <> 'failed' GROUP BY r.vendor_id
  ),
  base AS (
    SELECT v.id AS vendor_id, v.store_name,
           COALESCE(sa.orders, 0) AS orders, COALESCE(sa.gmv, 0) AS gmv, COALESCE(sa.commission, 0) AS commission,
           COALESCE(sh.shipments, 0) AS shipments, COALESCE(sh.on_time, 0) AS on_time, COALESCE(sh.due, 0) AS due,
           COALESCE(sh.overdue, 0) AS overdue, COALESCE(sh.disputes, 0) AS disputes, sh.avg_ship_hours,
           COALESCE(rf.refunds, 0) AS refunds, COALESCE(rf.refunded, 0) AS refunded
    FROM public.vendors v
    LEFT JOIN sales sa ON sa.vendor_id = v.id
    LEFT JOIN ship sh ON sh.vendor_id = v.id
    LEFT JOIN rf ON rf.vendor_id = v.id
    WHERE v.is_approved
  ),
  scored AS (
    SELECT b.*,
           CASE WHEN b.due > 0 THEN round(100.0 * b.on_time / b.due, 1) END AS on_time_pct,
           CASE WHEN b.shipments > 0 THEN round(100.0 * b.disputes / b.shipments, 1) END AS dispute_pct,
           CASE WHEN b.orders > 0 THEN round(100.0 * b.refunds / b.orders, 1) END AS refund_pct,
           CASE WHEN b.shipments >= 3 THEN round(100 * (
             0.4 * COALESCE(b.on_time::numeric / NULLIF(b.due, 0), 1)
             + 0.4 * (1 - LEAST(COALESCE(b.disputes::numeric / NULLIF(b.shipments, 0), 0) * 5, 1))
             + 0.2 * (1 - LEAST(COALESCE(b.refunds::numeric / NULLIF(b.orders, 0), 0) * 5, 1))
           )) END AS score
    FROM base b
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'vendor_id', vendor_id, 'store_name', store_name, 'orders', orders, 'gmv', gmv, 'commission', commission,
    'shipments', shipments, 'on_time_pct', on_time_pct, 'avg_ship_hours', avg_ship_hours, 'overdue', overdue,
    'disputes', disputes, 'dispute_pct', dispute_pct, 'refunds', refunds, 'refunded', refunded, 'refund_pct', refund_pct,
    'score', score,
    'status', CASE WHEN score IS NULL THEN 'new' WHEN score >= 80 THEN 'healthy' WHEN score >= 60 THEN 'watch' ELSE 'at_risk' END
  ) ORDER BY gmv DESC, store_name), '[]'::jsonb)
  INTO result FROM scored;

  RETURN jsonb_build_object('days', n_days, 'sla_hours', EXTRACT(epoch FROM sla)::int / 3600, 'suppliers', result);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_supplier_scorecard(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_supplier_scorecard(integer, integer) TO authenticated;

-- ---------------------------------------------------------------------
-- 3. Where shoppers drop off (counted per visit, so someone who adds to cart on
--    Monday and buys on Friday shows once as abandoned and once as a purchase)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_funnel_losses(_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n_days integer := LEAST(GREATEST(COALESCE(_days, 30), 1), 365);
  tz     constant text := 'Africa/Lagos';
  since  timestamptz := (((now() AT TIME ZONE tz)::date - (LEAST(GREATEST(COALESCE(_days, 30), 1), 365) - 1))::timestamp AT TIME ZONE tz);
  result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = '42501';
  END IF;

  WITH ev AS (
    SELECT * FROM public.analytics_events
    WHERE created_at >= since AND event IN ('PageView', 'ViewContent', 'AddToCart', 'InitiateCheckout', 'Purchase')
  ),
  sess AS (
    SELECT session_id,
           COALESCE(max(device), 'unknown') AS device,
           COALESCE((array_agg(source) FILTER (WHERE source IS NOT NULL))[1], 'direct') AS source,
           bool_or(event = 'AddToCart') AS carted,
           bool_or(event = 'InitiateCheckout') AS checkout,
           bool_or(event = 'Purchase') AS purchased,
           COALESCE(sum(value) FILTER (WHERE event = 'AddToCart'), 0) AS cart_value,
           COALESCE(max(value) FILTER (WHERE event = 'InitiateCheckout'), 0) AS checkout_value
    FROM ev GROUP BY session_id
  )
  SELECT jsonb_build_object(
    'days', n_days,
    'totals', (SELECT jsonb_build_object(
        'visits', count(*),
        'carted', count(*) FILTER (WHERE carted),
        'cart_abandoned', count(*) FILTER (WHERE carted AND NOT checkout AND NOT purchased),
        'checkout_abandoned', count(*) FILTER (WHERE checkout AND NOT purchased),
        'purchased', count(*) FILTER (WHERE purchased),
        'cart_value_at_risk', COALESCE(sum(cart_value) FILTER (WHERE carted AND NOT checkout AND NOT purchased), 0),
        'checkout_value_at_risk', COALESCE(sum(checkout_value) FILTER (WHERE checkout AND NOT purchased), 0)
      ) FROM sess),
    'by_device', (SELECT COALESCE(jsonb_agg(t ORDER BY visits DESC), '[]'::jsonb) FROM (
        SELECT device AS label, count(*) AS visits, count(*) FILTER (WHERE carted) AS carted,
               count(*) FILTER (WHERE checkout) AS checkout, count(*) FILTER (WHERE purchased) AS purchased
        FROM sess GROUP BY device) t),
    'by_source', (SELECT COALESCE(jsonb_agg(t ORDER BY visits DESC), '[]'::jsonb) FROM (
        SELECT source AS label, count(*) AS visits, count(*) FILTER (WHERE carted) AS carted,
               count(*) FILTER (WHERE checkout) AS checkout, count(*) FILTER (WHERE purchased) AS purchased
        FROM sess GROUP BY source ORDER BY count(*) DESC LIMIT 8) t),
    'abandoned_products', (SELECT COALESCE(jsonb_agg(t), '[]'::jsonb) FROM (
        SELECT e.product_id, p.name, count(DISTINCT e.session_id) AS carts, COALESCE(sum(e.value), 0) AS value
        FROM ev e
        JOIN sess s ON s.session_id = e.session_id AND NOT s.purchased
        LEFT JOIN public.products p ON p.id = e.product_id
        WHERE e.event = 'AddToCart' AND e.product_id IS NOT NULL
        GROUP BY e.product_id, p.name ORDER BY carts DESC, value DESC LIMIT 10) t),
    'unpaid_orders', (SELECT jsonb_build_object('count', count(*), 'value', COALESCE(sum(total), 0))
        FROM public.orders WHERE status = 'pending' AND created_at >= since AND created_at < now() - interval '1 hour')
  ) INTO result;

  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_funnel_losses(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_funnel_losses(integer) TO authenticated;

-- ---------------------------------------------------------------------
-- 4. Search insights. The shop now records how many results a search returned
--    (analytics_events.value on Search events). Older searches have no count.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_search_insights(_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n_days integer := LEAST(GREATEST(COALESCE(_days, 30), 1), 365);
  tz     constant text := 'Africa/Lagos';
  since  timestamptz := (((now() AT TIME ZONE tz)::date - (LEAST(GREATEST(COALESCE(_days, 30), 1), 365) - 1))::timestamp AT TIME ZONE tz);
  result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = '42501';
  END IF;

  WITH s AS (
    SELECT e.session_id, e.created_at, lower(btrim(e.search_term)) AS term, e.value AS results,
           EXISTS (SELECT 1 FROM public.analytics_events a
                   WHERE a.session_id = e.session_id AND a.event = 'AddToCart' AND a.created_at >= e.created_at) AS carted
    FROM public.analytics_events e
    WHERE e.event = 'Search' AND e.created_at >= since AND btrim(COALESCE(e.search_term, '')) <> ''
  )
  SELECT jsonb_build_object(
    'days', n_days,
    'summary', (SELECT jsonb_build_object(
        'searches', count(*),
        'tracked', count(*) FILTER (WHERE results IS NOT NULL),
        'zero_results', count(*) FILTER (WHERE results = 0),
        'led_to_cart', count(*) FILTER (WHERE carted)
      ) FROM s),
    'zero_results', (SELECT COALESCE(jsonb_agg(t), '[]'::jsonb) FROM (
        SELECT term, count(*) AS searches, max(created_at) AS last_seen
        FROM s WHERE results = 0 GROUP BY term ORDER BY searches DESC, last_seen DESC LIMIT 15) t),
    'no_follow_up', (SELECT COALESCE(jsonb_agg(t), '[]'::jsonb) FROM (
        SELECT term, count(*) AS searches, round(avg(results)::numeric, 0) AS avg_results
        FROM s WHERE COALESCE(results, 1) > 0 GROUP BY term
        HAVING count(*) >= 2 AND count(*) FILTER (WHERE carted) = 0
        ORDER BY searches DESC LIMIT 15) t)
  ) INTO result;

  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_search_insights(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_search_insights(integer) TO authenticated;

-- One call that tells the admin everything that is waiting for an approval, with the dashboard tab where it is handled.
-- Admin only. Counts are read live, so an item disappears from the alert the moment it is approved or rejected.
CREATE OR REPLACE FUNCTION public.admin_pending_approvals() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.ad_is_admin() THEN RAISE EXCEPTION 'Admins only.'; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object('key', x.k, 'label', x.l, 'count', x.n, 'tab', x.t) ORDER BY x.ord)
    FROM (VALUES
      ('suppliers',  'Suppliers waiting for verification',  (SELECT count(*) FROM public.vendors WHERE COALESCE(is_approved, false) = false), 'suppliers', 1),
      ('ads',        'Vendor ads waiting for approval',     (SELECT count(*) FROM public.vendor_advertising_campaigns WHERE status = 'pending_review'), 'vendor-ads', 2),
      ('ad_words',   'Ad wording waiting for review',       (SELECT count(*) FROM public.vendor_advertising_campaigns WHERE message_review = 'pending'), 'vendor-ads', 3),
      ('ad_boosts',  'Ad boost payments to review',         (SELECT count(*) FROM public.ad_boost_payments WHERE status = 'needs_review'), 'vendor-ads', 4),
      ('preorders',  'Preorder products waiting for approval', (SELECT count(*) FROM public.products WHERE is_preorder AND NOT COALESCE(preorder_approved, false)), 'marketplace', 5)
    ) AS x(k, l, n, t, ord)
    WHERE x.n > 0
  ), '[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.admin_pending_approvals() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_pending_approvals() TO authenticated;

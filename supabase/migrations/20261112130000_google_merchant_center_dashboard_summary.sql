CREATE OR REPLACE FUNCTION public.merchant_center_dashboard_summary()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'totalEligible', (
      SELECT count(*)
      FROM public.products p
      LEFT JOIN public.vendors v ON v.id = p.vendor_id
      WHERE p.is_active IS TRUE
        AND p.is_public IS TRUE
        AND (p.vendor_id IS NULL OR v.is_approved IS TRUE)
        AND p.is_preorder IS NOT TRUE
        AND NULLIF(trim(p.name), '') IS NOT NULL
        AND NULLIF(trim(p.description), '') IS NOT NULL
        AND NULLIF(trim(p.brand), '') IS NOT NULL
        AND p.price > 0
        AND p.stock_quantity >= 0
        AND p.image_url ~ '^https://res\.cloudinary\.com/[^/]+/image/upload/'
    ),
    'successfullySubmitted', (
      SELECT count(*)
      FROM public.merchant_center_product_status
      WHERE sync_status = 'submitted'
    ),
    'pendingSynchronization', (
      SELECT count(*)
      FROM public.merchant_center_sync_queue
      WHERE status IN ('pending', 'processing')
    ),
    'failedSubmissions', (
      SELECT count(*)
      FROM public.merchant_center_product_status
      WHERE sync_status = 'failed'
    ),
    'awaitingGoogleProcessing', (
      SELECT count(*)
      FROM public.merchant_center_product_status
      WHERE sync_status = 'submitted'
        AND approval_status = 'pending'
    ),
    'disapproved', (
      SELECT count(*)
      FROM public.merchant_center_product_status
      WHERE sync_status = 'submitted'
        AND approval_status = 'disapproved'
    ),
    'lastSynchronizationAt', (
      SELECT max(last_synced_at)
      FROM public.merchant_center_product_status
    )
  );
$$;

REVOKE ALL ON FUNCTION public.merchant_center_dashboard_summary() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.merchant_center_dashboard_summary() TO service_role;

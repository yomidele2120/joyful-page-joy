-- =====================================================================
-- Give suppliers who were ALREADY approved before the commission policy the same
-- commission-free period as new suppliers.
--
-- Their free period starts now (when this runs) and lasts free_period_months calendar
-- months in Nigeria time, exactly like a newly approved supplier. It is set once: running
-- this again changes nothing, because only suppliers without an activation date are touched.
-- Orders that were already paid keep the commission they were charged; the free period
-- applies to every payment that succeeds from now on.
-- Run it AFTER 20261017120000_supplier_commission_terms.sql. Safe to run twice.
-- =====================================================================
INSERT INTO public.supplier_commercial_terms (vendor_id, user_id, activated_at, commission_free_until)
SELECT v.id,
       v.user_id,
       now(),
       ((now() AT TIME ZONE 'Africa/Lagos') + make_interval(months => fs.free_period_months)) AT TIME ZONE 'Africa/Lagos'
FROM public.vendors v
CROSS JOIN public.finance_settings fs
WHERE fs.id = true
  AND v.is_approved = true
ON CONFLICT (vendor_id) DO UPDATE
  SET activated_at = EXCLUDED.activated_at,
      commission_free_until = EXCLUDED.commission_free_until
  WHERE public.supplier_commercial_terms.activated_at IS NULL;

-- Check the result (every approved supplier should now have both dates):
--   SELECT v.store_name, t.activated_at, t.commission_free_until, t.terms_accepted_at
--   FROM public.vendors v LEFT JOIN public.supplier_commercial_terms t ON t.vendor_id = v.id
--   WHERE v.is_approved ORDER BY v.store_name;

-- (a) Attach your imported ITHUB products to a supplier. Products with NO supplier owe nobody.
--     Find the id first:  SELECT id, store_name FROM public.vendors;
UPDATE public.products SET vendor_id = 'PASTE-VENDOR-UUID'::uuid WHERE sku LIKE 'ITHUB-%';

-- (b) Manual correction for a supplier (negative = deduct, positive = credit). Applied to their next payout.
INSERT INTO public.supplier_adjustments (vendor_id, amount, reason)
VALUES ('PASTE-VENDOR-UUID'::uuid, -5000, 'Damaged item refund');

-- (c) Quick health check: money owed to suppliers right now, by status
SELECT payout_status, count(*) AS lines, sum(vendor_net) AS total
FROM public.order_item_payables GROUP BY payout_status ORDER BY payout_status;

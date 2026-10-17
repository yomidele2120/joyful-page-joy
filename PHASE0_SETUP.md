# Phase 0: order integrity (stock, shipping, disputes, refunds)

## What changed
- **Stock is reserved** when an order is placed (two buyers can no longer buy the last unit) and returned if the order is cancelled.
- **Unpaid orders expire** after 30 minutes. A payment that arrives late revives the order if stock remains, otherwise the order is flagged "needs refund" and a refund is queued.
- **Suppliers can now see their orders** (Orders tab), the delivery address once paid, and mark them **Shipped** with courier and waybill. Before this, the migrations gave suppliers no permission to read orders.
- **Buyers confirm receipt or report a problem** from My orders. If they do nothing, shipments auto-confirm after N days (Admin > Finance > Settings).
- **Admin > Disputes & refunds**: resolve disputes (release to supplier or refund buyer), send Paystack refunds, mark manual (Klump) refunds.
- **Supplier money is released from the shipment**, not from an admin clicking Delivered on every order.

## Deploy in this order
1. Run `supabase/migrations/20261017090000_order_integrity.sql` in the SQL Editor (after the finance and BNPL migrations).
2. Enable the scheduler: Database > Extensions > pg_cron, then run `supabase/seed/ops_scheduler.sql`.
   Without it, abandoned checkouts keep their stock reserved until you press "Expire unpaid orders now".
3. Deploy the edge functions: `refund-order` (new), `paystack-webhook`, `verify-payment`.
   In the Paystack dashboard, make sure the webhook is subscribed to refund events as well as charge and transfer events.
4. Deploy the website.

## Test with small amounts before real money
1. Buy the last unit in one browser; try to buy it in another. The second must be refused.
2. Start a checkout, abandon it, wait 30 minutes (or press "Expire unpaid orders now"). Stock must return.
3. Pay an order, ship it as the supplier, confirm as the buyer, release funds in Finance, run a payout.
4. Ship an order, report a problem as the buyer, refund from Disputes & refunds, confirm the Paystack refund arrives.
5. Pay for an order after it expired (stock available): it should revive. Then repeat with the stock sold out: it should become "needs refund".

## Known limits
- If a supplier edits a product's stock by hand, reserved quantities are overwritten by what they type.
- Klump (pay later) refunds are manual: refund in the Klump dashboard, then press "Mark refunded".
- Refund webhook field names should be confirmed on your first live refund. If a refund stays on "processing", check the Paystack dashboard and use "Mark refunded".
- Shipping fees, courier integration, signup protection (captcha/OTP), monitoring and legal approval are still open Phase 0 items.

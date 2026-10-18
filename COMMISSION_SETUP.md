# Supplier onboarding and commission system

## How money moves in this project (checked against the code and Paystack's documentation)
1. The buyer pays the FULL amount (product subtotal + 7.5% VAT, plus any bank/BNPL fee) into your MAIN Paystack balance.
   Checkout does not use Paystack split payments, and the supplier subaccounts created by `create-subaccount` are not used on a charge.
2. The database ledger (`order_item_payables`) records each supplier's share per order line: product subtotal minus commission.
3. After delivery is confirmed plus the protection period, `run-payouts` pays the supplier by Paystack TRANSFER.

I kept this design on purpose. Paystack multi-split settles the supplier's share to their bank straight away, which would defeat the
delivery hold, disputes and refunds you now have. Commission is therefore enforced in the ledger and in the payout amount.
`paystack-readiness` (Admin > Commission & terms > "Run the check") tests YOUR live account: key mode, readable balance, transfers API.
Also confirm in the Paystack dashboard that third-party payouts are approved for your business and transfer OTP is switched off.

## Rules implemented
- New supplier approved -> `activated_at` = approval time; `commission_free_until` = same time N calendar months later in Nigeria time (WAT).
  N is `finance_settings.free_period_months` (default 2). Month ends clamp like a calendar (31 Dec + 2 months = 28 Feb). Re-approval never restarts it.
- Rate = 0% while `payment time < commission_free_until`; afterwards the supplier's custom rate if set, else `default_commission_percent` (now 1.5).
- Commission = round(product subtotal x rate, 2). VAT, shipping and Paystack's fee are never part of it.
- The rate is applied when the order line is created and locked in again when payment succeeds ("every successful transaction").
- Refunded / cancelled: the line becomes `refunded`, so the commission disappears from earnings; if the supplier was already paid, a negative adjustment claws back their net.
- Duplicate webhooks: the paid transition happens once (`mark_order_paid` is idempotent), the payment time is set once, signatures are verified (HMAC-SHA512, constant-time).
- Paystack's processing fee is stored per payment (`payments.paystack_fee`) and shown separately. Assumption: the PLATFORM bears it (Paystack's default). The draft terms say so.

## Registration and agreement
- Supplier signup shows the terms and an unticked, required checkbox. Registration completes only through `register_supplier()` on the server, which refuses without acceptance and stores: version, exact text shown, rates at the time, acceptance time (`supplier_agreements`, immutable) plus activation and free-period dates (`supplier_commercial_terms`).
- The direct insert permissions on `vendors` and `user_roles` are removed, so no other route creates a supplier.
- Suppliers can re-read what they accepted (dashboard banner > "View accepted terms"). Suppliers who registered earlier, or when you publish a new version, are asked to accept; an admin cannot approve a supplier who has not accepted.

## Who can change what
- Commission rate and free period: super admins only (checked in the database), recorded in `commission_audit_log` with who and when.
- Existing admins become super admins when you run the migration. Add or remove others with `set_super_admin`.
- Supplier approval, custom rates, agreement acceptances and terms versions are all audited.

## Deploy in this order
1. Run `supabase/migrations/20261017120000_supplier_commission_terms.sql` (after the earlier migrations).
2. Run `supabase/tests/commission_policy_test.sql`. Success = the intentional error "ALL COMMISSION TESTS PASSED".
3. Deploy edge functions: `paystack-webhook`, `verify-payment`, `paystack-readiness` (new).
4. Deploy the website.
5. Admin > Commission & terms: check the settings, run the Paystack check, read the draft terms and have a Nigerian lawyer review them.

## Things that change for you
- `default_commission_percent` is set to 1.5 by the migration (it was 5).
- Suppliers who were already approved get the same free period too, starting when you run `20261018090000_legacy_suppliers_free_period.sql` (not from their original approval date). Orders already paid keep the commission they were charged. They are still asked to accept the terms.
- Pending suppliers must accept the terms before you can approve them.
- Suppliers can no longer edit their own commission rate (that was possible before).
- Commission rates are still visible on public supplier records for custom rates; consider moving `vendors.commission_percent` to a private table.
- Shipping fees are not charged by checkout yet. `orders.shipping_fee` exists (default 0) and is already excluded from commission and reported separately.

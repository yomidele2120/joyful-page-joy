# Finance build: Phases 1-3 (payables ledger, supplier payouts, admin Finance tab)

## What you get
- Every order line records exactly what the supplier earns (price x qty minus commission). Buyers cannot see this.
- Funds are HELD until: order paid + money received + order marked Delivered + hold days passed.
- Admin > Finance: settings (commission, hold days, minimum payout, BNPL settings), what each supplier is owed, Pay now, payout history.
- Payouts go out through Paystack Transfers for the exact amount owed, once, and a failed or reversed transfer returns the money to the supplier's balance.
- Orders placed BEFORE you install this are not payable (nothing is paid out for old orders).

## Environment / secrets
- Frontend `.env`: NOTHING new.
- Supabase secrets (Project Settings > Edge Functions > Secrets): `PAYSTACK_SECRET_KEY` must already exist (it does for checkout). SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are added automatically. Never put the Paystack secret or service-role key in `.env`.

## Steps (in this order)
1. Supabase > SQL Editor > paste `supabase/migrations/20261016090000_finance_foundation.sql` > Run. (Safe to run twice.)
2. Deploy the functions:
   supabase functions deploy create-recipient run-payouts paystack-webhook verify-payment
3. Deploy the frontend (push to your repo / Vercel).
4. Paystack dashboard: make sure Transfers is enabled for your business, your balance has money, and OTP confirmation for transfers is turned OFF (otherwise API payouts fail and the money goes back to the supplier's balance). Your webhook URL stays the same; Paystack now also sends transfer results to it.
5. Optional: `supabase/seed/finance_hourly_release.sql` (needs pg_cron enabled) so funds release automatically. Without it, click "Release matured funds" in Finance.
6. Run (a) in `supabase/seed/finance_useful.sql` so your imported products belong to a supplier.

## First test (use small amounts)
1. Admin > Finance > Settings: set commission, set "Hold after delivery" to 0 for the test, set minimum payout low, Save.
2. Make sure the supplier is approved and has bank details, then Payables > Verify bank.
3. Place a real order for one of that supplier's products and pay it.
4. Admin > Orders: set the order to Delivered.
5. Finance > Release matured funds, then Pay now. Check the supplier received exactly the "Available" amount.
6. Put the hold days and minimum payout back to real values.

## Not built yet
BNPL checkout and webhooks (Phase 5), preorder (Phase 6), supplier earnings page (Phase 4), automatic payouts, an adjustments screen (use supabase/seed/finance_useful.sql (b) for now).

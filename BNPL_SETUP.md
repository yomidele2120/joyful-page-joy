# Pay later (Klump): setup

Pay later is shown at checkout only when ALL of these are true:
1. "Offer Pay later at checkout" is ON (Admin > Finance > Settings).
2. `VITE_KLUMP_PUBLIC_KEY` is set on Vercel.
3. EVERY item in the cart has "Allow Pay later" switched on (suppliers tick it when adding a product, or flip it in their Products list; admins can do the same).
4. The cart total (with VAT) is between your minimum and maximum Pay later amounts.

## Keys: where each one goes
- Vercel (frontend, PUBLIC): `VITE_KLUMP_PUBLIC_KEY` = your klp_pk_... key. Redeploy after adding it.
- Supabase > Project Settings > Edge Functions > Secrets (PRIVATE, never in Vercel and never starting with VITE_):
  - `KLUMP_SECRET_KEY` = your Klump secret key
  - `KLUMP_ENV` = `test` (change to `live` when you go live; in live mode test payments are rejected)
  - `SITE_URL` = https://your-site (optional, used for product links shown inside Klump)
  - `KLUMP_REQUIRE_SIGNATURE` = `true` (optional, set only after the first test shows sigOk=true in the webhook logs)

## Steps
1. Supabase SQL Editor: run `supabase/migrations/20261016120000_bnpl.sql` (after the finance migration). Safe to run twice.
2. Put the new code in your project (this zip already has it) and deploy the functions:
   supabase functions deploy klump-initialize klump-verify klump-webhook
   (verify_jwt = false is already set in supabase/config.toml for them.)
3. Deploy the frontend (push to your repo / Vercel).
4. In the Klump merchant dashboard > Settings > API & Webhook, set the webhook URL to:
   https://cgyzhkeliomwxwrpmnlh.supabase.co/functions/v1/klump-webhook
5. Admin > Finance > Settings: switch Pay later ON, set the merchant fee %, who pays it, minimum and maximum order, and the per-customer limit. Save.
6. Switch Pay later ON for some products (a laptop, say). Optional bulk SQL: supabase/seed/bnpl_useful.sql.
7. Test: add an eligible product worth more than your minimum to the cart and open checkout. You should see "Buy now, pay later with Klump". Use Klump's test details from their docs.

## After a Pay later payment
- The order is marked paid only after the server asks Klump's API and the amount, currency and order match.
- Admin > Finance > Pay later lists every payment. When Klump actually pays you, click "Mark settled". Supplier money is released only after: delivered + settled + hold days.

## If the first test does not confirm
Klump's documentation does not show the exact JSON field names, so the server checks several likely ones and refuses anything it cannot match (it never guesses). If the checkout says it is waiting for Klump to confirm, run the troubleshooting query in supabase/seed/bnpl_useful.sql and send me the raw_verify result, and I will adjust the field names.

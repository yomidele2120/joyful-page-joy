# Pay later with Credit Direct

Pay later now supports two partners, **Klump** and **Credit Direct**. The admin picks which one buyers see:
**Admin > Finance > Settings > Buy now, pay later > Active provider**. Only one is shown at a time. Switching affects new
checkouts only; a payment already started with the other provider still finishes and is recorded correctly.

## Important: Credit Direct does not publish its API publicly
Credit Direct gives the technical documentation and keys to merchants **after approval** (they assign a growth manager and a
WhatsApp support group). So the code is finished and tested, but it cannot be switched on until you have their details.
Nothing about their endpoints is guessed or hard-coded: you paste what they give you into Supabase secrets.

Apply as a merchant: https://www.creditdirect.ng/credit-direct-checkout  (business sign-up: https://business.creditdirect.ng)

## What to ask Credit Direct (send them this list)
1. The **API base URL** for sandbox and for live.
2. The endpoint that **creates a checkout / payment session** (we send amount, items, our reference, return URL; we need back a hosted checkout link).
3. The endpoint that **looks up a transaction by our merchant reference** (used to confirm a payment). Method GET or POST.
4. How requests are **authenticated** (header name and scheme, for example `Authorization: Bearer <secret>`).
5. Whether amounts are in **naira or kobo**.
6. The **request field names** for the create call (amount, reference, customer, items, return URL). Ours are in the table below.
7. Which **status value means "the customer finished and the merchant will be paid"** (for example `successful`).
8. In the lookup response: which field holds the **amount**, and does it **echo our reference**?
9. **Webhooks**: can they call `https://<your-project>.supabase.co/functions/v1/creditdirect-webhook`, what is the **signature header** and **signing secret**?
10. Please **allow our return URL**: `https://<your-site>/pay-later/return`
11. How **refunds** and **settlement** work (the Credit Direct FAQ says a merchant that cancels after payment refunds Credit Direct, which cancels the customer's loan).

## Secrets to set (Supabase > Project Settings > Edge Functions > Secrets)
| Secret | Required | Meaning |
|---|---|---|
| `CREDITDIRECT_API_BASE_URL` | yes | e.g. `https://api.example.com` (must be https) |
| `CREDITDIRECT_SECRET_KEY` | yes | your secret key (never put it on Vercel) |
| `CREDITDIRECT_CREATE_PATH` | yes | create-checkout endpoint path, e.g. `/v1/checkout` |
| `CREDITDIRECT_VERIFY_PATH` | yes | lookup path, must contain `{reference}`, e.g. `/v1/checkout/{reference}/verify` |
| `SITE_URL` | yes | `https://your-site` (where buyers are sent back to) |
| `CREDITDIRECT_AUTH_HEADER` | no | default `Authorization` |
| `CREDITDIRECT_AUTH_SCHEME` | no | default `Bearer`; set to an empty value to send the key as-is |
| `CREDITDIRECT_AMOUNT_UNIT` | no | `naira` (default) or `kobo` |
| `CREDITDIRECT_AMOUNT_FIELD` | no | name of the amount field in the lookup response, if it is unusual |
| `CREDITDIRECT_SUCCESS_STATUSES` | no | comma list, default `successful,success,completed,paid,disbursed` |
| `CREDITDIRECT_RESPONSE_ECHOES_REFERENCE` | no | set `false` only if the lookup response never contains our reference |
| `CREDITDIRECT_VERIFY_METHOD` | no | `GET` (default) or `POST` |
| `CREDITDIRECT_EXTRA_HEADERS` | no | JSON, e.g. `{"X-Merchant-Id":"123"}` |
| `CREDITDIRECT_EXTRA_BODY` | no | JSON merged into the create request, e.g. `{"merchant_id":"123"}` |
| `CREDITDIRECT_ENV` | no | `test` or `live`. In `live`, a response that says it is a test/sandbox payment is rejected |
| `CREDITDIRECT_WEBHOOK_SECRET` | recommended | when set, every webhook must carry a valid HMAC-SHA256 signature |
| `CREDITDIRECT_SIGNATURE_HEADER` | no | default `x-signature` |

The create request we send by default (edit `buildCreateBody()` in `supabase/functions/_shared/creditdirect.ts` if their names differ):
```json
{ "amount": 107500, "currency": "NGN", "reference": "order-<uuid>",
  "callback_url": "https://your-site/pay-later/return?order=<uuid>", "redirect_url": "<same>",
  "customer": { "name": "", "first_name": "", "last_name": "", "email": "", "phone": "08012345678" },
  "items": [ { "name": "", "unit_price": 100000, "quantity": 1 }, { "name": "VAT (7.5%)", "unit_price": 7500, "quantity": 1 } ],
  "metadata": { "order_id": "<uuid>" } }
```
The response must contain an https checkout link under one of: `checkout_url`, `payment_url`, `authorization_url`, `redirect_url`, `payment_link`, `link`, `url`.

## Steps
1. **Database** (Supabase SQL Editor): run `supabase/migrations/20261106090000_bnpl_providers.sql`. Safe to run twice. It does not change existing Klump orders; the default provider stays Klump.
2. **Deploy the functions**:
   `supabase functions deploy creditdirect-initialize creditdirect-verify creditdirect-webhook refund-order`
   (`verify_jwt = false` is already in `supabase/config.toml`.)
3. **Deploy the website** (push to your repo so Vercel builds it).
4. When Credit Direct has given you their details, set the secrets above (they apply immediately, no redeploy needed).
5. **Admin > Finance > Settings > Active provider**: the Credit Direct card shows a checklist. When it says "All Credit Direct settings found", select it and press **Save settings**. (The Save button refuses to switch to Credit Direct while anything is missing, so buyers can never land on a broken checkout.)
6. Set the webhook URL in the Credit Direct merchant portal to `https://<project>.supabase.co/functions/v1/creditdirect-webhook`.
7. Test in their sandbox: add an eligible product, choose "Buy now, pay later with Credit Direct", complete the flow, and confirm you land on `/pay-later/return` with "Your Pay later order is placed".

## How a payment is confirmed (nothing is trusted from the browser)
1. Checkout creates the order on the server, then `creditdirect-initialize` asks Credit Direct for a hosted checkout link and sends the buyer there.
2. The buyer returns to `/pay-later/return?order=...`. That page only calls `creditdirect-verify`.
3. `creditdirect-verify` asks Credit Direct directly (with your secret key) about **our reference** and marks the order paid only if: status is a success status, the amount equals the order total, the currency is NGN (if given), our reference is in the response, and it is not a test payment while live.
4. The webhook does the same check and is also signature-checked. If the buyer closes the tab, the webhook still completes the order.
5. Anything unclear is treated as "not paid". The raw response is saved in `bnpl_transactions.raw_verify` so it can be diagnosed.

## If the first sandbox test does not confirm
Run this in the SQL Editor and send me the `raw_verify` result; I will adjust the field names:
```sql
select order_id, provider, status, checkout_url, raw_verify
from public.bnpl_transactions where provider = 'creditdirect' order by created_at desc limit 5;
```
Also check Supabase > Edge Functions > `creditdirect-verify` > Logs.

## Tests included
- `node --test supabase/functions/_shared/creditdirect.test.ts` (18 adapter tests)
- `node --import ./scripts/creditdirect-test/register.mjs scripts/creditdirect-test/run.mjs` (32 checks that run the real edge-function handlers against a fake database and a fake Credit Direct)

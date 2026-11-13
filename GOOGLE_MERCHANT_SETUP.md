# Google Merchant Center integration

The integration submits product inputs server-side through the current Google Merchant API. It does not generate a file feed or create a Merchant Center data source.

## Required configuration

Set these Supabase Edge Function secrets:

- `GOOGLE_MERCHANT_CLIENT_ID`
- `GOOGLE_MERCHANT_CLIENT_SECRET`
- `GOOGLE_MERCHANT_REFRESH_TOKEN`
- `GOOGLE_MERCHANT_CRON_SECRET`

Set the same value as `GOOGLE_MERCHANT_CRON_SECRET` in both Supabase and Vercel. Also set Vercel's `CRON_SECRET` to that same value so Vercel's scheduler sends the expected `Authorization: Bearer ...` header. The scheduled endpoint requires this header; `?cron=1` alone is not authorization.

The scheduled Vercel function also needs the server environment variables `SUPABASE_URL` and `SUPABASE_ANON_KEY`. The public Supabase URL/key fallbacks are supported for invoking the function, but Google credentials must never be configured as `VITE_` variables.

## One-time setup

1. Apply the migrations, including `20261112180000_google_merchant_sync_queue.sql`.
2. Deploy the `google-merchant` Supabase Edge Function with JWT verification disabled at the gateway; the function verifies admin tokens and the cron secret itself.
3. Configure the OAuth client, secret, and refresh token as Supabase function secrets. The OAuth grant must include the Merchant API scope.
4. Open **Admin → Google Merchant** and enter the existing Merchant Center account ID and existing Merchant API data source ID. The integration checks that the data source exists; it never creates or replaces one.
5. Save configuration, then run **Synchronize eligible catalogue**. The first call submits at most ten products. The next batch is attempted only if all submissions in that first batch were accepted by the API. A successful API response means submitted, not approved by Google.

Eligible products must have an approved vendor, be public and active, have a positive price, non-empty title and description, and a public HTTPS Cloudinary image URL in `image_url` or `images`. Inventory is mapped to availability, including out-of-stock products. Preorder state is mapped only when approved and open. Brand, category, condition, GTIN, and MPN are sent only when present in product data; the integration does not invent them. Currency is NGN for this catalogue.

## Automatic synchronization

Database triggers enqueue product inserts, relevant product updates, deletes, and vendor approval changes. The queue retains product input identifiers when a product is deleted, so the corresponding Google listing can be removed. Vercel schedules `/api/merchant-center?cron=1` once per day to support Hobby deployments; each run processes up to ten queued products and applies bounded retries. Vercel Hobby only permits daily cron jobs. Pro and Enterprise deployments can use a more frequent schedule, such as every five minutes. The admin dashboard can process the remaining batches immediately.

The Vercel cron request must include the configured bearer secret. Do not expose it in the URL or frontend code.

## Status and diagnostics

The admin dashboard reports eligible products, API-accepted submissions, queued work, failures, and submissions still awaiting Google processing. Google API acceptance is not approval; approval/rejection counts are populated only when Google provides those statuses. Per-product API errors and retry history are recorded in `google_merchant_sync_logs`.

The `google_merchant_settings`, `google_merchant_products`, `google_merchant_sync_queue`, and `google_merchant_sync_logs` tables store configuration, per-product submission state, pending changes, and logs. Credentials remain in server-side secrets.

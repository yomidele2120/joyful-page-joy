# Google Merchant Center integration

The integration uses Google's current Merchant API (`products/v1`) through the Vercel server-side API route. The browser never receives the Google service-account credentials or Supabase service-role key.

## One-time setup

1. Apply `supabase/migrations/20261112090000_google_merchant_center.sql`, `supabase/migrations/20261112130000_google_merchant_center_dashboard_summary.sql`, `supabase/migrations/20261112140000_google_merchant_center_initial_batch.sql`, and `supabase/migrations/20261112150000_google_merchant_center_data_source.sql` to the production Supabase project.
2. In Google Cloud, enable the **Merchant API** for the project that owns the service account. Create a service account, download its JSON key, and add its email as a user with product-management access in the target Merchant Center account.
3. Configure the numeric Merchant Center account ID in Admin > **Google Merchant Center** and save it. Click **Create or reuse Nigeria API source**. The server lists existing data sources first and reuses a primary API source targeting only Nigeria (`NG`) that either accepts any feed label/language or matches English (`en`) and the configured feed label; otherwise it creates **ITHUBAFRICA Primary API Product Source** through the current Merchant API `datasources/v1` endpoint. The dashboard displays both the numeric data-source ID and full resource name. Google's response determines whether Nigeria is currently eligible for this account; API eligibility errors are shown in the admin action and no source is saved as configured on failure.
4. Add these server-side environment variables to Vercel for every environment that should run the integration:

   | Variable | Value |
   | --- | --- |
   | `GOOGLE_MERCHANT_SERVICE_ACCOUNT_JSON` | The complete service-account JSON object as a single environment-variable value |
   | `SUPABASE_URL` | The Supabase project URL |
   | `SUPABASE_SERVICE_ROLE_KEY` | The Supabase service-role key |
   | `CRON_SECRET` | A long random secret used to authorize the scheduled route |
   | `SITE_URL` | Canonical HTTPS storefront URL, for example `https://www.ithubafrica.com` |

   Never add the service-account JSON or service-role key to a `VITE_` variable, source file, or browser storage.
5. Deploy the application. In Admin > **Google Merchant Center**, verify the source, save and enable automatic synchronization. The data source must be a primary API source targeting Nigeria and matching the configured feed label and language.
6. Use **Sync first 10 products** for the initial import. It verifies the data-source configuration, pauses bulk synchronization, and submits at most 10 products. **Continue catalogue sync** stays unavailable until those actual product submissions succeed. Review Google's returned product issues and use the explicit continue action to release the remaining queue.

## Scheduled synchronization

`vercel.json` schedules `/api/merchant-center?cron=1` once daily at 00:00 UTC. This frequency is compatible with Vercel Hobby, which permits at most one cron execution per day and may invoke it within the scheduled hour. Each scheduled invocation processes up to 10 queued products and refreshes up to 10 Google product statuses. On Hobby, larger queues will therefore take multiple days to drain; use the admin actions for immediate processing. Vercel Pro and Enterprise support more frequent schedules if faster automatic reconciliation is needed.

Configure `CRON_SECRET` in the Vercel production environment. Vercel Cron uses it to authorize the scheduled request; the endpoint rejects requests without a matching bearer token.

## Synchronization behavior

- Product creates/updates and seller approval changes enqueue the listing. Product removals enqueue a deletion; removing/revoking seller approval causes that seller's listings to be removed from Merchant Center.
- Only active, public, non-preorder listings from approved sellers with a title, description, brand, positive price, valid stock value, and HTTPS Cloudinary image are submitted. Listings with no stock are submitted as `OUT_OF_STOCK`.
- Product IDs are stable UUID offer IDs. Repeated insertions update the same Merchant API product input instead of creating duplicates.
- Prices are submitted in the configured currency. The storefront URL is built from `SITE_URL`. Product condition can be set using the `condition` or `product_condition` key in the listing's `specs`; absent a value, it defaults to `NEW`.
- Product input changes are reflected in Merchant Center when the queue worker runs. Google's processed approval/issues are fetched asynchronously and shown in the admin status panel; use **Refresh approvals** for an immediate refresh.
- Transient failures are logged in the database and retried with exponential backoff. After eight attempts a job is marked failed; use **Retry failed** to enqueue it again.

Google may still reject or limit products based on Merchant Center account, website, country, identifier, shipping, tax, or policy requirements. The dashboard displays Google's item-level issues; product synchronization alone does not guarantee approval.

## Local development

The Vercel API route and cron are not served by Vite's development server. Use `vercel dev` with the server environment variables configured to exercise connection and synchronization flows locally. Unit tests for product eligibility, mapping, and approval classification can run with `npm test -- api/_lib/googleMerchant.test.ts`.

## Google API references

- [Merchant API Products overview](https://developers.google.com/merchant/api/guides/products/overview)
- [Create primary API data sources](https://developers.google.com/merchant/api/guides/data-sources/api-sources#create-primary-data-source)
- [List data sources](https://developers.google.com/merchant/api/reference/rest/datasources_v1/accounts.dataSources/list)
- [Create data sources](https://developers.google.com/merchant/api/reference/rest/datasources_v1/accounts.dataSources/create)
- [Add and manage products](https://developers.google.com/merchant/api/guides/products/add-manage)
- [Insert a product input](https://developers.google.com/merchant/api/reference/rest/products_v1/accounts.productInputs/insert)
- [Delete a product input](https://developers.google.com/merchant/api/reference/rest/products_v1/accounts.productInputs/delete)
- [List processed products](https://developers.google.com/merchant/api/reference/rest/products_v1/accounts.products/list)

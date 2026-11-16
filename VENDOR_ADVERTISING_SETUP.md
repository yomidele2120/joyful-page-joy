# Setup guide: vendor advertising, call waiting list, audit log

## 1. Database (Supabase SQL editor, in this order, on STAGING first)
1. `supabase/migrations/20261114090000_vendor_advertising.sql`  (advertising system)
2. `supabase/migrations/20261114120000_call_queue_and_audit.sql` (call waiting list + admin audit log)
Both are safe to re-run. Optional tests (each ends with an exception that says PASSED; everything rolls back):
`supabase/tests/vendor_advertising_test.sql` then `supabase/tests/call_queue_and_audit_test.sql`.

## 2. Secrets (Supabase > Edge Functions > Secrets)
| Name | Needed | Notes |
|---|---|---|
| `OPENAI_API_KEY` | yes, for banners | server only, never a `VITE_` variable |
| `AD_IMAGE_MODEL` | recommended | default `gpt-image-2`, then `gpt-image-1.5` (comma list allowed) |
| `AD_TEXT_MODEL`, `AD_MODERATION_MODEL` | optional | default `gpt-6-luna`; the review model must accept images |
| `AD_IMAGE_QUALITY` | optional | low / medium (default) / high |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | yes | already used for products |
| `AD_WORKER_SECRET` | only for the scheduler | 16+ random characters |

## 3. Deploy
```
supabase functions deploy ad-process-jobs verify-supplier-subscription paystack-webhook
supabase secrets set OPENAI_API_KEY=... AD_IMAGE_MODEL=gpt-image-2 AD_WORKER_SECRET=...
```
Deploy the website to Vercel as usual (new files are under `src/`).

## 4. Optional schedulers (pg_cron + pg_net)
```sql
-- banner worker safety net, every 5 minutes
select cron.schedule('ad-worker', '*/5 * * * *', $$
  select net.http_post(url := 'https://<project-ref>.supabase.co/functions/v1/ad-process-jobs',
    headers := jsonb_build_object('Content-Type','application/json','x-ad-worker-secret','<AD_WORKER_SECRET>'),
    body := '{"max": 2}'::jsonb); $$);
-- call waiting list: let lapsed offers move on even if nobody has the app open
select cron.schedule('call-queue-sweep', '* * * * *', $$ select public.cq_sweep(); $$);
```

## 5. First-run checklist (staging)
1. Admin > Supplier plans: set a price and switch purchase on for Silver; admin > Vendor advertising > Settings: leave "approval" on for the first tests.
2. Pay for Silver as a test vendor (Paystack test mode). Within a minute the vendor's Advertising tab shows a promotion going queued > creating banner > awaiting approval.
3. Admin > Vendor advertising > Campaigns: approve the banner. Open the homepage: the banner shows with a "Sponsored" label and links to the shop.
4. Check an impression and a click appear in the vendor's Performance panel (not for the vendor's own browsing).
5. Add a social link (instagram.com/yourshop); open the shop in a private window: the follow card appears.
6. Calls: with calls switched on, start a call as buyer A to a supplier, then as buyer B: B is placed on the waiting list; end A's call and B is offered the turn.
7. Admin > Audit log: your setting changes appear with old and new values.

## 6. Automatic product pictures (TechHub Operations Limited only)
Run `20261116080000_auto_product_images.sql`, then deploy `auto-product-images` (uses the same `OPENAI_API_KEY`, Cloudinary secrets and `AD_WORKER_SECRET` as the other workers) and schedule it:
```sql
select cron.schedule('auto-product-images', '*/10 * * * *', $$
  select net.http_post(url := 'https://<project-ref>.supabase.co/functions/v1/auto-product-images',
    headers := jsonb_build_object('Content-Type','application/json','x-ad-worker-secret','<AD_WORKER_SECRET>'),
    body := '{"max": 3}'::jsonb); $$);
```
The migration switches the feature on for the one vendor whose store name is exactly "TechHub Operations Limited" (it does nothing if it finds zero or several). Daily cap: `auto_image_settings.daily_limit` (100). To add or remove a vendor: `select admin_set_auto_product_images('<vendor id>', true/false);`.

Broken pictures: run `20261116090000_auto_image_broken_links.sql` and redeploy `auto-product-images`. For switched-on vendors the worker also checks product pictures; a product whose pictures ALL definitely fail to load (404/410, or a web page instead of an image) gets a new AI picture. Unreachable sites are retried later and never cause a replacement.

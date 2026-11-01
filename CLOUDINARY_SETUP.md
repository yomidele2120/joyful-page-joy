# Product photos on Cloudinary

New product photos are stored and delivered by Cloudinary. Supabase keeps the database, sign-in and every product record; it now stores
only the photo **links**. Old Supabase and external links keep working, so the site runs on a mix until you migrate.

## How it works
- **Upload** (Add product, Edit product): the browser shrinks each photo to 1200 px, asks `/api/cloudinary` (action `sign`) for a short-lived signature
  (the server checks the Supabase sign-in and that the caller owns the vendor folder), then sends the photo straight to Cloudinary.
  If any photo fails, nothing is saved and the vendor sees an error and can retry.
- **Where files live:** `marketplace/vendors/<vendor id>/products/<name>`. The folder is what proves ownership.
- **Database:** no new columns. `products.image_url` = main photo, `products.images[]` = the other photos, in order. The Cloudinary
  *public ID* is part of each link (`.../upload/v123/<public id>.jpg`) and is read back from it when needed. `thumb_url` is no longer
  written for Cloudinary photos (cards get a 400 px copy on demand).
- **Display:** `src/lib/cloudinaryUrl.ts` adds `f_auto,q_auto,w_…,c_limit,dpr_auto` to Cloudinary links only: cards 400 px, product
  page 1000 px with a srcset, small lists 160 px. Supabase and external links are returned unchanged.
- **Delete / replace:** the product is saved first; then `/api/cloudinary` (action `delete`) removes the photos it no longer uses. It refuses photos
  that are not in the caller's vendor folder (admins may delete any) and photos any product still references. Old Supabase files are never deleted.
- **Bulk import** (admin): stores chosen images on Cloudinary when the secrets below exist on the edge function; otherwise it keeps the old behaviour.

## Setup (once)
1. Create a Cloudinary account and copy **Cloud name**, **API key**, **API secret** (Dashboard > API Keys).
2. Vercel > Project > Settings > Environment Variables (Production + Preview): `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`,
   `CLOUDINARY_API_SECRET`. Make sure `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` are also set (the API routes use them).
3. Edge function secrets: `supabase secrets set CLOUDINARY_CLOUD_NAME=... CLOUDINARY_API_KEY=... CLOUDINARY_API_SECRET=...`
   then `supabase functions deploy bulk-product-import`.
4. Run `npm install` once so `package-lock.json` picks up the new `cloudinary` dependency, then commit it and redeploy on Vercel.
5. Cloudinary > Settings > Security: leave "Strict transformations" **off** (the site requests resized copies by URL), and optionally restrict
   "Allowed fetch domains" as you like. Optional: set a monthly usage alert.
6. No database migration is needed.

Check your keys locally (Node 20.6+, add the three CLOUDINARY_* lines to `.env` first):
```
npm install
node --env-file=.env scripts/test-cloudinary.mjs
```

`/api/*` only runs on Vercel (or `vercel dev`); plain `npm run dev` cannot upload photos.

## Move existing photos (optional, safe to repeat)
```
npm i --no-save cloudinary
export SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... CLOUDINARY_CLOUD_NAME=... CLOUDINARY_API_KEY=... CLOUDINARY_API_SECRET=...
DRY_RUN=1 node scripts/migrate-images-to-cloudinary.mjs        # look first: nothing is uploaded or changed
LIMIT=20 node scripts/migrate-images-to-cloudinary.mjs         # try a small batch, check the shop
node scripts/migrate-images-to-cloudinary.mjs                  # everything; stop and re-run any time
RETRY_FAILED=1 node scripts/migrate-images-to-cloudinary.mjs   # only products that failed before
ONLY_PRODUCT=<product id> node scripts/migrate-images-to-cloudinary.mjs   # one product
```
- A product changes only when **all** its photos uploaded; the write only applies if the product was not edited meanwhile, and touches only
  `image_url` and `images`. Order and the main photo are kept.
- Originals are never deleted. `scripts/cloudinary-migration-report.csv` lists every old link next to its new one (your rollback list);
  `scripts/cloudinary-migration-state.json` is the resume file (keep it between runs).
- Once the shop looks right, you may later empty the old Supabase bucket yourself to free storage.

## Keep a copy of borrowed and old pictures automatically
Goal: if a picture's original website removes it, your shop still has it.
- **New products (automatic, no setup beyond the Cloudinary keys):** a pasted image link in "Add product" (seller and admin) and bulk-import pictures are copied to
  Cloudinary when the product is saved. If a copy fails, the original link is kept and the product still saves.
- **Pictures already on the site, once:** run the migration script above (`scripts/migrate-images-to-cloudinary.mjs`). It handles every product, extras included.
- **Everything else, continuously (CSV imports, anything added another way):** a scheduled sweep copies up to 20 products per run.
  1. Run `supabase/migrations/20261103090000_image_mirror.sql` in the Supabase SQL editor.
  2. `supabase secrets set IMAGE_MIRROR_CRON_SECRET=<long random string> CLOUDINARY_CLOUD_NAME=... CLOUDINARY_API_KEY=... CLOUDINARY_API_SECRET=...`
     then `supabase functions deploy mirror-product-images`.
  3. Enable the `pg_cron` and `pg_net` extensions, then run once (put your secret in):
     ```sql
     select cron.schedule('mirror-product-images', '*/10 * * * *', $$
       select net.http_post(
         url := 'https://cgyzhkeliomwxwrpmnlh.supabase.co/functions/v1/mirror-product-images',
         headers := '{"Content-Type":"application/json","x-cron-secret":"PUT_IMAGE_MIRROR_CRON_SECRET_HERE"}'::jsonb,
         body := '{}'::jsonb
       ) $$);
     ```
  A product changes only when all its pictures were copied; the write is skipped if the product was edited meanwhile. Pictures that cannot be copied
  (the source is already gone) are remembered in `image_mirror_failures` and retried up to 5 times; see them with `select * from image_mirror_failures;`.
  The sweep looks at products whose main picture is not on Cloudinary yet. Products whose main picture is already there but an extra picture is not are covered by the one-time script.
- A copy is only possible while the original still exists, so run the one-time script soon.

## Known limits
- The rate limit on the API routes is per server instance (best effort). Cloudinary's own account limits are the hard stop.
- Deleting a whole product (supplier or admin delete) does not remove its Cloudinary photos yet, same as before with Supabase Storage.
- Flyers, logos, chat media and videos are not product photos and stay where they are.

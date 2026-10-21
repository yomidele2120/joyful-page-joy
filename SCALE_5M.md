# Scaling to 5 million products (phase 3)

## What changed
- **Thumbnails.** New product photos are saved twice: the full photo (1200 px, for the product page) and a small
  400 px copy stored in the new `products.thumb_url` column. Product cards, the home-page shelves, the hero carousel
  and the admin/supplier tables show the small copy. A page of 24 cards drops from several MB of images to a few hundred KB.
  Products without a thumbnail (all existing ones) keep showing the full photo, so nothing breaks.
- **Admin product list** and **supplier "My products" list** load 25 products at a time, searched and paged by the database
  (before, they downloaded every product and Supabase silently cut it off at 1,000). Admin paging stops at page 200
  (5,000 products); the search box finds anything older.
- **Supplier directory** loads 48 suppliers (search finds the rest) instead of all of them.
- **One name-search index** over all products (`idx_products_name_trgm_all`) replaces the public-only one, so
  admin and supplier searches use an index too. Supplier directory indexes added.
- **Autovacuum tuned for a big table** so the "About 4,998,000" counts and the query planner stay accurate.

## Deploy in this order
1. `20261021090000_product_search_scale.sql`  (if not already run)
2. `20261022090000_catalogue_shelves.sql`
3. `20261023090000_scale_5m.sql`
4. `20261024090000_scale_5m_cleanup.sql`  (phase 4, see below)
5. Deploy the website. **Do this after step 3**: product lists now read `thumb_url`, and show an error until the column exists.
6. Add a product with a photo as a supplier, then check in Storage that `<id>_thumb.jpg` was created, and that /products shows it.
Do not run the old `catalogue_scale.sql`.

## Thumbnails for existing products
Existing products have no thumbnail, so they still load the full 1200 px photo. Two ways to fix that:
- **Backfill script (recommended, one-off cost):** `scripts/backfill-thumbnails.mjs` (instructions at the top of the file).
  It downloads each existing photo, shrinks it to 400 px, uploads it to `vendor-assets/thumbs/` and fills `thumb_url` in
  batches. It can be stopped and re-run. Try `DRY_RUN=1` and then `LIMIT=200` first. Drop `idx_products_needs_thumb` afterwards.
- **Supabase image transformations.** Resizes on the fly with no script, but it needs the Pro plan and is billed per
  distinct image: $5 per 1,000 origin images (100 included). Five million images viewed in a month is roughly $25,000,
  which is why the app creates thumbnails once at upload instead.

## Phase 4: cleanup (20261024090000_scale_5m_cleanup.sql)
- **Four duplicate indexes dropped** (`idx_products_slug`, `idx_products_vendor`, `idx_products_moq`, `idx_products_preorder`).
  Each is replaced by an index that already exists, and each is only dropped if its replacement is there. Fewer indexes means
  faster product inserts and edits and less memory used. The lists were already using the better indexes.
- **Supplier product counts are capped at 10,000** (shown as "10,000+"), so a supplier with a million products no longer slows
  the supplier directory.
- **Thumbnail backfill support:** a helper index and `set_product_thumbnails()` (saves a batch of links in one call,
  service role only).

## Other things that matter at 5 million (not code)
- **Compute size.** Indexes on 5M rows (two text indexes especially) want RAM. Use at least a Medium/Large Supabase compute
  and check the cache hit rate; if the `EXPLAIN` times in `supabase/seed/explain_product_queries.sql` rise, upgrade compute first.
- **Bulk loading.** Drop the two text indexes, load, then recreate them (instructions in the seed file). Loading with them in place is far slower.
- **Index builds on a live table.** Use `CREATE INDEX CONCURRENTLY` (notes at the bottom of each migration).
- **Image storage.** 5M products x two photos is hundreds of GB; check your Storage plan and egress allowance.
- **CDN.** Product photos have a one-year cache header already. Serve the site and images through a CDN.
- **Search engine.** At this size, Typesense/Meilisearch/Algolia gives relevance ranking, typo tolerance and filter counts.
  Postgres search (what is built now) works but cannot do those.

## Still loads everything (next steps)
The admin dashboard's orders, payments, suppliers and users tables are still loaded in full. They are fine for thousands
of rows, not millions; they will need the same paging when order volume grows.
In a supplier's video-post composer, the "tag a product" list shows the supplier's 100 newest products.
The admin "Add product" form still takes an image URL only, so those products get no thumbnail.

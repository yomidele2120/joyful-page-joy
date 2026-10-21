# Fast product lists and search for 1 to 2 million products

## What changed
- **The products list loads one page at a time from the database.** Before, the browser downloaded every product and
  filtered/sorted/paged them itself (and Supabase silently stops at 1,000 rows). Now the database does the search,
  filters (category, price, MOQ, verified suppliers, in stock) and sorting, and sends only the 24 products on screen.
  Same for category pages and supplier shops.
- **Real search.** Word-start matching ("iph 15" finds "iPhone 15 Pro") over name, brand and SKU, backed by a full-text
  index. If nothing starts with the words, it falls back to matching inside words ("phone" finds "iPhone"), backed by a
  trigram index. Typing waits 350 ms before searching.
- **Indexes for the real queries:** newest, per category, per supplier, by price, by MOQ, text search. All are limited to
  public products, so they stay small.
- **Price filtering and sorting happen in the database** using two columns (`price_min`, `price_max`) that are kept up
  to date automatically from the price and quantity price breaks.
- **Counts are estimated for big results** (instant) instead of exact (scans the whole table). Large totals show as "About 1,998,400".
- **Supplier product counts** are counted by the database for just the suppliers on the page.
- **Page limit:** visitors can page through the first 100 pages (2,400 products) of any list. Past that, the site asks
  them to search or filter. Deep paging on millions of rows is slow for the database and not useful for buyers.

## Deploy in this order (the order matters)
1. Run `supabase/migrations/20261021090000_product_search_scale.sql` in the SQL Editor. Do this first: the new website
   code reads the new columns and will show errors until the migration has run.
2. Run `supabase/tests/product_search_test.sql`. Success = the intentional error "ALL PRODUCT SEARCH TESTS PASSED".
3. Deploy the website.
4. Open /products, a category page and a supplier shop. Try search, filters, sorting and paging.

## Measure it with 1 to 2 million products (on a TEST project, never live)
1. Create a separate Supabase project (or a copy), run all the migrations and the demo seed (it needs categories and suppliers).
2. Run `supabase/seed/seed_test_products.sql` once (creates the generator function).
3. From your computer: `export DATABASE_URL='...staging...'` then `bash scripts/seed-test-products.sh 1000000`
   (it asks you to confirm it is a test database). For the fastest load, drop the two text indexes first and recreate
   them afterwards (the instructions are inside the seed file).
4. Run the queries in `supabase/seed/explain_product_queries.sql` one at a time. Every one should use an
   `idx_products_pub_*` index, with lists under about 50 ms and searches under about 150 ms.
5. Open the staging site on a phone connection and try /products. Remove the fake data with the cleanup line in the seed file.

## Known limits (honest list)
- Search covers name, brand and SKU, not descriptions. Results are sorted by your chosen sort (newest by default), not by
  relevance, and there is no typo tolerance ("iphne" finds nothing). A search engine (Typesense, Meilisearch, Algolia) fixes
  this later and also gives filter counts.
- Totals above a few thousand are estimates.
- On a table that already has millions of rows, adding the two generated columns locks the products table while it rewrites
  (about a minute or two per million rows). Run the migration in a quiet period, ideally before the bulk load.
- The migration refreshes `updated_at` on existing products once.
- Still loading everything at once (next steps): the admin dashboard tables, the supplier dashboard's own product list, and the
  supplier directory. Images are still served at full size.
- If a deploy shows "column products.is_public does not exist", the migration has not been run on that database yet.

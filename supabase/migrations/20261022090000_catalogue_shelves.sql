-- =====================================================================
-- CATALOGUE SCALE, PHASE 2: indexes for the home-page shelves and the admin/supplier lists.
-- Builds on 20261021090000_product_search_scale.sql (is_public, price_min/max, search_vector).
-- Replaces the older catalogue_scale.sql: those indexes used is_active and price, but the shop now
-- queries is_public and price_min, so they would never be used. Do NOT run catalogue_scale.sql as well.
-- Safe to run twice. On a table that is already huge, build each index on its own with CONCURRENTLY
-- (see the note at the bottom).
-- =====================================================================

-- Home page and /pay-later shelves: small partial indexes, newest first.
CREATE INDEX IF NOT EXISTS idx_products_pub_featured_newest
  ON public.products (created_at DESC, id DESC) WHERE is_public AND is_featured;
CREATE INDEX IF NOT EXISTS idx_products_pub_bnpl_newest
  ON public.products (created_at DESC, id DESC) WHERE is_public AND bnpl_eligible AND NOT is_preorder;
CREATE INDEX IF NOT EXISTS idx_products_pub_badge_newest
  ON public.products (badge, created_at DESC) WHERE is_public AND badge IS NOT NULL;

-- Open preorders (only a tiny share of products, so this index stays very small).
CREATE INDEX IF NOT EXISTS idx_products_pub_preorder_newest
  ON public.products (created_at DESC, id DESC)
  WHERE is_public AND is_preorder AND preorder_status = 'open';

-- "Low minimum order" shelf: lets the database walk newest-first and stop after 12 matches.
CREATE INDEX IF NOT EXISTS idx_products_pub_moq_newest
  ON public.products (moq, created_at DESC, id DESC) WHERE is_public;

-- Admin pending-preorder review queue.
CREATE INDEX IF NOT EXISTS idx_products_preorder_pending
  ON public.products (created_at DESC) WHERE is_preorder AND NOT preorder_approved;

-- Supplier dashboard (their own list, including inactive) is already covered by
-- idx_products_pub_vendor_newest only for public rows, so add one for all of a supplier's rows.
CREATE INDEX IF NOT EXISTS idx_products_vendor_all_newest
  ON public.products (vendor_id, created_at DESC, id DESC);

-- Admin list (all products, including inactive), newest first.
CREATE INDEX IF NOT EXISTS idx_products_all_newest
  ON public.products (created_at DESC, id DESC);

ANALYZE public.products;

-- NOTE for very large tables: build without blocking writes, one at a time, NOT inside a transaction:
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_pub_featured_newest
--     ON public.products (created_at DESC, id DESC) WHERE is_public AND is_featured;

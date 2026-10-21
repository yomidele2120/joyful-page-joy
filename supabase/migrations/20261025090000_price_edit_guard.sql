-- =====================================================================
-- Suppliers can edit the price of their own products (the products policy already lets them).
-- This adds a database-level safety net so a bad value can never be saved, whatever app sends it.
-- NOT VALID means existing rows are not re-checked (no table scan, no lock for long on a big table);
-- every new insert and edit is checked. Safe to run twice.
-- =====================================================================
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_price_not_negative;
ALTER TABLE public.products ADD CONSTRAINT products_price_not_negative
  CHECK (price >= 0 AND (compare_at_price IS NULL OR compare_at_price >= 0)) NOT VALID;

# Deleting products (supplier and admin)

## What was wrong
- A product that has ever been ordered cannot be erased: every order line points at its product. The database refused,
  but the dashboard ignored the refusal and still said "Product deleted", so the product came back on refresh.
- Delete was one click with no confirmation, one product at a time, and a supplier had no way to hide a product.

## What changed
- **Run `supabase/migrations/20261027090000_product_removal.sql` once** (SQL editor), then `supabase/tests/product_removal_test.sql`
  (success = the intentional error "ALL PRODUCT REMOVAL TESTS PASSED"). Deploy the website after the migration.
- One database function, `remove_my_products`, removes up to 200 products at a time. Never-ordered products are deleted. Ordered
  products are **hidden** instead (they stay in the buyers' order history). A supplier can only remove their own products; an admin any.
- Supplier "My products": tick boxes (and "select all on this page"), a "Delete selected" bar, and a confirmation dialog.
  The message afterwards says exactly what happened ("12 deleted. 2 hidden instead, because buyers have ordered them").
- Hidden products show a "Hidden" tag with a **Show** link to put them back in the shop.
- Admin delete uses the same function, with a confirmation and the same honest message.
- Five indexes were added on columns that point at products, so deleting stays fast on large tables.

## Notes
- Product photos stay in Storage after a delete (small cost, and nothing breaks). A clean-up job can remove them later.
- Selection is per page: it clears when you change page or search.
- To remove thousands at once, use the database (staging/bulk notes in SCALE_5M.md), not the dashboard.

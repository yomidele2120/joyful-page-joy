# Demo products

126 demo products (32 phones, 34 laptops, 60 across 13 other categories) to preview how the shop looks.

1. Deploy the frontend: images live in `public/demo-products/` (3 SVGs per product).
2. Run `supabase/seed/demo_products.sql` in the Supabase SQL editor. It is safe to re-run.
3. To remove everything later, run `supabase/seed/demo_products_cleanup.sql`.

All demo products have SKUs starting with `DEMO-`. The six demo suppliers have placeholder user ids, so chats and
inquiries sent to them go nowhere. Prices, stock, suppliers and specs are illustrative.

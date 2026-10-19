# Sync notes: latest code + commission/analytics/caching work

Base: your latest upload (compliance, Pay later, preorders, captcha, cookie consent).
Merged in (three-way merge against the finance-and-BNPL version both branches grew from):
- Order integrity, shipments, refunds, supplier commission terms, site analytics and traffic tab, Meta Pixel, order-ops tab
- Admin analytics v2 (period comparison, supplier scorecard, shopper drop-off, search insights, CSV export)
- Caching: cache headers, code-splitting, public-data cache, service worker, saved data between visits

## Decisions made while merging
1. **Tracking now waits for cookie consent.** Your latest code has a cookie banner that promises nothing optional loads before a
   choice. Our analytics (needs "analytics") and the Meta Pixel (needs "marketing") now start only after the visitor allows them,
   and stop (and delete the visitor ID) if consent is withdrawn. The Cookie Policy page text was updated to match.
   **Please have the Privacy Policy reviewed for the same two points.**
2. **Checkout:** kept your latest "Preparing secure payment" component and removed the duplicate I had. Purchase tracking, the
   payment warm-up and the sign-in loading fix are kept.
3. **Security header (vercel.json):** your latest rules (captcha, Cloudflare) plus Facebook hosts for the Pixel, plus the cache headers.
4. **Product lists** download only the columns cards need, including the new preorder columns. Specs, gallery, video and SKU load on the product page.
5. **Public cache saves only the visible categories list**, never the admin's list with hidden ones.

## Check these before going live
- **Two migrations share the version 20261017090000** (`order_integrity` and `compliance_preorder_support`). Pasting both into the
  SQL editor is fine, in either order. If you use `supabase db push`, rename one first (for example to 20261017091000).
- **Run in this order:** everything up to 20261016120000 as before, then order_integrity, compliance_preorder_support,
  supplier_commission_terms, legacy_suppliers_free_period, site_analytics, admin_analytics_v2.
- **Test one order end to end** (add to cart, pay, supplier ships, buyer confirms). `create_order` (compliance) and the commission
  trigger (commission terms) were written separately; I read them and they do not overwrite each other, but I could not run them.
- **Two dispute systems now exist:** the new Disputes table with support tickets (Admin > Pay later, preorders and support) and the
  shipment disputes with refunds (Admin > Disputes & refunds). Decide which one customers should use, or merge them.
- Not run here: build, type-check, unit tests, database migrations.

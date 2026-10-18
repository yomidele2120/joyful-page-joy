# Admin analytics v2

## Set up (one step)
Run `supabase/migrations/20261020090000_admin_analytics_v2.sql` in the Supabase SQL editor (or let your migration
tool apply it). It adds four admin-only, read-only functions and three indexes. Until it has run, the Overview shows a
dash for commission and the Analytics tab shows a message saying so. Nothing else breaks.

If your SQL editor cuts the script off, run it one function at a time: each `CREATE OR REPLACE FUNCTION ... $$;` block
plus its `REVOKE` and `GRANT` lines is independent.

## What changed
**Fixes**
- Overview and Earnings no longer multiply revenue by a hard-coded 5%. Commission and the supplier share come from the
  supplier ledger (`order_item_payables`), so they follow each supplier's real rate, the free period and the default
  rate (now 1.5%).
- Totals (orders, products, suppliers, users, revenue) are counted in the database. Before, the browser added up the
  rows it was sent, and it only ever receives the first 1,000 rows of a table.

**Admin > Analytics (rebuilt), with a date range of 7 / 30 / 90 days or 12 months**
- Performance: order value, orders, average order value, commission, new customers, repeat buyers, visit-to-order
  rate and refunds, each with the % change against the previous period of the same length. Also the money still owed
  to suppliers, daily charts, and orders by status.
- Supplier scorecard: sales, commission, shipped within your target (24 / 48 / 72 / 120 hours), average hours to
  ship, overdue shipments, disputes, refunds and a 0-100 health score
  (40% on-time shipping, 40% few disputes, 20% few refunds). Suppliers with fewer than 3 shipments show as
  "too new to score".
- Shoppers & search: carts left behind and checkouts not finished (with the naira value at stake), unpaid orders,
  funnel by device and by source, products left in carts, searches that found nothing, and searches nobody followed up.

**CSV export** on every analytics table, and on the Orders and Payments tabs. Cells that start with `=`, `+`, `-` or
`@` are neutralised so a spreadsheet can't run them as a formula.

**Search result counts.** The shop now records how many products each search returned. "Searches that found
nothing" fills in from the day you deploy this. Older searches have no count.

## Limits worth knowing
- Drop-offs are counted per visit, not per person.
- "Counted" orders are paid, processing, shipped and delivered. Dates use the order's creation time, in Nigerian time.
- The health score is a starting formula, not a verdict. Look at the numbers behind it before acting on a supplier.

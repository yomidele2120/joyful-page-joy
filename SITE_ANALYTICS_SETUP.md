# Site analytics: your own "pixel" (Admin > Traffic)

Everything is recorded in **your own Supabase database**. Nothing is sent to Facebook, Google or anyone else by this feature.

## 1. Switch it on (one time)
1. Run `supabase/migrations/20261019090000_site_analytics.sql` (`supabase db push`, or paste it into the Supabase SQL editor). It creates the `analytics_events` table and two admin-only functions.
2. Deploy the site. There is nothing to configure: recording starts for visitors on the live site.
3. Sign in as admin and open **Traffic** in the dashboard menu (under Dashboard, next to Analytics).

## What you see
- **Visitors, page views, visits** and how many people are on the site right now (last 5 minutes).
- **Orders and order value**: read from your orders table (paid, processing, shipped or delivered), so these are real sales.
- **Visitors and page views per day**, for Today, 7, 30 or 90 days. Days are counted in Nigerian time.
- **Shopping funnel**: how many different visitors viewed a product, added to cart, started checkout, and purchased.
- **Where visitors come from** (facebook, google, whatsapp, direct, ...), **most viewed products**, **what people search for**, **most visited pages**, **devices**.

## What is recorded (and what is not)
Recorded: page views, product views, searches, add to cart, checkout started, purchase, sign-ups (buyer or supplier), inquiries and RFQs. Each has a random visitor id (kept in the browser), a visit id, the page path, device type (phone, tablet, desktop) and where the visit came from.

Not recorded: names, emails, phone numbers, addresses, IP addresses, anything typed into forms (only the search words people search for). Admin, supplier-dashboard, inbox and account pages are never recorded.

Skipped automatically: search-engine and other automated visitors, people with "Do Not Track" turned on, and local development.

## Tracking your Facebook ads
Add tags to the link you use in an ad, for example `https://yoursite.com/?utm_source=facebook&utm_campaign=eid-sale`. The **Where visitors come from** table then shows "facebook" (links with Facebook's own `fbclid` tag are also counted as facebook). The campaign name is stored too.

## How trustworthy are the numbers?
- Visitors are counted per browser, so one person on two devices counts twice, and someone who clears their browser data counts again.
- Ad blockers that block the site's own database calls would hide a visitor; this is rarer than with third-party pixels, but possible.
- Anyone could send fake events to a public site. The database rejects malformed ones, but treat the funnel as a guide. **Sales figures are exact** because they come from the orders table.

## Privacy and the law
This feature stores no personal data, but it does keep a random id in the visitor's browser. Mention it in your privacy policy (for example: "we measure visits on our own site to improve it"). If you advertise or sell in places with strict rules, ask a lawyer whether a notice or consent banner is needed.

## Settings
| Variable | Effect |
|---|---|
| `VITE_ANALYTICS_ENABLED=false` | Switches recording off completely (rebuild and redeploy). |
| `VITE_ANALYTICS_IN_DEV=true` | Records on localhost too, for testing. |

## Keep the table small
Events pile up. Delete anything older than 6 months now and then in the Supabase SQL editor:

```sql
delete from public.analytics_events where created_at < now() - interval '180 days';
```
To do this automatically, enable the `pg_cron` extension in Supabase and schedule that same statement daily.

## Meta Pixel too
The shop reports each event once to both systems (`src/lib/tracking.ts`). The Meta Pixel part is optional and only runs when `VITE_META_PIXEL_ID` is set (see `META_PIXEL_SETUP.md`). Your own analytics cannot replace the Pixel for **running and optimising Facebook ads**: Facebook needs its own Pixel to find buyers and to build retargeting audiences.

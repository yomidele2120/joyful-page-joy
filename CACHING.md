# Caching and loading speed

## 1. Cache headers (`vercel.json`)
- `/assets/*` (built JS and CSS, hashed names): cached for a year, marked immutable.
- `/demo-products/*`, `/brands/*`, favicon, placeholder: cached for a day to a week, refreshed in the background.
- `/sw.js`, `/offline.html` and every page address: always re-checked, so a new deploy reaches visitors at once.

## 2. Code-splitting
Only the home page is in the first download. Every other page loads when visited (`src/lib/lazyPage.ts`). After the home page
settles, the shopping pages (products, product, cart, checkout) are fetched quietly in the background (skipped when the visitor has
Data Saver on). The charts library, Supabase client and React are separate files that browsers keep across deploys. If someone
has the site open during a deploy and a page file has gone, the site reloads once instead of showing a blank screen.

## 3. Short cache for public data (`src/lib/cachePolicy.ts`)
Products and single products: fresh for 5 minutes. Categories: 30 minutes. Counts and supplier directory: 10 minutes. Flyers: 2 minutes.
Product lists no longer download specs, gallery, video or SKU (and skip the long description except on the All Products page).
Hovering or touching a product card starts loading that product page.
Trade-off: a price or stock change can take up to 5 minutes to show for other visitors. The person who made the change sees it at once.

## 4. Service worker (`public/sw.js`)
Built files and site images are kept on the device. Page loads always try the network first; if the visitor is offline they get the
last copy of the app, or `/offline.html`. It ignores everything that is not on your own address (Supabase, Paystack, Klump, video)
and every non-GET request, so prices, orders, payments and sign-in are always live.
Only active in production builds, never inside a preview frame.
**Switch it off:** set `VITE_DISABLE_SW=true` and redeploy. Visitors' devices remove it on their next visit.

## 5. Saved data between visits (`src/lib/queryPersist.ts`)
Public data (products, categories, flyers, directory) is saved in the browser for up to 24 hours, so returning visitors see the page
immediately while fresh data loads. Nothing tied to a signed-in person (orders, wishlist, profile, admin, supplier) is ever saved.
The saved copy is dropped on every new deploy.

## Not done (needs your infrastructure)
A shared server-side cache in front of Supabase (so thousands of visitors share one database read) was not added. Start with the
steps above, and add it only if database load becomes the limit.

## After merging with the cookie-consent work
The saved shop data and offline copy hold only public data and no personal information, so they are listed in the Cookie Policy
under essential storage. Our own analytics and the Meta Pixel are not essential: they wait for the visitor's consent.

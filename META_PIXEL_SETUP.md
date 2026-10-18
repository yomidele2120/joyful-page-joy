# Meta (Facebook) Pixel setup

The Pixel is built in but **switched off until you give it your Pixel ID**.

## 1. Get your Pixel ID
1. Open Meta **Events Manager** (business.facebook.com > Events Manager) and sign in with the account that owns your ads.
2. Connect a data source: choose **Web**, then **Meta Pixel**, name it (for example "MarketHub"), and enter your site address.
3. When asked how to install, pick the manual/"install code yourself" option and just copy the **Pixel ID**: a number about 15 to 16 digits long. You do not need to paste any code, it is already in the project. (Meta changes its menus often; the Pixel ID is also shown on the data source's Overview page.)

## 2. Turn it on
- **Vercel:** Project > Settings > Environment Variables > add `VITE_META_PIXEL_ID` = your Pixel ID (Production), then **redeploy**. The value is built into the site at build time, so changing it needs a new deploy.
- **Local:** copy `.env.example` to `.env` and fill in `VITE_META_PIXEL_ID`.
- Leave it empty to switch the Pixel off (previews and local development send nothing).

## 3. Check that it works
1. Install the **Meta Pixel Helper** extension for Chrome, open your live site: it should show your Pixel with a green tick.
2. In Events Manager > your Pixel > **Test events**, enter your site address and browse: you should see events arrive within a few seconds.

## What is reported

| Event | When |
|---|---|
| PageView | Every page change (the site is a single-page app, so this is tracked on each route) |
| ViewContent | A product page is opened |
| Search | Someone searches (the `?search=` page) |
| AddToCart | "Add to cart" is pressed |
| InitiateCheckout | The checkout page is opened with items in the cart |
| Purchase | Payment is confirmed by the server (Paystack, or Klump when confirmed). Reported once per order. Orders still pending at Klump are not reported |
| CompleteRegistration | A buyer or supplier account is created |
| Lead | A buyer sends an inquiry to a supplier or posts a request for quotation (RFQ) |

Values are in NGN. Purchase value is the order total as saved by the server.

## Privacy
- Only product ids, names, quantities and totals are sent. **No names, emails, phone numbers or addresses.**
- Admin, supplier-dashboard, inbox, inquiries and account pages are never reported.
- Tell visitors you use Meta's Pixel in your privacy policy. Rules on tracking differ by country and by where your ads run, so consider a cookie notice and ask a lawyer if unsure. A consent banner is not included.

## Good to know
- Ad blockers and iPhone privacy settings stop some Pixel events from reaching Meta. For more reliable purchase tracking Meta also offers the **Conversions API** (server-to-server). The Purchase event already sends the order id as its event id, so adding it later will not double-count.
- To change events, edit `src/lib/metaPixel.ts` (what is sent) or the page that calls it.

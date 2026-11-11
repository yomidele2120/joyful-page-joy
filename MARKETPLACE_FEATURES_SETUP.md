# New in this update

1. Run the database update: `supabase/migrations/20261110090000_currency_verification_history_reorder.sql`
   (Supabase > SQL Editor > paste > Run, or `supabase db push`). Safe to run twice.
2. Run `npm install` once (adds `@ffmpeg/ffmpeg` and `@ffmpeg/util`, used to convert chat videos), then redeploy.
3. Admin > "Pay later, preorders and support" > **Currency rates**: type today's Naira price of 1 USD and 1 AED and save.
   The shipped rates are only placeholders. Until you save real rates, check that the currency picker looks right.

| Feature | Where to find it |
|---|---|
| USD / AED display (NGN stays the charged currency) | Currency picker in the top bar; prices on product pages and cards |
| Landed cost calculator | Product page > "Estimate total delivered cost" |
| Quote comparison | My requests (RFQ) > open a request with 2+ quotes |
| Call history (incoming, outgoing, missed) | Menu > Calls, or "Call history" in Messages / Supplier Chat |
| Business verification (documents) | Supplier dashboard > Shop settings > Business verification |
| Admin review of verification | Admin > "Pay later, preorders and support" > Supplier verification |
| Smart reorder suggestions | My orders > "Time to reorder?" |
| Chat videos play on phones | Videos are converted to H.264 before sending; blank/unsupported videos show a Download link |

Notes
- Video conversion runs in the sender's browser (downloads ~30 MB converter the first time it is needed). Files over 150 MB are sent unconverted. Older videos already sent in HEVC/WebM will still not play on some phones.
- Verifying a supplier sets the same "approved" flag the admin already used, so the Verified badge and RFQ access follow from it.

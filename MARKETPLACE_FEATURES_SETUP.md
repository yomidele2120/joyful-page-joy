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

# Subscriptions (Admin > Subscriptions)

Run `supabase/migrations/20261111090000_platform_subscriptions.sql`. It adds:
- **Vercel** and **Supabase**: one year each, started 3 Nov 2026, expiring 3 Nov 2027 (edit the dates on the dashboard if the real dates differ).
- **ZEGOCLOUD**: 10,000 call minutes. Minutes are counted from the moment you run the update (calls made while testing before that are not counted).

How it works
- Every connected call is added to "Used", rounded up to a whole minute. The card shows bought / used / left and the number of calls counted.
- Warnings go to every admin in the notification bell: expiring terms at 30, 14, 7 and 1 day(s) and on expiry; call minutes at 80%, 90%, 95% and when used up. One notification per stage. A red/amber banner also shows on every admin page.
- When the minutes are used up, new calls are refused with "Calling is paused" (switch this off on the card if you prefer calls to continue). After buying more minutes, use "Add minutes". After renewing Vercel or Supabase, save the new expiry date.
- Check your ZEGOCLOUD plan: if it bills each person's minutes separately, turn on "Count both people on a call" (a 3 minute call then uses 6).
- Video and voice are counted the same. ZEGOCLOUD may price video differently, so the dashboard figure is an estimate. Compare it with the ZEGOCLOUD console now and then.
- Warnings are sent when an admin opens the dashboard. To also send them when nobody is logged in, enable the `pg_cron` extension in Supabase and run once:
  `select cron.schedule('subscription-alerts', '0 7 * * *', $$select public.check_subscription_alerts()$$);`

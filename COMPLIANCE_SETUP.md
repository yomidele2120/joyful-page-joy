# Compliance, Pay later, Preorders, Support - setup and status

Read this before going live. **None of this was run against a real database or browser by its author**
(the build environment had no internet). Syntax and imports were checked, unit tests were written but not
executed. Treat the first deployment as a test and work through the checklist at the bottom.

## 1. Deploy in this order

1. **Database first.** Run `supabase/migrations/20261017090000_compliance_preorder_support.sql`
   (it needs the BNPL migration `20261016120000_bnpl.sql` already applied).
   If the SQL editor shows an error, nothing is applied - paste the message back for help.
2. **Then the website.** `npm install && npm run build`, push to GitHub / deploy.
   Deploying the website *before* the migration breaks product lists (they ask for new columns) and
   checkout (it calls the new `create_order`).
3. No new edge functions were added and none changed.
4. Optional: `supabase/seed/preorder_daily.sql` schedules a daily reminder to sellers when a preorder date arrives (needs the `pg_cron` extension).

## 2. Things only you can provide

| What | Where | Why |
|---|---|---|
| Registered company name, CAC number | `src/config/business.ts` | Shown on the legal pages. Until filled in they show as yellow `[... - to be added]` placeholders. |
| Return window (days), refund processing time (working days) | `src/config/business.ts` | Needed by the Return, Refund and Cancellation Policy. |
| Governing law | `src/config/business.ts` | Pre-set to Nigerian law. Confirm with your lawyer. |
| **A lawyer's review of every policy page** | `src/pages/LegalPages.tsx`, `CompanyPages.tsx` | The pages describe how the site actually works and reference Nigerian law (NDPA 2023, FCCPA 2018), but they are templates, not legal advice. Check especially: change-of-mind returns (currently "only where the seller's listing says so"), the "we do not sell your personal data" statement, liability wording, NDPC registration duties, and the preorder cancellation rule. |
| Klump production approval and key | host env `VITE_KLUMP_PUBLIC_KEY` + the Klump secret in your function secrets | Pay later stays hidden until the key is present **and** Finance > Pay later is switched on. |
| Update "Last updated" date | `policiesLastUpdated` in `src/config/business.ts` | Whenever you change a policy. |

## 3. Supabase settings (dashboard)

- **Password reset:** Authentication > URL Configuration > add `https://YOUR-DOMAIN/reset-password` to Redirect URLs, and check the "Reset password" email template.
- **Email verification:** Authentication > Providers > Email > turn on "Confirm email". This needs working email sending (set up custom SMTP, as the built-in sender is heavily limited). Verified email matters before adding Google login.
- **Login rate limits:** Authentication > Rate Limits. Supabase already limits sign-in, sign-up and reset requests; review the numbers.
- **CAPTCHA (optional, recommended):**
  1. Create a Cloudflare Turnstile widget for your domain.
  2. Add `VITE_TURNSTILE_SITE_KEY` to your hosting environment and **deploy the website first**.
  3. Only then, in Supabase > Authentication > Attack Protection, enable CAPTCHA with Turnstile and paste the secret.
  Doing step 3 before step 2 locks everyone out of login. The widget then appears on sign-in, sign-up, supplier sign-up, admin login and forgot-password.
- **Contact form** is protected by a database limit (5 requests/hour per person or email), not CAPTCHA, because a CAPTCHA token can only be verified server-side by an edge function.

## 4. What was built, against your list

| Requirement | Status |
|---|---|
| **1. Cookie consent** | Done. Banner with Accept all / Reject all / Manage preferences (equal prominence), Essential/Analytics/Marketing, saved choice, "Cookie settings" in the footer, Cookie Policy page. The site currently runs **no** analytics or advertising trackers, so the policy says so. If you add one, load it only through `loadScriptWithConsent()` in `src/lib/consent.ts` so it is blocked until consent. Payment scripts (Paystack, Klump) are treated as essential. |
| **2. Legal pages** | Done: Privacy, Terms, Cookie, Shipping and Delivery, Return/Refund/Cancellation, Seller Agreement, BNPL Terms, Preorder Policy, Dispute Resolution, About, Contact, FAQ - all linked in the footer, and cross-linked from checkout, product pages, cart and orders. Business details use your existing footer details; unknown details are placeholders (see section 2). |
| **3A. Pay later** | Done: `/pay-later` landing page (only lists products that are allowed by the seller, inside the amount limits, while Pay later is genuinely on), "Pay later" labels on cards and product pages, eligibility and fee explanation from your Finance settings, clear terms before checkout, order status page. Uses your existing Klump integration. **Not simulated:** approval and instalment schedules live in Klump, so the site shows the order/payment status it knows (started, approved and paid, not completed, failed) and says the plan is shown by Klump. Instalment reminders are sent by Klump, not by us. Failed/abandoned payments now notify the buyer. |
| **3B. Preorders** | Done: `/preorders` page, badges, expected and delivery dates, places left, per-order limit, seller terms, separate preorder orders, tracking under My orders, notifications for confirmation, date changes, availability and approval. **Full payment only:** deposits and remaining payments are **not** offered, because the payment flow takes one Paystack charge per order and the finance ledger assumes an order is either unpaid or fully paid. Adding a balance payment is a separate piece of work. Pay later is blocked on preorders (database rule). |
| **Seller and admin controls** | Sellers: Pay later per product (existing), preorder settings per product (date, delivery estimate, places, per-order limit, terms, open/ready/closed), a Disputes inbox. Admin: new **"Pay later, preorders and support"** tab - section switches, delay-cancellation days, category visibility, product Pay later switches, preorder approval queue, support tickets, disputes, cancellation and refund requests. |
| **4. Security** | Password reset pages (new). Optional Turnstile CAPTCHA (section 3). Sign-in throttle in the browser (convenience only; real limits are Supabase's). Roles and RLS on every new table. **Server-side checks** in `create_order`: prices, MOQ, stock, preorder limits, eligibility and terms acceptance - nothing is trusted from the browser. No secrets in frontend code (only public keys). **Not changed:** email verification (Supabase setting, see section 3). |
| **5. Notifications** | In-app (your existing bell): welcome, order/payment confirmed, preparing, shipped, delivered, cancelled, payment failed, Pay later approved/failed/abandoned, preorder confirmed/date changed/ready/approved, new messages, quotes (already there), disputes, support replies, cancellation/refund decisions, and seller alerts for new/cancelled orders. **Not built:** email or SMS notifications (needs an email provider such as Resend plus an edge function). |
| **6. Marketplace support** | Contact/complaint/report forms (including "report this listing/seller" links), My orders actions (cancel, refund, dispute), seller responses, admin decisions. Seller verification is your existing approval flow; listing rules are in the Seller Agreement. The cart no longer claims "Free shipping": checkout shows goods + VAT and says delivery is arranged with the seller (matches the Shipping Policy). |
| **7. Implementation** | Existing design, auth, messaging, RFQ, flyers, finance kept. Sharp-cornered cards kept; new badges are square. Pages are lazy-loaded. |

## 5. How refunds and cancellations work (important)

Buyers send a **request** (My orders). An admin approves or declines it (Admin > "Pay later, preorders and support" > Cancellations and refunds).
Approving cancels the order, which also reverses the seller's earnings through your existing finance rules.
**The money is not moved by the website:** you send the refund from the Paystack dashboard (or with Klump for Pay later orders), then press "Mark refund as sent" so the buyer is told. Automating Paystack refunds is a possible next step.

## 6. Known limits

- Preorder places are counted from paid orders plus unpaid orders created in the last 60 minutes. Two buyers can still pay for the last place at the same moment; check big preorders.
- The site does not reduce `stock_quantity` when orders are paid (existing behaviour). Preorder limits do not depend on it.
- Preorders and in-stock items cannot share a cart or order (rule enforced in the database).
- Hiding a category hides it from menus and filters; its products can still be opened by direct link.
- Vendor bank details: your `vendors` table is still publicly readable (see the earlier warning). This work does not change that.

## 7. Test checklist (do this on a staging copy first)

1. Run the migration. Open the site: product lists, categories and the footer load.
2. Cookie banner shows on first visit; Reject all hides it and it stays hidden after refresh; footer "Cookie settings" reopens it.
3. Every footer link opens a page; placeholders show where section 2 details are missing.
4. Sign up, then Forgot password: the email link opens `/reset-password`, a new password works.
5. Contact form: submit as a visitor and as a signed-in user; reply as admin; the user sees it.
6. As a seller: add a normal product, then a preorder product (date, 5 places, limit 2). It must NOT appear publicly yet.
7. As admin: approve it. It appears on `/preorders` and the homepage with a badge and "5 places left".
8. As a buyer: try 3 units (should be refused), buy 2 (checkout requires the terms box; paid with card). My orders shows the preorder and date; places left becomes 3.
9. As seller: change the date. The buyer gets a notification. Mark it "Ready". The buyer is notified.
10. Try a cart with a preorder and a normal item: blocked with a clear message.
11. Pay later: with Finance on and Klump key set, an eligible product shows the "Pay later" label and appears on `/pay-later`; a preorder or an out-of-range product does not. Complete a sandbox payment; the order becomes paid; abandon one and check the notification.
12. Request a cancellation as a buyer; approve it as admin; the order shows cancelled and the seller's earnings are reversed (Finance tab).
13. Open a dispute on a paid order; the seller responds; admin resolves; both are notified.
14. Turn off "Show the Pay later section" and "Allow preorders" in the admin tab; links and sections disappear.
15. Run `npm test` (unit tests for consent, sign-in throttle, Pay later rules and quantity pricing).

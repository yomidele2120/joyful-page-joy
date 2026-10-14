# B2B marketplace upgrade - what changed and how to deploy it

Built on top of your VS Code version of the project.

## Deploy in this order (they depend on each other)

1. **Database** - apply `supabase/migrations/20261014090000_b2b_marketplace.sql`
   (`supabase db push`, or paste it into the Supabase SQL editor).
2. **Edge functions** - redeploy `initialize-payment`, `verify-payment`, `paystack-webhook`.
3. **Frontend** - `npm install && npm run build`, then deploy.

Do all three together. After step 1, checkout only works through the new
`create_order` function (direct order inserts are closed on purpose), so the
old frontend can no longer place orders.

## What is new

| Area | Files |
|---|---|
| Header (search scope, RFQ, Messages + unread badge, Inquiry Basket, account menu, DB categories) | `components/layout/Navbar.tsx` |
| Homepage (hero slider + category list, trust strip, carousels, endless feed) | `pages/Index.tsx`, `components/HeroCarousel.tsx`, `TrustStrip.tsx`, `ScrollRow.tsx`, `SupplierCard.tsx` |
| Listing (filters, Product/Supplier tabs, list/grid, pagination) | `pages/Products.tsx` |
| Product page (price tiers, MOQ, quantity, Buy Now, Send Inquiry, Chat Now, specs, video, sticky mobile bar) | `pages/ProductDetail.tsx`, `lib/pricing.ts` |
| Cart / checkout (tier pricing, MOQ enforced) | `contexts/CartContext.tsx`, `pages/Cart.tsx`, `pages/Checkout.tsx` |
| Inquiries + basket | `pages/Inquiries.tsx`, `components/InquiryDialog.tsx`, `hooks/useInquiries.ts`, `contexts/InquiryBasketContext.tsx` |
| RFQ + supplier quotes | `pages/RfqNew.tsx`, `pages/Rfqs.tsx`, `hooks/useRfqs.ts` |
| Chat (one inbox for buyers and vendors, photo/video/voice for everyone, product card on inquiries) | `pages/Messages.tsx`, `components/chat/*`, `hooks/useChat.ts` |
| Vendor dashboard (MOQ, unit, price breaks, specs, extra photos, video, business info) | `pages/SupplierDashboard.tsx` |
| Footer / mobile tab bar | `components/layout/Footer.tsx`, `BottomNav.tsx` |

New routes: `/messages`, `/inquiries`, `/rfq`, `/rfq/new`. The old `/chat?vendor=...` link redirects to `/messages`.
`pages/BuyerChat.tsx` was removed (replaced by `Messages.tsx`).

## Security fixes included

- **Payments:** the browser used to choose the order total, item prices and the amount charged. Orders are now priced on the server (`create_order`), `initialize-payment` reads the amount from the order, and `verify-payment` / the webhook only mark an order paid when Paystack collected at least the order total. Client-supplied Paystack subaccounts are ignored.
- **Chat:** only the recipient can update a message, and only `is_read`. The `chat-media` bucket is private; files are served with short-lived signed URLs (old public links keep working).

## Not done / worth knowing

- This was written without being able to install packages or run the build. Syntax was checked and every import verified, but please run `npm run build` and click through the flows once.
- Supplier storefront page (`/shop/:id`) is not restyled yet (waiting on the storefront screenshots); only its chat link was updated.
- Not built: camera image search and SourcingAI (need an outside service). There is no "Follow" list page, so it is not in the account menu.
- Vendors are not automatically notified about new RFQs; they see them under Quotations > Open requests.
- Not audited: the `vendors` table holds bank account columns. Please confirm its row-level security does not expose them to the public (the new code only selects non-sensitive columns).

## Auth pages + flyers (latest change)

- **Sign in / sign up** (buyer and supplier) now share one look: `components/auth/AuthShell.tsx`.
  Pages: `UserLogin.tsx` (also used by `/auth`; `?mode=signup` opens the create-account form), `SupplierLogin.tsx`, `SupplierSignup.tsx` (still 3 steps).
  Supplier signup now also saves the business type (Starter / Registered) to `vendors.business_type`; the confirm-password field was replaced by the show/hide eye.
  Buyer extras (country, phone, business name, buyer type, resell, marketing consent) are saved in the auth user's metadata.
- **Flyers** live in `lib/flyers.ts` (content) and `components/flyers/` (shapes). Places they appear:
  header top bar (rotating), hero slider, two hero side tiles, banner pair under Verified suppliers, banners after Featured and after New arrivals,
  card-sized + full-width flyers inside the "You may like" feed, and the same two inside the Products listing grid.
  Artwork uses real product photos; with none yet it falls back to an icon.

## Admin-uploaded flyers

**Deploy:** apply `supabase/migrations/20261014120000_flyers.sql` (creates the `flyers` table, its security rules and the public `flyers` image bucket). Then deploy the frontend.

**Use:** sign in as admin, open the dashboard's **Flyers** tab, press **Add flyer**. Choose where it appears, upload the image (and an optional phone-sized image), add an optional link and optional show-from / hide-after dates. Each flyer has an on/off switch and up/down arrows to set the order.

| Spot | Image size | Behaviour |
|---|---|---|
| Hero slider | 1200 x 400 (phone 800 x 400) | all slide in turn; replaces the built-in slides once one is uploaded |
| Hero side tile | 600 x 400 | first 2 shown; an empty tile keeps the built-in one |
| Header strip | 1600 x 80 (phone 800 x 80) | thin banner above the header, several rotate |
| Between product rows | 1600 x 400 (phone 800 x 400) | first 3 shown, one per gap on the homepage |
| Inside product list (wide) | 1600 x 400 (phone 800 x 400) | homepage feed + Products page, used in turn |
| Inside product list (card) | 600 x 900 | card-sized, homepage feed + Products page |

Where a spot has nothing uploaded, the built-in flyer stays. Only admins can upload or change flyers; shoppers only see flyers that are switched on and inside their dates.

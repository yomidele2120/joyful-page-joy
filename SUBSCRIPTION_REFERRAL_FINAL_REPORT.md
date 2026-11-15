# Vendor Subscription and Lifetime Referral System: final report

## Status in one line
Everything in the spec is written. Nothing has been run against a live database, Paystack, Resend or a browser.
Treat it as "ready for staging", not "tested".

## What was checked, and what was not
Checked here:
- Every database function the screens call exists in a migration (scripted name check, all 36 found).
- The new TypeScript files have no undefined names or imports (temporary tsc check; other errors it printed come from the check running without React types and were not investigated).
- SQL was read through for structure only. There was no Postgres here.

NOT checked (do these on a Supabase staging branch before production):
- The three migrations have never been executed. Expect possible syntax or logic errors on first run.
- `supabase/tests/subscription_referral_tests.sql` (14 tests) was written but never run. Run it on the branch after the migrations. It rolls back everything.
- Paystack refund / dispute webhook payload shapes were written from the documented format, not observed.
- No screen has been opened in a browser; mobile layout is unchecked.

## Migrations (run in this order, staging first)
1. 20261115050000_plan_tiers_limits.sql, 20261115060000_plan_category_limits.sql, 20261115070000_plan_catalog.sql, 20261115080000_welcome_email.sql (earlier work, if not yet run)
2. 20261116010000_subscription_pricing.sql
3. 20261116020000_referral_core.sql
4. 20261116030000_referral_wallet.sql
(2-4 are also combined in SUBSCRIPTIONS_REFERRALS_ALL_IN_ONE.sql)

## Tables added
plan_prices, referral_settings, referral_agreements, referral_profiles, referral_payout_accounts, referral_attributions,
referral_commissions, referral_adjustments, referral_withdrawals, referral_rate_changes, referral_audit_logs.
Columns added: vendors.pricing_category_id, supplier_membership_plans.ad_credit_kobo, supplier_membership_payments
(kind, billing_period, pricing_category_id, list_price_kobo, credit_kobo, previous_plan_slug, refunded_at, refund_reason),
ad_wallet_ledger.membership_payment_id.

## Security (RLS and access)
- All referral tables have RLS on. Referrers can read only their own rows; admins can read all. No client can write money tables directly: every write goes through a SECURITY DEFINER function.
- Admin functions check the admin role inside the function. Payment finalising, reversal and commission creation are service-role only.
- Referred suppliers are shown to the referrer by shop name, plan state and join date only. No contact details or money.
- A supplier can set their pricing category once. After that only an admin can change it.
- Self-referral is blocked in the function and by a table trigger. The referrer cannot change after the first qualifying payment.

## Payment and commission workflow
1. Supplier picks a plan and period. The server computes the price (category price, or default, minus prorated credit on upgrades). The browser never sends a price.
2. Paystack checkout. On verify or webhook, the server confirms reference, amount and currency, then in ONE transaction: activates the plan (renewals extend from current expiry), adds the plan's ad credit once, and creates the commission (13% of the verified payment at the rate locked to that supplier). One commission per payment, enforced by a unique key.
3. Commission is held 30 days, then becomes available. An hourly job does the release.
4. Referrer withdraws the whole available balance (minimum N5,000). An admin approves, sends the bank transfer by hand, then marks it paid.
5. Refund or chargeback (Paystack webhook, or the admin Refund button): the subscription ends if it was the newest payment, unspent ad credit is taken back, the commission is reversed. If the commission was already paid out, a debt is recorded and deducted from the referrer's next withdrawal. This is what stops the platform losing money on refunds.
6. Rates: the default applies only to suppliers referred after a change. Changing an existing group's rate is a separate admin action with a required reason; past commissions keep their rate. Every change is logged.

## Files
Database: the four migrations above.
Functions: initialize-supplier-subscription (updated), paystack-webhook (refund/dispute branch), refund-subscription-payment (new), config.toml entry.
Screens: SupplierMembershipTab (updated), ReferralPanel, ReferralLanding (/ref/CODE), RefCapture, SupplierSignup (referral field), SupplierDashboard and UserDashboard (Refer & earn tab), SubscriptionPricingAdmin, ReferralAdminTab, AdminDashboard (wiring), VerifiedSupplierBadge (new names), lib/referral.ts.
Tests: supabase/tests/subscription_referral_tests.sql.

## Decisions I made (change any of them)
Tier names Starter / Growth / Enterprise (diamond retired). Annual prices start at N25,000 / N75,000 / N200,000 as placeholders. 30-day hold. N5,000 minimum. Manual payouts. A refund of the newest payment ends the supplier's paid plan entirely (conservative). Upgrade credit is prorated by unused days.

## Known risks and gaps
- Lifetime commission has legal and tax implications (referrer income tax, platform withholding, consumer terms). Get this reviewed.
- Prices, limits and ad credits are placeholders. Checkout stays off until an admin sets real prices and turns "Purchase enabled" on.
- Pricing category is chosen by the supplier (once); a supplier could pick a cheaper category. An admin can change it, but review category-based prices before using them.
- Affiliate creation needs the person to already have an account.
- Sign-up and password-reset emails still use Supabase's own email sender, not Resend.
- No automated payouts; no per-category UI for plan limits beyond what earlier phases added.
- Two secrets were pasted in this chat earlier (email worker secret). Rotate them.

## Deploy checklist
1. Staging branch: run migrations in order, then the test script. Fix anything that fails.
2. Deploy functions: initialize-supplier-subscription, paystack-webhook, refund-subscription-payment, email-notifications.
3. Deploy the site.
4. Admin: set plan prices, ad credit, switch "Purchase enabled", confirm referral settings.
5. Make one real small test payment, refund it, and confirm the commission reverses.

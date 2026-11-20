-- Lets a platform row have no recorded payment, and removes the Domain name and Paystack rows.
-- Supabase, Vercel and ZegoCloud are NOT here: they come from the existing subscription records (platform_subscriptions).
-- Requires 20261117120000_service_costs_ledger.sql. Safe to run twice.
ALTER TABLE public.service_allocations ALTER COLUMN actual_amount_paid DROP NOT NULL;   -- NULL = not recorded yet
ALTER TABLE public.service_allocations ALTER COLUMN actual_amount_paid DROP DEFAULT;

-- Clean-up in case an earlier draft of this file was already run.
DELETE FROM public.service_allocations WHERE service_key IN ('supabase', 'vercel', 'zegocloud', 'domain', 'paystack');

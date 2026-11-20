-- Adds the other paid platforms to the Subscription & API usage list. Amounts stay empty ("-") until filled in.
-- Supabase, Vercel and ZegoCloud are NOT here: they come from the existing subscription records (platform_subscriptions).
-- Requires 20261117120000_service_costs_ledger.sql. Safe to run twice.
ALTER TABLE public.service_allocations ALTER COLUMN actual_amount_paid DROP NOT NULL;   -- NULL = not recorded yet
ALTER TABLE public.service_allocations ALTER COLUMN actual_amount_paid DROP DEFAULT;

INSERT INTO public.service_allocations (service_key, service_name, currency, billing_months, payment_status, actual_amount_paid, sort_order)
VALUES
  ('domain', 'Domain name', 'NGN', 12, 'Active', NULL, 6),
  ('paystack', 'Paystack', 'NGN', 12, 'Active', NULL, 7)
ON CONFLICT (service_key) DO NOTHING;
-- Clean-up in case an earlier draft of this file was already run.
DELETE FROM public.service_allocations WHERE service_key IN ('supabase', 'vercel', 'zegocloud');

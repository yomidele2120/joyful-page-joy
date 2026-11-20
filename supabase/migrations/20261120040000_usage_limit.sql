-- Optional monthly allowance (for the ZegoCloud minutes bar). Leave NULL to show the count without a bar.
ALTER TABLE public.service_allocations ADD COLUMN IF NOT EXISTS usage_limit numeric;

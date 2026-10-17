-- Run the order housekeeping automatically.
-- First enable the extension: Supabase Dashboard > Database > Extensions > pg_cron > Enable.
-- Without this, abandoned checkouts keep their stock reserved until an admin presses
-- "Expire unpaid orders" in Admin > Disputes & refunds.

SELECT cron.schedule('expire-unpaid-orders', '*/5 * * * *', $$SELECT public.expire_unpaid_orders();$$);
SELECT cron.schedule('release-matured-payables', '0 * * * *', $$SELECT public.release_matured_payables();$$);

-- To stop them later:
--   SELECT cron.unschedule('expire-unpaid-orders');
--   SELECT cron.unschedule('release-matured-payables');

-- Optional: release supplier funds automatically every hour.
-- First enable the extension: Supabase Dashboard > Database > Extensions > pg_cron > Enable.
SELECT cron.schedule(
  'release-matured-payables',
  '0 * * * *',
  $$SELECT public.release_matured_payables();$$
);
-- To stop it later:  SELECT cron.unschedule('release-matured-payables');

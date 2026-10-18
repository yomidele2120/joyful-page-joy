-- Optional: remind sellers once a day when a preorder date has arrived.
-- Needs the pg_cron extension (Supabase > Database > Extensions > pg_cron).
-- Without it, an admin can run:  select public.notify_preorders_due();
select cron.schedule('preorders-due-daily', '0 7 * * *', $$select public.notify_preorders_due();$$);

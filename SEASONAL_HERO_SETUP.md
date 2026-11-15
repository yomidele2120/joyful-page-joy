# Monthly seasonal hero banners

Each month the AI paints five new text-free pictures for the homepage hero (three slider slides, two side tiles). The website draws the
headline, line and button over them. The words come from a fixed, hand-written list in
`supabase/functions/_shared/seasonalHeroCore.ts` (edit that file to change any wording; every line must pass the same safety rules as
vendor ads, and `npx tsx --test supabase/functions/_shared/seasonalHeroCore.test.ts` checks them).

## One-time setup
1. Run `supabase/migrations/20261115010000_seasonal_hero.sql` in the Supabase SQL editor (after the flyers and advertising migrations).
2. Deploy: `npx supabase functions deploy seasonal-hero-generate`
3. Secrets already used by the ad worker are reused: `OPENAI_API_KEY`, `AD_IMAGE_MODEL`, the three `CLOUDINARY_*` keys, `AD_WORKER_SECRET`.
4. Try it: Admin → Flyers → "Seasonal hero banners" → "Make this month's banners". It paints one picture per call and keeps going until
   all five are done (a few minutes), then publishes them.

## Make it automatic
Each call paints one picture, so the schedule calls the function every 10 minutes on the 1st and 2nd of each month. It does nothing once the
month is done, so it costs nothing after that. Replace `<AD_WORKER_SECRET>` with your secret.
```sql
select cron.schedule('seasonal-hero', '*/10 * 1-2 * *', $$
  select net.http_post(
    url := 'https://cgyzhkeliomwxwrpmnlh.supabase.co/functions/v1/seasonal-hero-generate',
    headers := jsonb_build_object('Content-Type','application/json','x-ad-worker-secret','<AD_WORKER_SECRET>'),
    body := '{}'::jsonb, timeout_milliseconds := 170000);
$$);
```
Stop it with `select cron.unschedule('seasonal-hero');`

## How it behaves
- A new set goes live on its own by default (switch "Put new banners live by themselves" off to review first; the set is then saved switched off).
- Live from the 1st (Lagos time) to the 5th of the next month, so a late or failed run never leaves the hero empty. A new set switches last
  month's generated set off. Flyers you uploaded yourself are never changed.
- Every picture goes through the AI safety review before it is kept. If the review cannot run, the picture is not used.
- If setup is wrong (missing key) or too many attempts fail, the run stops, admins get a notification, and last month's banners stay.
- Cost: five images a month. The admin panel shows an estimate, not OpenAI's bill.

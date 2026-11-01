# TikTok for sellers

A seller connects their own TikTok account, ticks which of their TikTok videos to show, and those videos appear in the feed and in their shop's
video grid. Buyers watch them with TikTok's own player (loaded only when tapped).

## What was added
- **Edge function `tiktok`** (`supabase/functions/tiktok`): connect, list videos, choose, remove, refresh, disconnect, and a scheduled refresh.
  TikTok tokens are used only here (service role). They are never sent to a browser or logged.
- **Migration `20261101090000_tiktok_integration.sql`**: TikTok posts are ordinary rows in `posts` with `media_type = 'tiktok'`, so ranking, likes,
  comments, search and the shop grid keep working. Only the server can create them (a trigger blocks sellers from inserting or editing TikTok
  fields), the embed address is locked to `https://www.tiktok.com/embed/v2/<id>`, and tokens sit in a table nobody but the server can read.
- **Website:** "TikTok" panel at the top of Dashboard > Videos (connect / choose videos / refresh / disconnect), the player in the feed
  (`PostMedia.tsx`), a `/tiktok/callback` page, a TikTok tag on shop and dashboard tiles, and `https://www.tiktok.com` allowed in `frame-src`.
- **Covers:** TikTok cover links expire, so when Cloudinary is configured on the function the cover is copied to
  `marketplace/vendors/<vendor>/tiktok/<video id>` and that permanent link is saved. Without Cloudinary the TikTok link is used and the refresh job renews it.

## Do the database part now, switch it on later
1. **Now:** run the three SQL files in order (or the single combined file `TIKTOK_run_in_sql_editor.sql`): `20261101090000_tiktok_integration.sql`,
   `20261102090000_tiktok_auto_import.sql`, `20261104090000_tiktok_feature_switch.sql`. Deploy the website. Nothing changes for anyone: sellers see no TikTok panel,
   and the server refuses TikTok actions, because the admin switch is **off** by default.
2. **When you are ready:** finish the TikTok developer app and add the keys (steps below). Then open **Admin > Marketplace > TikTok for sellers** (the same card is also under *Pay later, preorders and support > Sections and rules*).
   The card shows a three-step checklist (database update, server function deployed, keys set), and tells you which step is missing. Once all three are ticked, switch **Allow sellers to connect TikTok** on. Approved sellers then see the TikTok panel in
   Dashboard > Videos straight away, with no redeploy. Switching it off hides the panel again and stops new connecting and choosing; videos already shown stay,
   and a connected seller can still disconnect.

## Setup, in this order
1. **TikTok developer app** (developers.tiktok.com > Manage apps > Connect an app). Add the products **Login Kit** and **Display API**.
   - Redirect URI (must match exactly, https): `https://techubafrica-nu.vercel.app/tiktok/callback` (also add your real domain if you use one).
   - Scopes: `user.info.basic` and `video.list`.
   - Submit the app for review (TikTok asks for app details, a privacy policy and terms URL, and a short demo video of the flow). Your site already has
     `/privacy-policy` and `/terms`. Until it is approved, TikTok normally lets only accounts you add as test users connect. Check the portal for the current rules.
2. **Run the migrations** (already done if you did the step above).
3. **Secrets**, then deploy:
   ```
   supabase secrets set TIKTOK_CLIENT_KEY=... TIKTOK_CLIENT_SECRET=... TIKTOK_REDIRECT_URI=https://techubafrica-nu.vercel.app/tiktok/callback TIKTOK_CRON_SECRET=<a long random string>
   supabase functions deploy tiktok
   ```
   `TIKTOK_REDIRECT_URI` must be identical to the one in the TikTok portal. For permanent covers also set the three `CLOUDINARY_*` secrets on this function (see CLOUDINARY_SETUP.md).
4. **Deploy the website** (`vercel --prod`) if you have not since the code update.
5. **Switch it on** in the admin dashboard (see above).
6. **Scheduled refresh (optional but recommended).** TikTok access tokens last 24 hours and are renewed automatically when used; this job also adds new videos for sellers in automatic mode, updates titles/covers and removes
   videos a seller deleted on TikTok. Enable the `pg_cron` and `pg_net` extensions (Database > Extensions), then run once, replacing the secret:
   ```sql
   select cron.schedule('tiktok-sync', '0 * * * *', $$
     select net.http_post(
       url := 'https://cgyzhkeliomwxwrpmnlh.supabase.co/functions/v1/tiktok',
       headers := '{"Content-Type":"application/json","x-cron-secret":"PUT_TIKTOK_CRON_SECRET_HERE"}'::jsonb,
       body := '{"action":"sync_all"}'::jsonb
     ) $$);
   ```

## Automatic mode
A seller can switch on **"Automatically show new TikTok videos"** in the TikTok panel. The scheduled job (set it to hourly, as below) then adds new videos from their TikTok, up to 10 per run and 50 in total, so switching it on never floods the feed. A video the seller removes (from Choose videos, the dashboard bin, or because they deleted it on TikTok) is remembered and never added back unless they tick it again. It is off by default, and each seller opts in for their own account. If you have many sellers, the job handles 500 connected shops per run, oldest-refreshed first.

## Rules built in
- Only **approved sellers** can connect. One TikTok account can be linked to one shop only.
- A video can be chosen only if TikTok returns it for the account that seller authorised, so nobody can claim another person's video. Up to 50 videos per shop.
- Only the videos the seller **ticks** are stored (title, hashtags, cover, id). Nothing else is copied from TikTok.
- A refresh that cannot reach TikTok changes nothing. A video removed or made private on TikTok is removed from the feed on the next refresh.
- **Disconnect** revokes access at TikTok and deletes the seller's tokens and TikTok posts here. Nothing is deleted on TikTok.
- If TikTok stops accepting the renewal, the seller sees "Connect again"; their posts stay visible meanwhile.

## Limits
- Playback is TikTok's own embed: TikTok branding, and TikTok may show recommended videos at the end. If TikTok removes a video it stops playing here.
- Likes and comments on the feed post are this marketplace's own, separate from TikTok's.
- Please read TikTok's developer and content guidelines before going live; the review may ask for changes.

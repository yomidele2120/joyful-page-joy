# Video posting: resumable uploads that finish on the server

## What a seller now experiences

1. **Pick a video and leave.** The picked video, caption and linked product are saved on the phone (IndexedDB). Close the
   browser, switch apps, come back tomorrow: the post is restored in the composer ("Your unfinished post was restored").
2. **Tap Publish.** The video is saved on the phone first, then sent in pieces to Cloudflare Stream. If the signal drops
   or the app closes, the next time the seller opens the site (any page) it carries on **from the exact byte it reached**.
   Nothing is sent twice. A card under "Videos" shows the progress.
3. **Once the last byte arrives, the phone is no longer needed.** Cloudflare optimises the video (the "Optimising" step
   now happens on their servers, not in the browser) and tells our server, which publishes the post. This works with the
   app closed or the phone off.
4. **If something goes wrong the seller is told the real reason** (for example "longer than 3 minutes", "could not be read
   as a video") with *Try again* / *Discard*, instead of a generic "Upload failed".

## One-time setup (about 10 minutes)

You need all of it. Without Cloudflare Stream the site falls back to the old way (see "Without Stream" below).

### 1. Run the database change
`supabase/migrations/20261031090000_video_upload_pipeline.sql` adds `processing_status`, `processing_error` and
`duration_seconds` to `posts`. Run `supabase db push`, or paste the file into the Supabase SQL editor.
Existing posts are untouched (they default to `ready`).

### 2. Cloudflare secrets (probably already set if Stream worked before)
In Supabase: Edge Functions > Secrets (or `supabase secrets set`):

| Secret | Value |
| --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | your Cloudflare account id |
| `CLOUDFLARE_STREAM_API_TOKEN` | an API token with **Account > Stream > Edit** |
| `CLOUDFLARE_STREAM_WEBHOOK_SECRET` | from step 4 below |

### 3. Deploy the functions
```
supabase functions deploy create-stream-upload stream-webhook check-stream-post
```
(`supabase/config.toml` already marks the two new ones `verify_jwt = false`, like your other functions. They check the
seller's sign-in or Cloudflare's signature themselves.)

### 4. Tell Cloudflare where to report finished videos
Run this once (replace the two values). A Cloudflare account can have only one Stream webhook.
```
curl -X PUT "https://api.cloudflare.com/client/v4/accounts/<ACCOUNT_ID>/stream/webhook" \
  -H "Authorization: Bearer <STREAM_API_TOKEN>" \
  --data '{"notificationUrl":"https://cgyzhkeliomwxwrpmnlh.supabase.co/functions/v1/stream-webhook"}'
```
The answer contains a `secret`. Save it as `CLOUDFLARE_STREAM_WEBHOOK_SECRET` (step 2), then redeploy `stream-webhook`.

> Without the webhook the system still works, because the site also asks Cloudflare "is it ready?" whenever the seller
> opens the app. But then a video only goes live once the seller opens the site again. The webhook is what makes it
> post by itself while the phone is off.

### 5. Test it
Post a 20 to 30 second video, and in the middle of the upload turn on airplane mode, then turn it off. It should
continue by itself. Then post another one and close the browser right after the card says "Uploaded, optimising": the
post should appear on the feed a minute or two later.

## If posting still fails: where to look
* The failed card now shows the real message. Also check the browser console for `Video upload failed:`.
* Supabase > Edge Functions > `create-stream-upload` > Logs: a `Cloudflare refused 4xx` line means the account id or API
  token is wrong or lacks Stream permission.
* `stream-webhook` logs show `uid=... state=... -> ready/failed`. A `401` means the webhook secret does not match.

## Without Stream (the old route)
If `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_STREAM_API_TOKEN` are not set, `create-stream-upload` answers `501` (the app also
treats "function not deployed" and Cloudflare errors the same way) and it posts through its own Supabase storage instead. That route has to shrink the video on the phone first (screen must stay
on), cannot carry on after the app is closed, and is limited by your Supabase plan (50 MB per file on the free plan).
The seller is told these limits in the error message when they hit them.

## Honest limits
* **A phone that is off cannot send anything.** If it dies mid-upload, the part already sent is kept at Cloudflare and the
  rest is sent when the seller next opens the site on that phone (the video is still saved there, nothing to pick again).
  From the moment the whole file has arrived, the phone is not needed at all.
* The upload carries on after the browser/app is closed only the next time the site is opened. A website cannot keep
  uploading while fully closed. (Android Chrome has an experimental "Background Fetch" feature for that, and a native app
  can use the phone's own background transfer. Neither is included here.)
* If the phone is almost out of storage, the video cannot be saved and the seller is asked to keep the page open.
* iPhones can clear a website's saved data after about 7 days of not using it in Safari.
* Videos over 90 seconds are still refused when picked, and Cloudflare is told 3 minutes as the hard maximum.
* Cloudflare Stream is billed per minute of video stored and delivered.

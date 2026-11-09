# Voice and video calls (ZEGOCLOUD): setup

Buyers can call suppliers, and suppliers can call each other, from the chat (and from a supplier's shop page). Buyers cannot call other buyers.
A call needs an existing chat between the two people ("Send a message first, then you can call").
It rings only while the other person has the website open; otherwise the caller is told, and a "Missed call" line is left in the chat.

## The keys (only two values)
| Value | What it is | Where it goes |
|---|---|---|
| **AppID** (a number) | Public project id | Supabase secret `ZEGO_APP_ID` |
| **ServerSecret** (32 characters) | PRIVATE. Signs login tokens | Supabase secret `ZEGO_SERVER_SECRET` **only**. Never on Vercel, never starting with `VITE_` |

The browser never sees the ServerSecret: it asks the `zego-token` function for a 24-hour login token.
Note: ZEGOCLOUD's console also shows a "Server" URL and a "Callback secret". You do not need them.

## Steps
1. https://console.zegocloud.com > create a project (pick "Call" / UIKits). Copy the **AppID** and **ServerSecret**.
2. In the project's **Services**, make sure both are ON:  **Call/Video Call (UIKits)** and **In-app Chat (ZIM)**.
   ZIM is what makes the phone ring. Without it calls cannot connect.
3. Supabase > SQL editor: run `supabase/migrations/20261108090000_voice_video_calls.sql` once.
4. Supabase > Project Settings > Edge Functions > Secrets: add `ZEGO_APP_ID` and `ZEGO_SERVER_SECRET`.
5. Deploy the function: `supabase functions deploy zego-token`
6. Install the two new packages and commit the updated lock files: `npm install` (they are already listed in package.json).
7. Push to Vercel. Admin > **Voice and video calls** (in the Marketplace group of the left menu) has a new card: three ticks, then switch it on.

## Test it with two accounts (two browsers, or one normal and one private window)
1. Account A (buyer) messages Account B (supplier) so a chat exists. Both stay signed in with the site open.
2. A taps the phone or video icon in the chat header. B should see "Incoming call" and can Accept or Decline.
3. After the call, A's chat shows a line like "Video call · 1:35".
4. Browser asks for camera/microphone permission: allow it.

## Cost and limits
ZEGOCLOUD bills per minute of audio/video and has a free allowance; check their current pricing page before launch.
Built-in limits: 20 calls per hour per person, and after 3 unanswered calls to the same person within 10 minutes further attempts are blocked. Technical failures (calls that could not connect at all) do not count towards the 3, so testing is not penalised.
Abandoned calls (a tab closed mid-call) are tidied automatically the next time that person makes a call.
Calls are logged in the `call_logs` table (who, type, outcome, duration). Admins can read it; nobody can write it directly.

## Call times and history
- Every call is stored in the `call_logs` table with exact times: `created_at` (when it was placed), `answered_at`, `ended_at` and `duration_seconds`, plus who called whom, voice or video, and the outcome.
- In the chat each call appears as a call card (icon, Outgoing/Incoming, the time it started, and how long it lasted), e.g. "Video call - Outgoing - 6:15 PM - 1:35". Missed calls show in red for the person who missed them.

## How it is protected
- The admin switch controls everything: when it is off, no tokens are issued and no buttons show.
- Who may call whom is decided in the database (`start_call`), not in the browser.
- The receiving browser only rings for a call that has a matching, fresh row in `call_logs` (its age is measured by the server, so a wrong phone clock does not matter). A call sent straight through ZEGO that skipped these rules is refused automatically.

## Call alerts when the site is closed (Web Push)
What the caller sees: the moment they tap call, a full-screen "Calling..." screen with a ring-back tone. If the other person's site is
not open, the caller's screen keeps ringing for about 40 seconds and says an alert was sent. If they never open it, the call becomes a
missed call in the chat. What the other person gets: a notification "Incoming voice/video call - NAME is calling you" on their phone or
computer (even with the site closed). Tapping it opens the site, and within a few seconds the call rings on their screen so they can accept.

One-time setup:
1. Make the keys (any computer with Node): `npx web-push generate-vapid-keys`. You get a Public Key and a Private Key.
2. Supabase > SQL editor: run `supabase/migrations/20261109090000_call_push_alerts.sql` once.
3. Supabase > Edge Functions > Secrets: add `VAPID_PUBLIC_KEY` (the public key), `VAPID_PRIVATE_KEY` (the private key, never anywhere else)
   and `VAPID_SUBJECT` (for example `mailto:you@yourdomain.com`).
4. Deploy the function: `npx supabase@latest functions deploy call-push --project-ref YOUR_REF`
5. Vercel > Environment Variables: add `VITE_VAPID_PUBLIC_KEY` = the SAME public key (public keys are safe in the browser), then redeploy the site.
6. Each person taps "Turn on" on the small "Get call alerts" card (shown once to signed-in members) and allows notifications.

Limits to know:
- It is a notification, not a phone ring: the sound is the device's notification sound and vibration. Nothing can play a looping ringtone
  from a closed web page. A true phone-style ring (like WhatsApp) needs a native app with push.
- Android (Chrome, Edge, Samsung Internet) and desktop browsers work. iPhone works only after the site is added to the Home Screen
  (Share > Add to Home Screen) and opened from there once, on iOS 16.4 or newer.
- Delivery depends on the phone: battery saver or "restrict background activity" can delay or block alerts. Delivery is fast but not guaranteed.
- A desktop browser must be running (it can be in the background). A phone with the browser fully closed still gets alerts on Android.
- If the other person has not turned alerts on, nothing can reach them: the caller rings for about 40 seconds, then it is a missed call.
- Each call sends at most one alert, and only the caller of a fresh, still-ringing call can trigger it.

## Known limits
- Use one browser tab or device per account when testing. ZEGO signs an account in once per browser; opening the site in a second tab or on a second device with the SAME account may sign the first one out of calling, so only the newest tab would ring.
- Rings only while the other person's site is open (no phone-style push when the tab is closed). A mobile app with push (ZEGO offline push) is the next step if you need that.
- Group calls are not offered (2 people per call).
- The ringing screens (incoming and "Calling...") are our own WhatsApp-style full-screen design with a ring tone. The in-call screen (video grid, mute and hang-up buttons) is ZEGOCLOUD's own prebuilt screen: we remove the clutter, but its look cannot be fully restyled. A completely custom in-call screen means building on ZEGO's lower-level SDK (a bigger job).
- The ring tone is made by the browser; if a browser blocks sound until the person has tapped the page, the call still rings visually.

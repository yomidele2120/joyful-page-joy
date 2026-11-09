# Voice and video calls (ZEGOCLOUD): setup

Buyers can call suppliers, and suppliers can call each other, from the chat (and from a supplier's shop page). Buyers cannot call other buyers.
A call needs an existing chat between the two people ("Send a message first, then you can call").
It rings only while the other person has the website open; otherwise the caller is told, and a "Missed call" line is left in the chat.

## The keys (only two values)
| Value | What it is | Where it goes |
|---|---|---|
| **AppID** (a number) | Public project id | Vercel: `VITE_ZEGO_APP_ID` (optional, not used by the code) and Supabase secret `ZEGO_APP_ID` (**required**) |
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
Built-in limits: 20 calls per hour per person, and after 3 unanswered calls to the same person within 10 minutes further attempts are blocked.
Calls are logged in the `call_logs` table (who, type, outcome, duration). Admins can read it; nobody can write it directly.

## How it is protected
- The admin switch controls everything: when it is off, no tokens are issued and no buttons show.
- Who may call whom is decided in the database (`start_call`), not in the browser.
- The receiving browser only rings for a call that has a matching row in `call_logs`. A call sent straight through ZEGO that skipped these rules is refused automatically.

## Known limits
- Rings only while the other person's site is open (no phone-style push when the tab is closed). A mobile app with push (ZEGO offline push) is the next step if you need that.
- Group calls are not offered (2 people per call).
- Browser tab titles flash while ringing; there is no ringtone sound yet.

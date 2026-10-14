# Security hardening: what changed and what you must do

## Do these in order

1. **Change the admin password now and delete the old `setup-admin` function.**
   The old code had the admin email and password written in plain text and could be called
   by anyone. It is removed from this project, but the deployed copy keeps running until you
   delete it: Supabase > Edge Functions > `setup-admin` > Delete.
2. **Run the migration.** Supabase > SQL Editor > paste
   `supabase/migrations/20261015090000_security_hardening.sql` > Run.
3. **Deploy this version of the website** (the code now reads bank details and documents
   from the new private table).
4. **Move old verification documents into the private bucket** (one time, from your computer):
   `SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/move-vendor-docs.mjs`
5. **Redeploy the edge functions** that changed: `secure-auth`, `create-subaccount`,
   `initialize-payment`, `paystack-webhook`.
6. **Supabase dashboard settings** (Authentication):
   - Turn OFF "Allow new users to sign up" (so signups must go through reCAPTCHA).
   - Set minimum password length to 8 and require letters and numbers.
   - On a paid plan, enable leaked-password protection.
7. **Turn on the CSP.** `vercel.json` sends `Content-Security-Policy-Report-Only`. Browse the
   whole site (login, checkout, chat, video feed) with the browser console open. If nothing is
   reported as blocked, rename that header to `Content-Security-Policy` to enforce it.

## What was fixed

| Problem | Fix |
|---|---|
| Anyone could read every vendor's bank account details | Moved to the private `vendor_private` table (owner + admin only) |
| Verification documents were in a public bucket | New private `vendor-docs` bucket, admin opens them with 5-minute signed links |
| Any vendor could approve themselves (`is_approved`) | Database trigger blocks it for everyone except admins |
| Unapproved vendors were publicly listed | Only approved vendors are public; owner and admin see their own |
| Every user's phone, address and city were public | Profiles visible only to the owner, admins, chat partners, and vendors who got an inquiry from that buyer |
| Any user could upload into any folder of `vendor-assets` | Uploads limited to your own folder; images only, 10MB cap |
| Hardcoded admin password in `setup-admin` | Function removed |
| Webhook signature compared with a normal string compare | Constant-time compare |
| Payment records created from the browser | Created by the server (service role) |
| Weak passwords (6 characters) | 8+ characters for new accounts |
| No browser security headers | HSTS, nosniff, frame protection, referrer and permissions policies, CSP (report-only first) |

## Not done (recommended next)

- **Two-step login (MFA) for admin accounts.** Supabase supports authenticator-app codes.
- **Restrict CORS** on the edge functions to your real domain instead of `*`.
- **Rate-limit chat, inquiries and RFQ posting** to stop spam from signed-in accounts.

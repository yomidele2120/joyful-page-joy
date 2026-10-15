# Google reCAPTCHA setup

Sign in and sign up now go through the `secure-auth` edge function, which checks the
reCAPTCHA token with Google on the server before touching Supabase Auth.

1. Register a **reCAPTCHA v2, "I'm not a robot" checkbox** key at
   https://www.google.com/recaptcha/admin for your live domain.
2. The live public site key is the component fallback. To override it, set
   `VITE_RECAPTCHA_SITE_KEY` in `.env` and in your hosting provider's environment variables.
3. Put the **secret key** in Supabase: Edge Functions > Secrets > add `RECAPTCHA_SECRET_KEY`.
4. Deploy the function: `supabase functions deploy secure-auth`
   (or paste `supabase/functions/secure-auth/index.ts` into a new function in the dashboard;
   turn "Verify JWT" off for it).
5. Close the back door: Supabase > Authentication > Sign In / Providers > Email, turn OFF
   "Allow new users to sign up". Signups then only work through the function.
6. Redeploy the website.


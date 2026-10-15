# Google reCAPTCHA setup

Sign in and sign up now go through the `secure-auth` edge function, which checks the
reCAPTCHA token with Google on the server before touching Supabase Auth.

1. The app uses the live **reCAPTCHA v2, "I'm not a robot" checkbox** site key in
   `src/components/auth/Recaptcha.tsx` (site keys are public).
2. Add your matching **secret key** to Lovable Cloud function secrets as
   `RECAPTCHA_SECRET_KEY`. The `secure-auth` function reads it with `Deno.env.get`.
3. Deploy the `secure-auth` function and the website after setting the secret.

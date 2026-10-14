// Server-side sign in / sign up gated by Google reCAPTCHA.
//
// The browser sends { action, email, password, captchaToken } here instead of
// calling supabase.auth directly. We verify the token with Google first, then
// sign the user in (or create the account) and hand the session back.
//
// Secrets needed (Supabase dashboard > Edge Functions > Secrets):
//   RECAPTCHA_SECRET_KEY   your Google reCAPTCHA secret key
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided automatically.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

// Only these profile fields may be set from the browser at signup.
const ALLOWED_METADATA = [
  'country', 'phone', 'business_name', 'buyer_type', 'buys_to_resell', 'marketing_opt_in',
];

async function verifyRecaptcha(token: string, ip: string | null): Promise<boolean> {
  const secret = Deno.env.get('RECAPTCHA_SECRET_KEY');
  if (!secret) throw new Error('reCAPTCHA is not configured on the server');
  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set('remoteip', ip);
  const res = await fetch('https://www.google.com/recaptcha/api/siteverify', { method: 'POST', body });
  const data = await res.json();
  return data?.success === true;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    let payload: any;
    try { payload = await req.json(); } catch { return json({ error: 'Invalid request' }, 400); }

    const { action, email, password, fullName, metadata, captchaToken } = payload ?? {};

    if (action !== 'signin' && action !== 'signup') return json({ error: 'Invalid request' }, 400);
    if (typeof email !== 'string' || !email.trim() || email.length > 254) {
      return json({ error: 'A valid email is required' }, 400);
    }
    if (typeof password !== 'string' || !password || password.length > 72) {
      return json({ error: 'Invalid password' }, 400);
    }
    // New accounts need a stronger password. Existing short passwords can still sign in.
    if (action === 'signup' && password.length < 8) {
      return json({ error: 'Password must be at least 8 characters' }, 400);
    }
    if (typeof fullName === 'string' && fullName.length > 120) {
      return json({ error: 'Name is too long' }, 400);
    }
    if (typeof captchaToken !== 'string' || !captchaToken) {
      return json({ error: 'Please complete the reCAPTCHA check and try again.' }, 400);
    }

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
    if (!(await verifyRecaptcha(captchaToken, ip))) {
      return json({ error: 'reCAPTCHA check failed. Please try again.' }, 400);
    }

    const url = Deno.env.get('SUPABASE_URL')!;
    const noSession = { auth: { persistSession: false, autoRefreshToken: false } };

    if (action === 'signup') {
      const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, noSession);

      const safeMeta: Record<string, unknown> = {};
      if (metadata && typeof metadata === 'object') {
        for (const key of ALLOWED_METADATA) if (key in metadata) safeMeta[key] = metadata[key];
      }

      const { error: createError } = await admin.auth.admin.createUser({
        email: email.trim(),
        password,
        email_confirm: true, // the app has email verification turned off
        user_metadata: { full_name: typeof fullName === 'string' ? fullName : '', ...safeMeta },
      });
      if (createError) return json({ error: createError.message }, 400);
    }

    // Sign in (for signup this logs the new user straight in).
    const anon = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, noSession);
    const { data, error } = await anon.auth.signInWithPassword({ email: email.trim(), password });
    if (error || !data.session) return json({ error: error?.message ?? 'Authentication failed' }, 400);

    return json({
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      },
    });
  } catch (err) {
    console.error('secure-auth error:', err);
    return json({ error: 'Something went wrong. Please try again.' }, 500);
  }
});

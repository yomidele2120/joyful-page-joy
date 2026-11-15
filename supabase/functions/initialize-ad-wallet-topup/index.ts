// Starts a Paystack payment that adds money to a supplier's advertising balance.
// The amount is checked against the admin's limits here; the balance changes only after the payment is confirmed server-side.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return reply({ error: 'Method not allowed' }, 405);
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return reply({ error: 'Unauthorized' }, 401);
    const url = Deno.env.get('SUPABASE_URL')!;
    const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(authHeader.replace(/^Bearer\s+/i, ''));
    const userId = claimsData?.claims?.sub;
    const email = claimsData?.claims?.email;
    if (claimsError || !userId) return reply({ error: 'Unauthorized' }, 401);
    if (typeof email !== 'string' || !email.includes('@')) return reply({ error: 'A valid payment email is required' }, 400);

    const body = await req.json().catch(() => ({}));
    const naira = Number(body.amountNaira);
    if (!Number.isInteger(naira) || naira <= 0) return reply({ error: 'Enter a whole amount in naira' }, 400);
    const amountKobo = naira * 100;

    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    const { data: vendor } = await admin.from('vendors').select('id, is_approved').eq('user_id', userId).maybeSingle();
    if (!vendor?.is_approved) return reply({ error: 'An approved supplier account is required' }, 403);

    const { data: s } = await admin.from('ad_wallet_settings').select('enabled, min_topup_kobo, max_topup_kobo').eq('id', true).maybeSingle();
    if (!s?.enabled) return reply({ error: 'Adding advertising funds is switched off right now' }, 409);
    if (amountKobo < Number(s.min_topup_kobo) || amountKobo > Number(s.max_topup_kobo)) {
      return reply({ error: `Enter an amount between ₦${(Number(s.min_topup_kobo) / 100).toLocaleString('en-NG')} and ₦${(Number(s.max_topup_kobo) / 100).toLocaleString('en-NG')}` }, 400);
    }

    const secret = Deno.env.get('PAYSTACK_SECRET_KEY');
    const siteUrl = Deno.env.get('SITE_URL');
    if (!secret || !siteUrl) return reply({ error: 'Paystack or SITE_URL is not configured' }, 500);

    const reference = `itha_wallet_${crypto.randomUUID().replaceAll('-', '')}`;
    const { error: insertError } = await admin.from('ad_wallet_topups').insert({ vendor_id: vendor.id, paystack_reference: reference, amount_kobo: amountKobo, currency: 'NGN', status: 'pending' });
    if (insertError) throw insertError;

    const callback = new URL('/supplier-dashboard', siteUrl);
    callback.searchParams.set('tab', 'advertising');
    callback.searchParams.set('wallet_ref', reference);
    const res = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST', headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, amount: amountKobo, currency: 'NGN', reference, callback_url: callback.toString(), metadata: { payment_type: 'ad_wallet', vendor_id: vendor.id } }),
    });
    const data = await res.json();
    if (!res.ok || !data.status || data.data?.reference !== reference) {
      await admin.from('ad_wallet_topups').update({ status: 'failed' }).eq('paystack_reference', reference).eq('status', 'pending');
      return reply({ error: data.message || 'Paystack could not start this payment' }, 502);
    }
    return reply({ authorization_url: data.data.authorization_url, reference });
  } catch (error) {
    console.error('initialize-ad-wallet-topup error:', error instanceof Error ? error.message : 'unknown');
    return reply({ error: 'Could not start the payment' }, 500);
  }
});

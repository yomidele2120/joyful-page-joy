// Confirms an advertising-balance top-up with Paystack (server to server) and adds it. The browser's "success" is never trusted.
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
    if (claimsError || !userId) return reply({ error: 'Unauthorized' }, 401);

    const { reference } = await req.json().catch(() => ({}));
    if (typeof reference !== 'string' || !/^itha_wallet_[a-f0-9]{32}$/i.test(reference)) return reply({ error: 'Invalid payment reference' }, 400);

    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    const { data: vendor } = await admin.from('vendors').select('id').eq('user_id', userId).maybeSingle();
    const { data: topup } = vendor
      ? await admin.from('ad_wallet_topups').select('id, status').eq('paystack_reference', reference).eq('vendor_id', vendor.id).maybeSingle()
      : { data: null };
    if (!topup) return reply({ error: 'Payment not found' }, 404);
    if (topup.status === 'success') return reply({ success: true });

    const secret = Deno.env.get('PAYSTACK_SECRET_KEY');
    if (!secret) throw new Error('Paystack is not configured');
    const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, { headers: { Authorization: `Bearer ${secret}` } });
    if (!res.ok) throw new Error('Paystack verification request failed');
    const verified = await res.json();
    const charge = verified.data;
    if (!verified.status || charge?.status !== 'success' || charge.reference !== reference) {
      if (charge?.status === 'failed') await admin.from('ad_wallet_topups').update({ status: 'failed' }).eq('id', topup.id).eq('status', 'pending');
      return reply({ error: 'Payment is not confirmed yet' }, 409);
    }
    const { data: ok, error } = await admin.rpc('finalize_ad_wallet_topup', { _reference: reference, _amount_kobo: Number(charge.amount), _currency: String(charge.currency ?? '') });
    if (error) throw error;
    if (!ok) {
      await admin.from('ad_wallet_topups').update({ status: 'failed', status_detail: 'Amount or currency did not match' }).eq('id', topup.id).eq('status', 'pending');
      return reply({ error: 'Payment amount or currency did not match' }, 409);
    }
    return reply({ success: true });
  } catch (error) {
    console.error('verify-ad-wallet-topup error:', error instanceof Error ? error.message : 'unknown');
    return reply({ error: 'Could not verify the payment' }, 500);
  }
});

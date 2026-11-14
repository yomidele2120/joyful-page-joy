// Starts a Paystack payment for an ad boost package. The amount comes from OUR package record, never from the browser.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    if (!UUID.test(String(body.campaignId ?? '')) || !UUID.test(String(body.packageId ?? ''))) return reply({ error: 'Choose a promotion and a package' }, 400);

    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    const { data: vendor } = await admin.from('vendors').select('id, is_approved').eq('user_id', userId).maybeSingle();
    if (!vendor?.is_approved) return reply({ error: 'An approved supplier account is required' }, 403);

    const [{ data: campaign }, { data: pkg }, { data: ent }] = await Promise.all([
      admin.from('vendor_advertising_campaigns').select('id, status, end_date').eq('id', body.campaignId).eq('vendor_id', vendor.id).maybeSingle(),
      admin.from('ad_boost_packages').select('id, name, impressions, price_kobo, currency, is_active').eq('id', body.packageId).maybeSingle(),
      admin.rpc('ad_entitlement', { _vendor_id: vendor.id }),
    ]);
    if (!campaign) return reply({ error: 'Promotion not found' }, 404);
    if (!['active', 'paused', 'pending_review'].includes(campaign.status) || new Date(campaign.end_date) <= new Date()) return reply({ error: 'This promotion is not running, so views cannot be added' }, 409);
    if (!ent?.active) return reply({ error: 'Your advertising plan is not active' }, 409);
    if (!pkg?.is_active || !pkg.price_kobo) return reply({ error: 'This package is not available' }, 409);

    const secret = Deno.env.get('PAYSTACK_SECRET_KEY');
    const siteUrl = Deno.env.get('SITE_URL');
    if (!secret || !siteUrl) return reply({ error: 'Paystack or SITE_URL is not configured' }, 500);

    const reference = `itha_boost_${crypto.randomUUID().replaceAll('-', '')}`;
    const { error: insertError } = await admin.from('ad_boost_payments').insert({
      vendor_id: vendor.id, campaign_id: campaign.id, package_id: pkg.id, package_name: pkg.name, impressions: pkg.impressions,
      paystack_reference: reference, amount_kobo: pkg.price_kobo, currency: pkg.currency, status: 'pending',
    });
    if (insertError) throw insertError;

    const callback = new URL('/supplier-dashboard', siteUrl);
    callback.searchParams.set('tab', 'advertising');
    callback.searchParams.set('boost_ref', reference);
    const res = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST', headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, amount: pkg.price_kobo, currency: pkg.currency, reference, callback_url: callback.toString(),
        metadata: { payment_type: 'ad_boost', vendor_id: vendor.id, campaign_id: campaign.id, package_id: pkg.id } }),
    });
    const data = await res.json();
    if (!res.ok || !data.status || data.data?.reference !== reference) {
      await admin.from('ad_boost_payments').update({ status: 'failed' }).eq('paystack_reference', reference).eq('status', 'pending');
      return reply({ error: data.message || 'Paystack could not start this payment' }, 502);
    }
    return reply({ authorization_url: data.data.authorization_url, reference, amount_kobo: pkg.price_kobo, currency: pkg.currency });
  } catch (error) {
    console.error('initialize-ad-boost error:', error instanceof Error ? error.message : 'unknown');
    return reply({ error: 'Could not start the payment' }, 500);
  }
});

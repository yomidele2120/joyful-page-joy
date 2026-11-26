import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);
    const url = Deno.env.get('SUPABASE_URL')!;
    const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(authHeader.replace(/^Bearer\s+/i, ''));
    const userId = claimsData?.claims?.sub;
    if (claimsError || !userId) return json({ error: 'Unauthorized' }, 401);

    const body = await req.json();
    const planSlug = typeof body.planSlug === 'string' ? body.planSlug : '';
    const months = Number(body.months);
    const selections = Array.isArray(body.selections)
      ? body.selections.map((s: any) => ({ platform: String(s?.platform ?? ''), days_per_month: Number(s?.days_per_month) }))
      : [];

    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    const { data: vendor } = await admin.from('vendors').select('id, is_approved').eq('user_id', userId).maybeSingle();
    if (!vendor || !vendor.is_approved) return json({ error: 'An approved supplier account is required' }, 403);

    const { data: sw } = await admin.from('ad_bundle_settings').select('enabled').eq('id', true).maybeSingle();
    if (!sw?.enabled) return json({ error: 'This purchase option is not available right now' }, 409);

    // Every figure is worked out in the database. Nothing about the amount comes from the browser.
    const { data: quote, error: quoteError } = await admin.rpc('quote_ad_bundle_for_vendor', { _vendor: vendor.id, _plan: planSlug, _months: months, _selections: selections });
    if (quoteError) throw quoteError;
    if (!quote || quote.error) {
      const messages: Record<string, string> = {
        bad_duration: 'Choose 1, 3, 6 or 12 months',
        plan_unavailable: 'This plan is not available for purchase',
        not_offered: 'This plan is not offered for that duration',
        bad_selection: 'Check your advertising choices',
        platform_unavailable: 'One of the chosen ad platforms is not available',
        platform_not_in_tier: 'One of the chosen ad platforms is not included in this plan',
        days_out_of_range: 'The ad days you chose are outside what this plan allows',
        downgrade_not_allowed: 'You cannot move to a lower plan while your current plan is active. You can choose it after it ends.',
      };
      return json({ error: messages[quote?.error] ?? 'This purchase is not available' }, 409);
    }
    const kind = String(quote.kind);
    const credit = Number(quote.credit_kobo ?? 0);

    const paystackSecret = Deno.env.get('PAYSTACK_SECRET_KEY');
    const siteUrl = Deno.env.get('SITE_URL');
    if (!paystackSecret || !siteUrl) return json({ error: 'Paystack or SITE_URL is not configured' }, 500);
    const email = claimsData.claims.email;
    if (typeof email !== 'string' || !email.includes('@')) return json({ error: 'A valid payment email is required' }, 400);

    const total = Number(quote.payable_kobo);
    const listTotal = Number(quote.total_kobo);
    const periodDays = months === 12 ? 365 : months * 30;
    const reference = `itha_sub_${crypto.randomUUID().replaceAll('-', '')}`;

    const { data: payment, error: paymentError } = await admin.from('supplier_membership_payments').insert({
      vendor_id: vendor.id, plan_slug: planSlug, paystack_reference: reference, amount_kobo: total, currency: 'NGN',
      period_days: periodDays, status: 'pending', kind, billing_period: months === 12 ? 'annual' : 'monthly',
      list_price_kobo: listTotal, credit_kobo: credit,
    }).select('id').single();
    if (paymentError) throw paymentError;

    const { error: orderError } = await admin.from('ad_bundle_orders').insert({
      payment_id: payment.id, vendor_id: vendor.id, months, service_kobo: quote.service_net_kobo, credit_kobo: credit, ads_kobo: quote.ads_kobo, lines: quote.lines,
    });
    if (orderError) {
      await admin.from('supplier_membership_payments').update({ status: 'failed' }).eq('id', payment.id).eq('status', 'pending');
      throw orderError;
    }

    const callbackUrl = new URL('/supplier-dashboard?tab=membership', siteUrl).toString();
    const paystackResponse = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: { Authorization: `Bearer ${paystackSecret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email, amount: total, currency: 'NGN', reference, callback_url: callbackUrl,
        metadata: { payment_type: 'supplier_membership', vendor_id: vendor.id, plan_slug: planSlug },
      }),
    });
    const paystackData = await paystackResponse.json();
    if (!paystackResponse.ok || !paystackData.status || paystackData.data?.reference !== reference) {
      await admin.from('supplier_membership_payments').update({ status: 'failed' }).eq('paystack_reference', reference).eq('status', 'pending');
      return json({ error: paystackData.message || 'Paystack could not initialize this payment' }, 502);
    }
    return json({ authorization_url: paystackData.data.authorization_url, reference, amount_kobo: total, currency: 'NGN' });
  } catch (error) {
    console.error('initialize-ad-bundle-subscription error:', error);
    return json({ error: 'Could not start this payment' }, 500);
  }
});

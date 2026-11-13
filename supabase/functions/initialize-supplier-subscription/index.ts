import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const url = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace(/^Bearer\s+/i, '');
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    const userId = claimsData?.claims?.sub;
    if (claimsError || !userId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    if (typeof body.planSlug !== 'string' || !['silver', 'premium'].includes(body.planSlug)) {
      return new Response(JSON.stringify({ error: 'Choose a paid supplier plan' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const [{ data: vendor }, { data: plan }] = await Promise.all([
      admin.from('vendors').select('id, is_approved').eq('user_id', userId).maybeSingle(),
      admin.from('supplier_membership_plans')
        .select('slug, price_kobo, currency, period_days, is_active, purchase_enabled')
        .eq('slug', body.planSlug).maybeSingle(),
    ]);

    if (!vendor || !vendor.is_approved) {
      return new Response(JSON.stringify({ error: 'An approved supplier account is required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!plan?.is_active || !plan.purchase_enabled || !plan.price_kobo || !plan.period_days) {
      return new Response(JSON.stringify({ error: 'This supplier plan is not available for purchase' }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const paystackSecret = Deno.env.get('PAYSTACK_SECRET_KEY');
    const siteUrl = Deno.env.get('SITE_URL');
    if (!paystackSecret || !siteUrl) {
      return new Response(JSON.stringify({ error: 'Paystack or SITE_URL is not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const callbackUrl = new URL('/supplier-dashboard?tab=membership', siteUrl).toString();

    const reference = `itha_sub_${crypto.randomUUID().replaceAll('-', '')}`;
    const email = claimsData.claims.email;
    if (typeof email !== 'string' || !email.includes('@')) {
      return new Response(JSON.stringify({ error: 'A valid payment email is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { error: paymentError } = await admin.from('supplier_membership_payments').insert({
      vendor_id: vendor.id,
      plan_slug: plan.slug,
      paystack_reference: reference,
      amount_kobo: plan.price_kobo,
      currency: plan.currency,
      period_days: plan.period_days,
      status: 'pending',
    });
    if (paymentError) throw paymentError;

    const paystackResponse = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${paystackSecret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        amount: plan.price_kobo,
        currency: plan.currency,
        reference,
        callback_url: callbackUrl,
        metadata: { payment_type: 'supplier_membership', vendor_id: vendor.id, plan_slug: plan.slug },
      }),
    });
    const paystackData = await paystackResponse.json();
    if (!paystackResponse.ok || !paystackData.status || paystackData.data?.reference !== reference) {
      await admin.from('supplier_membership_payments')
        .update({ status: 'failed' }).eq('paystack_reference', reference).eq('status', 'pending');
      return new Response(JSON.stringify({ error: paystackData.message || 'Paystack could not initialize this payment' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      authorization_url: paystackData.data.authorization_url,
      reference,
      amount_kobo: plan.price_kobo,
      currency: plan.currency,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('initialize-supplier-subscription error:', error);
    return new Response(JSON.stringify({ error: 'Could not initialize supplier membership payment' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
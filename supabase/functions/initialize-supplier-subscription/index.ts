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
    if (typeof body.planSlug !== 'string' || !['silver', 'premium', 'gold', 'diamond'].includes(body.planSlug)) {
      return new Response(JSON.stringify({ error: 'Choose a paid supplier plan' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const billingPeriod = body.billingPeriod === 'monthly' ? 'monthly' : 'annual';
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { data: vendor } = await admin.from('vendors').select('id, is_approved').eq('user_id', userId).maybeSingle();

    if (!vendor || !vendor.is_approved) {
      return new Response(JSON.stringify({ error: 'An approved supplier account is required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // The price is worked out in the database from the vendor's own record: plan, period, category and any upgrade credit.
    // Nothing about the amount comes from the browser.
    const { data: quote, error: quoteError } = await admin.rpc('quote_subscription', {
      _vendor: vendor.id, _plan: body.planSlug, _period: billingPeriod,
    });
    if (quoteError) throw quoteError;
    if (!quote || quote.error) {
      const messages: Record<string, string> = {
        plan_unavailable: 'This supplier plan is not available for purchase',
        not_offered: 'This plan is not offered for your category',
        downgrade_not_allowed: 'You cannot move to a lower plan while your current plan is active. You can choose it after it ends.',
        category_required: 'Choose your business category before subscribing',
        bad_period: 'Choose monthly or annual billing',
      };
      return new Response(JSON.stringify({ error: messages[quote?.error] ?? 'This supplier plan is not available for purchase' }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const plan = {
      slug: String(quote.plan_slug), price_kobo: Number(quote.payable_kobo), currency: 'NGN', period_days: Number(quote.period_days),
    };

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
      kind: quote.kind,
      billing_period: billingPeriod,
      pricing_category_id: quote.category_id,
      list_price_kobo: quote.list_price_kobo,
      credit_kobo: quote.credit_kobo,
      previous_plan_slug: quote.previous_plan_slug,
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
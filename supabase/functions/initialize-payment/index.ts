import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }
    const userId = claimsData.claims.sub;

    const { email, orderId, metadata } = await req.json();

    // The amount is NEVER taken from the browser. It comes from the order
    // that create_order() priced on the server, and only for the caller's
    // own order that is still waiting for payment.
    if (!orderId) {
      return new Response(JSON.stringify({ error: 'orderId is required' }), { status: 400, headers: corsHeaders });
    }
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, total, status, user_id')
      .eq('id', orderId)
      .eq('user_id', userId)
      .maybeSingle();
    if (orderError || !order) {
      return new Response(JSON.stringify({ error: 'Order not found' }), { status: 404, headers: corsHeaders });
    }
    if (order.status !== 'pending') {
      return new Response(JSON.stringify({ error: 'This order is not awaiting payment' }), { status: 400, headers: corsHeaders });
    }
    const amount = Number(order.total);
    if (!(amount > 0)) {
      return new Response(JSON.stringify({ error: 'Invalid order total' }), { status: 400, headers: corsHeaders });
    }

    const PAYSTACK_SECRET_KEY = Deno.env.get('PAYSTACK_SECRET_KEY');
    if (!PAYSTACK_SECRET_KEY) {
      return new Response(JSON.stringify({ error: 'Paystack not configured' }), { status: 500, headers: corsHeaders });
    }

    // Build Paystack payload
    const paystackPayload: any = {
      email,
      amount: Math.round(amount * 100), // Paystack expects kobo
      currency: 'NGN',
      reference: `itha_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      callback_url: req.headers.get('origin') || '',
      metadata: {
        ...(metadata && typeof metadata === 'object' ? metadata : {}),
        order_id: orderId,
        user_id: userId,
      },
    };

    // NOTE: split-payment subaccounts must never come from the browser.
    // If vendor splits are enabled later, derive the subaccount from the
    // order's vendor on the server.

    // Initialize transaction with Paystack
    const paystackRes = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(paystackPayload),
    });

    const paystackData = await paystackRes.json();

    if (!paystackData.status) {
      return new Response(JSON.stringify({ error: paystackData.message }), { status: 400, headers: corsHeaders });
    }

    // Create the payment record with the service role: payment rows are only ever
    // written by the server, never by the browser.
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    await adminClient.from('payments').insert({
      order_id: orderId,
      user_id: userId,
      amount,
      currency: 'NGN',
      status: 'pending',
      paystack_reference: paystackData.data.reference,
      transaction_reference: paystackData.data.reference,
    });

    return new Response(JSON.stringify({
      authorization_url: paystackData.data.authorization_url,
      access_code: paystackData.data.access_code,
      reference: paystackData.data.reference,
      amount,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: corsHeaders });
  }
});

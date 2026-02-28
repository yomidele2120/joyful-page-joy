import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

    const { reference } = await req.json();
    const PAYSTACK_SECRET_KEY = Deno.env.get('PAYSTACK_SECRET_KEY');

    // Verify with Paystack
    const verifyRes = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
      headers: { 'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}` },
    });
    const verifyData = await verifyRes.json();

    if (!verifyData.status || verifyData.data.status !== 'success') {
      // Update payment as failed
      await supabase.from('payments')
        .update({ status: 'failed' })
        .eq('paystack_reference', reference);

      return new Response(JSON.stringify({ error: 'Payment verification failed', details: verifyData.data?.gateway_response }), { status: 400, headers: corsHeaders });
    }

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Update payment record
    await adminClient.from('payments')
      .update({
        status: 'success',
        payment_method: verifyData.data.channel,
        metadata: verifyData.data,
      })
      .eq('paystack_reference', reference);

    // Update order status
    const orderId = verifyData.data.metadata?.order_id;
    if (orderId) {
      await adminClient.from('orders')
        .update({ status: 'paid' })
        .eq('id', orderId);
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'Payment verified successfully',
      data: {
        reference: verifyData.data.reference,
        amount: verifyData.data.amount / 100,
        channel: verifyData.data.channel,
        order_id: orderId,
      }
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }
});

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

    // Trust our own payment record, not the metadata echoed back by the
    // client-influenced Paystack payload.
    const callerId = claimsData.claims.sub;
    const { data: paymentRow } = await adminClient.from('payments')
      .select('order_id, user_id')
      .eq('paystack_reference', reference)
      .maybeSingle();

    if (!paymentRow || paymentRow.user_id !== callerId) {
      return new Response(JSON.stringify({ error: 'Payment record not found' }), { status: 404, headers: corsHeaders });
    }

    const orderId = paymentRow.order_id;
    const { data: order } = await adminClient.from('orders')
      .select('id, total, status')
      .eq('id', orderId)
      .maybeSingle();

    // The amount Paystack actually collected must match the order total.
    const paidKobo = Number(verifyData.data.amount);
    const expectedKobo = Math.round(Number(order?.total ?? 0) * 100);
    if (!order || paidKobo < expectedKobo) {
      await adminClient.from('payments')
        .update({ status: 'failed', metadata: verifyData.data })
        .eq('paystack_reference', reference);
      return new Response(JSON.stringify({ error: 'Amount paid does not match the order total' }), { status: 400, headers: corsHeaders });
    }

    await adminClient.from('payments')
      .update({
        status: 'success',
        payment_method: verifyData.data.channel,
        metadata: verifyData.data,
        paystack_fee: Number(verifyData.data.fees ?? 0) / 100,
      })
      .eq('paystack_reference', reference);
    await adminClient.from('payments')
      .update({ paid_at: new Date().toISOString() })
      .eq('paystack_reference', reference)
      .is('paid_at', null);

    const { data: paidResult } = await adminClient.rpc('mark_order_paid', { _order_id: orderId, _method: 'card' });
    if (paidResult !== 'needs_refund') {
      // Money has reached you: supplier earnings on this order can start their hold period.
      await adminClient.from('orders')
        .update({ settled_at: new Date().toISOString() })
        .eq('id', orderId)
        .is('settled_at', null);
    }

    if (paidResult === 'needs_refund') {
      return new Response(JSON.stringify({
        success: false,
        needs_refund: true,
        message: 'Your payment arrived after the reservation expired and the items have since sold out. A full refund has been queued.',
      }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
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
    const message = error instanceof Error ? error.message : 'Internal server error';
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: corsHeaders });
  }
});

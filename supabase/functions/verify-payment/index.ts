import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validatePaystackCharge } from "../_shared/paystackCharge.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: corsHeaders });
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

    const body = await req.json();
    const reference = typeof body?.reference === 'string' ? body.reference.trim() : '';
    if (!/^itha_\d+_[a-z0-9]{6}$/i.test(reference)) {
      return new Response(JSON.stringify({ error: 'Invalid payment reference' }), { status: 400, headers: corsHeaders });
    }
    const callerId = String(claimsData.claims.sub);
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const { data: paymentRow } = await adminClient.from('payments')
      .select('order_id, user_id, amount, currency, status')
      .eq('paystack_reference', reference)
      .maybeSingle();
    if (!paymentRow || paymentRow.user_id !== callerId) {
      return new Response(JSON.stringify({ error: 'Payment record not found' }), { status: 404, headers: corsHeaders });
    }
    if (!['pending', 'success'].includes(paymentRow.status)) {
      return new Response(JSON.stringify({ error: `Payment is ${paymentRow.status}` }), { status: 409, headers: corsHeaders });
    }

    const orderId = paymentRow.order_id;
    const { data: order } = await adminClient.from('orders')
      .select('id, total, status, user_id')
      .eq('id', orderId)
      .eq('user_id', callerId)
      .maybeSingle();
    if (!order || order.user_id !== paymentRow.user_id) {
      return new Response(JSON.stringify({ error: 'Order not found' }), { status: 404, headers: corsHeaders });
    }

    const expectedKobo = Math.round(Number(order.total) * 100);
    const recordedKobo = Math.round(Number(paymentRow.amount) * 100);
    if (!Number.isSafeInteger(expectedKobo) || expectedKobo <= 0 || recordedKobo !== expectedKobo || paymentRow.currency !== 'NGN') {
      await adminClient.from('payments')
        .update({ status: 'review_required', metadata: { reason: 'stored_payment_mismatch', order_id: orderId } })
        .eq('paystack_reference', reference).eq('status', 'pending');
      return new Response(JSON.stringify({ error: 'The payment record does not match this order. Support review is required.' }), { status: 409, headers: corsHeaders });
    }

    const PAYSTACK_SECRET_KEY = Deno.env.get('PAYSTACK_SECRET_KEY');
    if (!PAYSTACK_SECRET_KEY) return new Response(JSON.stringify({ error: 'Paystack is not configured' }), { status: 503, headers: corsHeaders });
    const verifyRes = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` },
    });
    if (!verifyRes.ok) return new Response(JSON.stringify({ error: 'Could not verify payment with Paystack' }), { status: 502, headers: corsHeaders });
    const verifyData = await verifyRes.json();
    const charge = verifyData.data;
    const chargeStatus = typeof charge?.status === 'string' ? charge.status : '';
    if (chargeStatus !== 'success') {
      if (chargeStatus === 'reversed' && ['pending', 'success'].includes(paymentRow.status)) {
        await adminClient.from('payments').update({ status: 'reversed', metadata: charge })
          .eq('paystack_reference', reference).in('status', ['pending', 'success']);
      } else if (['failed', 'abandoned'].includes(chargeStatus) && paymentRow.status === 'pending') {
        await adminClient.from('payments').update({ status: 'failed', metadata: charge })
          .eq('paystack_reference', reference).eq('status', 'pending');
      }
      return new Response(JSON.stringify({ error: `Payment is ${chargeStatus || 'not confirmed'}` }), { status: 409, headers: corsHeaders });
    }

    const validation = verifyData.status === true
      ? validatePaystackCharge(charge, { reference, amountKobo: expectedKobo, currency: 'NGN' })
      : { valid: false as const, reason: 'not_successful' as const };
    if (!validation.valid) {
      if (validation.reason === 'amount_mismatch' || validation.reason === 'currency_mismatch') {
        await adminClient.from('payments').update({ status: 'review_required', metadata: { ...charge, verification_issue: validation.reason } })
          .eq('paystack_reference', reference).eq('status', 'pending');
      }
      return new Response(JSON.stringify({ error: 'Paystack transaction details do not match this order' }), { status: 409, headers: corsHeaders });
    }

    if (paymentRow.status === 'pending') {
      const { data: updated, error: paymentUpdateError } = await adminClient.from('payments')
        .update({ status: 'success', payment_method: charge.channel, metadata: charge, paystack_fee: Number(charge.fees ?? 0) / 100 })
        .eq('paystack_reference', reference).eq('status', 'pending').select('id');
      if (paymentUpdateError) throw paymentUpdateError;
      if (!updated?.length) return new Response(JSON.stringify({ error: 'Payment state changed; verify again' }), { status: 409, headers: corsHeaders });
    }
    await adminClient.from('payments').update({ paid_at: new Date().toISOString() })
      .eq('paystack_reference', reference).eq('status', 'success').is('paid_at', null);

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
        reference: charge.reference,
        amount: Number(charge.amount) / 100,
        channel: charge.channel,
        order_id: orderId,
      }
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: corsHeaders });
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validatePaystackCharge } from "../_shared/paystackCharge.ts";


const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-paystack-signature',
};

// Constant-time string compare so the signature check can't be guessed byte by byte.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const PAYSTACK_SECRET_KEY = Deno.env.get('PAYSTACK_SECRET_KEY')!;
    const body = await req.text();

    // Verify webhook signature
    const signature = req.headers.get('x-paystack-signature');
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(PAYSTACK_SECRET_KEY),
      { name: 'HMAC', hash: 'SHA-512' },
      false,
      ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
    const hash = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');

    if (!signature || !safeEqual(hash, signature)) {
      return new Response('Invalid signature', { status: 401 });
    }

    const event = JSON.parse(body);
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    if (event.event === 'charge.success') {
      const reference = String(event.data?.reference ?? '');
      if (!reference) throw new Error('Paystack success event has no reference');
      const verifyResponse = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
        headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` },
      });
      if (!verifyResponse.ok) throw new Error('Paystack transaction verification failed');
      const verified = await verifyResponse.json();
      const charge = verified.data;
      if (!verified.status || charge?.status !== 'success' || charge.reference !== reference) {
        throw new Error('Paystack transaction is not a matching successful charge');
      }

      const { data: membershipPayment } = await supabase.from('supplier_membership_payments')
        .select('id')
        .eq('paystack_reference', reference)
        .maybeSingle();

      if (membershipPayment) {
        const { data: finalized, error: finalizeError } = await supabase.rpc('finalize_supplier_membership_payment', {
          _reference: reference,
          _amount_kobo: Number(charge.amount),
          _currency: String(charge.currency ?? ''),
        });
        if (finalizeError) throw finalizeError;
        if (!finalized) {
          await supabase.from('supplier_membership_payments')
            .update({ status: 'failed' }).eq('id', membershipPayment.id).eq('status', 'pending');
        }
      }

      // Use our own payment record (created server-side) to find the order,
      // and only mark it paid when the amount collected covers the total.
      const { data: paymentRow } = await supabase.from('payments')
        .select('order_id, user_id, amount, currency, status')
        .eq('paystack_reference', reference)
        .maybeSingle();

      if (paymentRow?.order_id) {
        const { data: order } = await supabase.from('orders')
          .select('id, total, user_id')
          .eq('id', paymentRow.order_id)
          .maybeSingle();

        const expectedKobo = Math.round(Number(order?.total ?? 0) * 100);
        const recordedKobo = Math.round(Number(paymentRow.amount) * 100);
        const validation = order && Number.isSafeInteger(expectedKobo) && expectedKobo > 0
          ? validatePaystackCharge(charge, { reference, amountKobo: expectedKobo, currency: 'NGN' })
          : { valid: false as const, reason: 'amount_mismatch' as const };
        const matchesOrder = order && order.user_id === paymentRow.user_id && paymentRow.currency === 'NGN'
          && recordedKobo === expectedKobo && validation.valid;

        if (matchesOrder && ['pending', 'failed', 'success'].includes(paymentRow.status)) {
          await supabase.from('payments')
            .update({
              status: 'success', payment_method: charge.channel, metadata: charge,
              // Paystack's processing fee (kobo) is kept apart from the order amounts.
              paystack_fee: Number(charge.fees ?? 0) / 100,
            })
            .eq('paystack_reference', reference).in('status', ['pending', 'failed', 'success']);
          // First delivery sets the payment time; a duplicate webhook leaves it alone.
          await supabase.from('payments')
            .update({ paid_at: new Date().toISOString() })
            .eq('paystack_reference', reference)
            .is('paid_at', null);
          // Handles late payments safely: a paid order that already expired is revived if the
          // stock is still there, or flagged "needs_refund" if it has been sold meanwhile.
          const { data: paidResult } = await supabase.rpc('mark_order_paid', { _order_id: order.id, _method: 'card' });
          if (paidResult !== 'needs_refund' && paidResult !== 'already_needs_refund') {
            // Money has reached you: supplier earnings on this order can start their hold period.
            await supabase.from('orders')
              .update({ settled_at: new Date().toISOString() })
              .eq('id', order.id)
              .is('settled_at', null);
          }
        } else {
          await supabase.from('payments')
            .update({ status: 'review_required', metadata: { ...charge, verification_issue: validation.reason } })
            .eq('paystack_reference', reference).in('status', ['pending', 'failed', 'success']);
        }
      }
    }

    if (event.event === 'charge.failed') {
      const reference = String(event.data?.reference ?? '');
      await supabase.from('supplier_membership_payments')
        .update({ status: 'failed' })
        .eq('paystack_reference', reference)
        .eq('status', 'pending');
      await supabase.from('payments')
        .update({ status: 'failed', metadata: event.data })
        .eq('paystack_reference', reference)
        .eq('status', 'pending');
    }

    // Refund results (the refund-order function starts them, Paystack reports back here).
    if (event.event === 'refund.processed' || event.event === 'refund.failed') {
      const d = event.data ?? {};
      const finalStatus = event.event === 'refund.processed' ? 'processed' : 'failed';
      const patch = {
        status: finalStatus,
        processed_at: finalStatus === 'processed' ? new Date().toISOString() : null,
        failure_reason: finalStatus === 'failed' ? (d.status ?? 'Paystack could not complete the refund') : null,
      };
      const ids = [d.id, d.refund_reference].filter((v) => v !== undefined && v !== null).map(String);
      let matched = false;
      if (ids.length) {
        const { data: hit } = await supabase.from('refunds')
          .update(patch).in('paystack_refund_id', ids).eq('status', 'processing').select('id');
        matched = !!hit?.length;
      }
      if (!matched && d.transaction_reference) {
        // Fall back to the payment reference and amount.
        const { data: pay } = await supabase.from('payments')
          .select('order_id').eq('paystack_reference', d.transaction_reference).maybeSingle();
        if (pay?.order_id && d.amount) {
          await supabase.from('refunds').update(patch)
            .eq('order_id', pay.order_id).eq('status', 'processing').eq('amount', Number(d.amount) / 100);
        }
      }
    }

    // Supplier payouts: the transfer reference we send to Paystack is the payout id.
    if (['transfer.success', 'transfer.failed', 'transfer.reversed'].includes(event.event)) {
      const ref = String(event.data?.reference ?? '');
      if (/^[0-9a-f-]{36}$/i.test(ref)) {
        const outcome = event.event === 'transfer.success' ? 'success'
          : event.event === 'transfer.reversed' ? 'reversed' : 'failed';
        await supabase.rpc('finish_payout', {
          _payout_id: ref,
          _outcome: outcome,
          _transfer_code: event.data?.transfer_code ?? null,
          _reason: outcome === 'success' ? null : (event.data?.reason ?? event.event),
        });
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('paystack-webhook error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 });
  }
});

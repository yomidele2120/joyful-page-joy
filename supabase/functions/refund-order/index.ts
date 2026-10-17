// Sends a refund to the buyer through Paystack. Admin only.
//   { refund_id: string }
// The amount, the order and the payment all come from the database, never from the browser.
// Refunds for Klump pay-later orders cannot be sent from here: refund them in the Klump
// dashboard, then use "Mark refunded" in Admin > Disputes & refunds.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return reply({ error: 'Unauthorized' }, 401);

    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: { user }, error: userError } = await db.auth.getUser(authHeader.replace('Bearer ', ''));
    if (userError || !user) return reply({ error: 'Unauthorized' }, 401);
    const { data: roles } = await db.from('user_roles').select('role').eq('user_id', user.id).eq('role', 'admin');
    if (!roles?.length) return reply({ error: 'Admins only' }, 403);

    const KEY = Deno.env.get('PAYSTACK_SECRET_KEY');
    if (!KEY) return reply({ error: 'Paystack not configured' }, 500);

    const body = await req.json().catch(() => ({}));
    const refundId = String(body.refund_id ?? '');
    if (!refundId) return reply({ error: 'refund_id is required' }, 400);

    const { data: refund } = await db.from('refunds').select('*').eq('id', refundId).maybeSingle();
    if (!refund) return reply({ error: 'Refund not found' }, 404);
    if (!['to_process', 'failed'].includes(refund.status)) {
      return reply({ error: `This refund is already ${refund.status}.` }, 409);
    }

    const { data: order } = await db.from('orders').select('id, total').eq('id', refund.order_id).maybeSingle();
    if (!order) return reply({ error: 'Order not found' }, 404);

    // The successful payment we are refunding.
    const { data: payment } = await db.from('payments')
      .select('paystack_reference, payment_method')
      .eq('order_id', order.id).eq('status', 'success')
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (!payment) return reply({ error: 'No successful payment found for this order.' }, 404);
    if (payment.payment_method === 'klump_bnpl' || !payment.paystack_reference) {
      return reply({
        error: 'This order was paid with Klump pay later. Refund it in the Klump dashboard, then press "Mark refunded".',
        code: 'manual_refund',
      }, 400);
    }

    // Never refund more than the buyer paid, counting refunds already sent or in progress.
    const { data: others } = await db.from('refunds').select('amount')
      .eq('order_id', order.id).in('status', ['processing', 'processed']).neq('id', refund.id);
    const already = (others ?? []).reduce((s: number, r: any) => s + Number(r.amount), 0);
    if (already + Number(refund.amount) > Number(order.total) + 0.001) {
      return reply({ error: 'This would refund more than the buyer paid.' }, 400);
    }

    // Claim it so the same refund cannot be sent twice.
    const { data: claimed } = await db.from('refunds')
      .update({ status: 'processing', failure_reason: null })
      .eq('id', refund.id).in('status', ['to_process', 'failed']).select('id');
    if (!claimed?.length) return reply({ error: 'This refund is already being processed.' }, 409);

    let res: any;
    try {
      res = await fetch('https://api.paystack.co/refund', {
        method: 'POST',
        headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transaction: payment.paystack_reference,
          amount: Math.round(Number(refund.amount) * 100),
          merchant_note: String(refund.reason).slice(0, 200),
        }),
      }).then((r) => r.json());
    } catch (_e) {
      // The request may or may not have reached Paystack. Leave it "processing", never retry blindly.
      return reply({ ok: true, status: 'processing', message: 'No answer from Paystack. Check the Paystack dashboard before retrying.' });
    }

    if (!res?.status) {
      const reason = res?.message || 'Paystack rejected the refund';
      await db.from('refunds').update({ status: 'failed', failure_reason: reason }).eq('id', refund.id);
      return reply({ error: reason }, 400);
    }

    const finished = res.data?.status === 'processed';
    await db.from('refunds').update({
      paystack_refund_id: res.data?.id !== undefined && res.data?.id !== null ? String(res.data.id) : null,
      status: finished ? 'processed' : 'processing',
      processed_at: finished ? new Date().toISOString() : null,
    }).eq('id', refund.id);

    return reply({ ok: true, status: finished ? 'processed' : 'processing' });
  } catch (e) {
    console.error('refund-order error:', e);
    return reply({ error: 'Internal server error' }, 500);
  }
});

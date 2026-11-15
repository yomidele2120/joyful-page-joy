// Refunds a supplier subscription payment through Paystack and takes the benefits back. Admin only.
//   { payment_id: string, reason: string }
// The amount refunded is the amount that was actually paid (read from the database). When Paystack accepts the refund, the
// payment is marked refunded, paid entitlements end, unspent ad credit is taken back, and the referral commission is reversed
// (or recorded as a debt if it was already paid out).
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
    const paymentId = String(body.payment_id ?? '');
    const reason = String(body.reason ?? '').trim();
    if (!paymentId || reason.length < 3) return reply({ error: 'payment_id and a reason are required' }, 400);

    const { data: pay } = await db.from('supplier_membership_payments')
      .select('id, paystack_reference, status, amount_kobo').eq('id', paymentId).maybeSingle();
    if (!pay) return reply({ error: 'Payment not found' }, 404);
    if (pay.status !== 'success') return reply({ error: `This payment is ${pay.status}, so it cannot be refunded.` }, 409);

    const refundResponse = await fetch('https://api.paystack.co/refund', {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ transaction: pay.paystack_reference, amount: Number(pay.amount_kobo), merchant_note: reason.slice(0, 200) }),
    });
    const refundData = await refundResponse.json().catch(() => ({}));
    if (!refundResponse.ok || !refundData.status) {
      return reply({ error: refundData.message || 'Paystack could not start this refund' }, 502);
    }

    const { data: result, error } = await db.rpc('reverse_subscription_payment', { _payment_id: pay.id, _new_status: 'refunded', _reason: reason });
    if (error) throw error;
    return reply({ ok: true, result });
  } catch (error) {
    console.error('refund-subscription-payment error:', error);
    return reply({ error: 'Could not refund this subscription payment' }, 500);
  }
});

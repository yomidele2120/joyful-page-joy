import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";


const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-paystack-signature',
};

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

    if (hash !== signature) {
      return new Response('Invalid signature', { status: 401 });
    }

    const event = JSON.parse(body);
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    if (event.event === 'charge.success') {
      const { reference, channel, amount } = event.data;

      // Use our own payment record (created server-side) to find the order,
      // and only mark it paid when the amount collected covers the total.
      const { data: paymentRow } = await supabase.from('payments')
        .select('order_id')
        .eq('paystack_reference', reference)
        .maybeSingle();

      if (paymentRow?.order_id) {
        const { data: order } = await supabase.from('orders')
          .select('id, total')
          .eq('id', paymentRow.order_id)
          .maybeSingle();

        const expectedKobo = Math.round(Number(order?.total ?? 0) * 100);
        if (order && Number(amount) >= expectedKobo) {
          await supabase.from('payments')
            .update({ status: 'success', payment_method: channel, metadata: event.data })
            .eq('paystack_reference', reference);
          await supabase.from('orders')
            .update({ status: 'paid' })
            .eq('id', order.id);
        } else {
          await supabase.from('payments')
            .update({ status: 'failed', metadata: event.data })
            .eq('paystack_reference', reference);
        }
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
});

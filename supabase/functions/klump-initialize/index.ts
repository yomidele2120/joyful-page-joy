// Prepares a Pay later (Klump) checkout for an order the buyer already created with create_order().
// The amount and the item list come from the database, never from the browser. Klump requires whole-naira
// amounts and that the items add up to the amount exactly, so VAT (and the pay-later fee, when the customer
// pays it) are sent as their own lines.
// npm: imports are bundled when the function is deployed, so a cold start does not have to download anything.
import { createClient } from "npm:@supabase/supabase-js@2";
import { klumpName, klumpPhone, klumpUrl } from "../_shared/klump.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    // The checkout page pings this function while the buyer fills in the form, so it is already running
    // (no cold start) when they press the button.
    const peek = await req.clone().json().catch(() => null);
    if (peek?.warmup) return reply({ warm: true });

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return reply({ error: 'Unauthorized' }, 401);
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    // getClaims checks the token locally; getUser made an extra network round trip to the auth server.
    const { data: claimsData, error: claimsError } = await db.auth.getClaims(authHeader.replace('Bearer ', ''));
    const userId = claimsData?.claims?.sub as string | undefined;
    if (claimsError || !userId) return reply({ error: 'Unauthorized' }, 401);

    if (!Deno.env.get('KLUMP_SECRET_KEY')) return reply({ error: 'Pay later is not set up yet (KLUMP_SECRET_KEY is missing on the server).' }, 500);

    const { order_id, customer_name, phone } = peek ?? await req.json();
    if (!order_id) return reply({ error: 'order_id is required' }, 400);

    // The four lookups do not depend on each other, so run them together instead of one after another.
    const [{ data: order }, { data: fs }, { data: lines }, { data: existing }] = await Promise.all([
      db.from('orders').select('id, user_id, email, total, status, payment_method, bnpl_fee').eq('id', order_id).maybeSingle(),
      db.from('finance_settings').select('bnpl_enabled, bnpl_fee_bearer').eq('id', true).maybeSingle(),
      db.from('order_items').select('quantity, price, products(name, image_url, slug)').eq('order_id', order_id),
      db.from('bnpl_transactions').select('status').eq('order_id', order_id).maybeSingle(),
    ]);
    if (!order || order.user_id !== userId) return reply({ error: 'Order not found' }, 404);
    if (order.payment_method !== 'bnpl') return reply({ error: 'This order was not created for Pay later' }, 400);
    if (order.status !== 'pending') return reply({ error: 'This order has already been paid or closed' }, 400);
    if (!fs?.bnpl_enabled) return reply({ error: 'Pay later is not available right now' }, 400);
    if (!lines?.length) return reply({ error: 'Order has no items' }, 400);

    const amount = Math.round(Number(order.total));
    const site = (Deno.env.get('SITE_URL') ?? req.headers.get('origin') ?? '').replace(/\/$/, '');
    const items: Record<string, unknown>[] = lines.map((l: any) => {
      const p = l.products ?? {};
      const it: Record<string, unknown> = { name: String(p.name ?? 'Item').slice(0, 120), unit_price: Math.round(Number(l.price)), quantity: Number(l.quantity) };
      const img = klumpUrl(p.image_url); if (img) it.image_url = img;
      const link = site && p.slug ? klumpUrl(`${site}/product/${p.slug}`) : undefined; if (link) it.item_url = link;
      return it;
    });

    const feeLine = fs.bnpl_fee_bearer === 'customer' ? Math.round(Number(order.bnpl_fee)) : 0;
    const itemsSum = items.reduce((s, i) => s + (i.unit_price as number) * (i.quantity as number), 0);
    const vat = amount - feeLine - itemsSum;     // VAT plus any whole-naira rounding
    if (vat < 0) return reply({ error: 'Could not build the Pay later item list for this order' }, 500);
    if (vat > 0) items.push({ name: 'VAT (7.5%)', unit_price: vat, quantity: 1 });
    if (feeLine > 0) items.push({ name: 'Pay later fee', unit_price: feeLine, quantity: 1 });

    // One Pay later transaction per order: reuse it if the buyer closes the widget and tries again.
    const reference = `order-${order_id}`;
    if (existing?.status === 'successful') return reply({ error: 'This order is already paid' }, 400);
    if (existing) {
      await db.from('bnpl_transactions').update({ status: 'initiated', amount }).eq('order_id', order_id);
    } else {
      const { error: insErr } = await db.from('bnpl_transactions').insert({ order_id, user_id: userId, reference, amount, status: 'initiated' });
      if (insErr) return reply({ error: insErr.message }, 500);
    }

    const nameParts = String(customer_name ?? '').trim().split(/\s+/);
    const data: Record<string, unknown> = {
      amount, shipping_fee: 0, currency: 'NGN', merchant_reference: reference,
      meta_data: { customer: customer_name ?? '', email: order.email, order_id },
      items,
    };
    if (order.email) data.email = order.email;
    const ph = klumpPhone(phone); if (ph) data.phone = ph;
    const fn = klumpName(nameParts[0]); if (fn) data.first_name = fn;
    const ln = klumpName(nameParts.slice(1).join(' ')); if (ln) data.last_name = ln;
    return reply({ reference, amount, data });
  } catch (e) {
    return reply({ error: e instanceof Error ? e.message : 'Internal server error' }, 500);
  }
});

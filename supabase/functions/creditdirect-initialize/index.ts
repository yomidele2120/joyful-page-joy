// Starts a Pay later checkout with Credit Direct for an order the buyer already created with create_order().
// Amount and items come from the database, never from the browser. Credit Direct answers with a hosted checkout
// link and the browser is sent there; it comes back to /pay-later/return, which calls creditdirect-verify.
//
// Also answers two small calls: { warmup: true } (keeps the function awake) and { status: true } (admin only:
// are the Credit Direct secrets set on the server? used by the admin Finance > Settings page).
import { createClient } from "npm:@supabase/supabase-js@2";
import { buildCreateBody, createSession, loadCreditDirectConfig, ngPhone } from "../_shared/creditdirect.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const isHttpUrl = (v: unknown) => typeof v === 'string' && /^https?:\/\/[^\s]+$/.test(v);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const peek = await req.clone().json().catch(() => null);
    if (peek?.warmup) return reply({ warm: true });

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return reply({ error: 'Unauthorized' }, 401);
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: claimsData, error: claimsError } = await db.auth.getClaims(authHeader.replace('Bearer ', ''));
    const userId = claimsData?.claims?.sub as string | undefined;
    if (claimsError || !userId) return reply({ error: 'Unauthorized' }, 401);

    const cfgResult = loadCreditDirectConfig((k) => Deno.env.get(k));

    // Admin-only readiness check (never reveals any secret value, only names).
    if (peek?.status) {
      const { data: isAdmin } = await db.rpc('has_role', { _user_id: userId, _role: 'admin' });
      if (!isAdmin) return reply({ error: 'Admins only' }, 403);
      return reply({ configured: !!cfgResult.config, missing: cfgResult.missing, problems: cfgResult.problems });
    }

    if (!cfgResult.config) {
      console.error('creditdirect-initialize: not configured', cfgResult.missing, cfgResult.problems);
      return reply({ error: 'Pay later with Credit Direct is not set up yet. Please pay by card or try again later.' }, 503);
    }
    const cfg = cfgResult.config;

    const { order_id, customer_name, phone } = peek ?? await req.json();
    if (!order_id) return reply({ error: 'order_id is required' }, 400);

    const [{ data: order }, { data: fs }, { data: lines }, { data: existing }] = await Promise.all([
      db.from('orders').select('id, user_id, email, total, status, payment_method, bnpl_fee').eq('id', order_id).maybeSingle(),
      db.from('finance_settings').select('bnpl_enabled, bnpl_provider, bnpl_fee_bearer').eq('id', true).maybeSingle(),
      db.from('order_items').select('quantity, price, products(name, image_url, slug)').eq('order_id', order_id),
      db.from('bnpl_transactions').select('status, provider').eq('order_id', order_id).maybeSingle(),
    ]);
    if (!order || order.user_id !== userId) return reply({ error: 'Order not found' }, 404);
    if (order.payment_method !== 'bnpl') return reply({ error: 'This order was not created for Pay later' }, 400);
    if (order.status !== 'pending') return reply({ error: 'This order has already been paid or closed' }, 400);
    if (!fs?.bnpl_enabled) return reply({ error: 'Pay later is not available right now' }, 400);
    // The admin picks one provider at a time; a stale checkout tab must not start the other one.
    if (fs.bnpl_provider !== 'creditdirect') return reply({ error: 'Pay later is now provided by a different partner. Please refresh the checkout page.' }, 409);
    if (!lines?.length) return reply({ error: 'Order has no items' }, 400);
    if (existing?.status === 'successful') return reply({ error: 'This order is already paid' }, 400);

    const amount = Math.round(Number(order.total));
    const site = (Deno.env.get('SITE_URL') ?? req.headers.get('origin') ?? '').replace(/\/$/, '');
    if (!isHttpUrl(site)) return reply({ error: 'SITE_URL is not set on the server, so Credit Direct cannot send the buyer back.' }, 500);

    const items = lines.map((l: any) => {
      const p = l.products ?? {};
      return {
        name: String(p.name ?? 'Item').slice(0, 120),
        unitPriceNaira: Math.round(Number(l.price)),
        quantity: Number(l.quantity),
        imageUrl: isHttpUrl(p.image_url) ? p.image_url : undefined,
        itemUrl: p.slug ? `${site}/product/${p.slug}` : undefined,
      };
    });
    // The items must add up to the amount exactly, so VAT (and the fee when the customer pays it) are their own lines.
    const feeLine = fs.bnpl_fee_bearer === 'customer' ? Math.round(Number(order.bnpl_fee)) : 0;
    const itemsSum = items.reduce((s, i) => s + i.unitPriceNaira * i.quantity, 0);
    const vat = amount - feeLine - itemsSum;
    if (vat < 0) return reply({ error: 'Could not build the Pay later item list for this order' }, 500);
    if (vat > 0) items.push({ name: 'VAT (7.5%)', unitPriceNaira: vat, quantity: 1, imageUrl: undefined, itemUrl: undefined });
    if (feeLine > 0) items.push({ name: 'Pay later fee', unitPriceNaira: feeLine, quantity: 1, imageUrl: undefined, itemUrl: undefined });

    // One Pay later transaction per order; reuse it if the buyer comes back and tries again.
    const reference = `order-${order_id}`;
    if (existing) {
      const { error: upErr } = await db.from('bnpl_transactions')
        .update({ status: 'initiated', amount, provider: 'creditdirect' }).eq('order_id', order_id);
      if (upErr) return reply({ error: upErr.message }, 500);
    } else {
      const { error: insErr } = await db.from('bnpl_transactions')
        .insert({ order_id, user_id: userId, reference, amount, status: 'initiated', provider: 'creditdirect' });
      if (insErr) return reply({ error: insErr.message }, 500);
    }

    const nameParts = String(customer_name ?? '').trim().split(/\s+/);
    const created = await createSession(cfg, buildCreateBody({
      orderId: order_id, reference, amountNaira: amount, items,
      customer: {
        name: String(customer_name ?? '').trim() || undefined,
        firstName: nameParts[0]?.length >= 2 ? nameParts[0] : undefined,
        lastName: nameParts.slice(1).join(' ').length >= 2 ? nameParts.slice(1).join(' ') : undefined,
        email: order.email ?? undefined,
        phone: ngPhone(phone),
      },
      callbackUrl: `${site}/pay-later/return?order=${order_id}`,
    }, cfg));

    if (!created.ok) {
      console.error('creditdirect-initialize failed:', created.error);
      await db.from('bnpl_transactions').update({ status: 'failed', raw_verify: created.json ?? null }).eq('order_id', order_id).eq('status', 'initiated');
      return reply({ error: 'Credit Direct could not start this payment. Please try again or pay by card.' }, 502);
    }
    await db.from('bnpl_transactions').update({ checkout_url: created.checkoutUrl }).eq('order_id', order_id);
    return reply({ reference, amount, checkout_url: created.checkoutUrl });
  } catch (e) {
    console.error('creditdirect-initialize error:', e);
    return reply({ error: e instanceof Error ? e.message : 'Internal server error' }, 500);
  }
});

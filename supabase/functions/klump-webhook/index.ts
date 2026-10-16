// Receives Klump's transaction events. A webhook is only treated as a hint: for a "successful" event we
// call Klump's verify API ourselves (authenticated with our secret key) before marking anything paid.
// Always answers 200 quickly so Klump does not keep retrying for 72 hours.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { candidateReferences, collectStrings, evaluateVerification, fetchVerify, hmacHex, safeEqual } from "../_shared/klump.ts";

const ok = (body: unknown = { received: true }, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

serve(async (req) => {
  if (req.method !== 'POST') return ok({ error: 'POST only' }, 405);
  try {
    const raw = await req.text();
    const SECRET = Deno.env.get('KLUMP_SECRET_KEY');
    if (!SECRET) { console.error('klump-webhook: KLUMP_SECRET_KEY missing'); return ok({ error: 'not configured' }, 500); }

    // Signature: HMAC-SHA256 of the body. Klump's docs do not state which secret signs it, so we accept our
    // secret key or an optional KLUMP_WEBHOOK_SECRET. Not enforced by default because the verify call below
    // is the real safety check. After your first test, if the logs say sigOk=true, set KLUMP_REQUIRE_SIGNATURE=true.
    const header = (req.headers.get('X-Klump-Signature') ?? '').trim().toLowerCase();
    const secrets = [SECRET, Deno.env.get('KLUMP_WEBHOOK_SECRET')].filter(Boolean) as string[];
    let sigOk = false;
    for (const s of secrets) { if (header && safeEqual(await hmacHex(s, raw), header)) sigOk = true; }
    console.log(`klump-webhook sigOk=${sigOk} id=${req.headers.get('X-Klump-Webhook-Id')}`);
    if (!sigOk && Deno.env.get('KLUMP_REQUIRE_SIGNATURE') === 'true') return ok({ error: 'bad signature' }, 401);

    let payload: any;
    try { payload = JSON.parse(raw); } catch { return ok({ received: true, ignored: 'not json' }); }
    const event = String(payload?.event ?? '');
    const webhookId = req.headers.get('X-Klump-Webhook-Id') ?? '';

    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    // Klump may deliver the same webhook several times. An id is only recorded after it was fully handled.
    if (webhookId) {
      const { data: seen } = await db.from('bnpl_webhook_events').select('webhook_id').eq('webhook_id', webhookId).maybeSingle();
      if (seen) return ok({ received: true, duplicate: true });
    }
    const requireLive = (Deno.env.get('KLUMP_ENV') ?? 'test').toLowerCase() === 'live';

    // Our own reference is echoed somewhere in the payload: find which order this is about.
    const findTx = async (...sources: unknown[]) => {
      const strings = [...new Set(sources.flatMap((s) => collectStrings(s)).filter((s) => s.startsWith('order-')))].slice(0, 20);
      if (!strings.length) return null;
      const { data } = await db.from('bnpl_transactions').select('order_id, reference, amount, status').in('reference', strings).limit(1);
      return data?.[0] ?? null;
    };

    if (event.endsWith('.successful')) {
      for (const c of candidateReferences(payload)) {
        const { httpOk, json } = await fetchVerify(c, SECRET);
        if (!httpOk) continue;
        const tx = await findTx(payload, json);
        if (!tx) continue;
        if (tx.status === 'successful') break;
        const outcome = evaluateVerification(json, { amount: Number(tx.amount), reference: tx.reference }, { requireLive, fallbackRef: c });
        if (!outcome.ok) { console.log('klump-webhook not confirmed:', outcome.reason); continue; }
        const { data: result } = await db.rpc('confirm_bnpl_payment', {
          _order_id: tx.order_id, _provider_reference: outcome.providerRef, _is_live: outcome.isLive ?? null, _raw: json,
        });
        console.log('klump-webhook confirm result:', result);
        break;
      }
    } else if (event.endsWith('.abandoned')) {
      const tx = await findTx(payload);
      if (tx && tx.status === 'initiated') await db.from('bnpl_transactions').update({ status: 'abandoned' }).eq('order_id', tx.order_id).eq('status', 'initiated');
    }
    // '.initiated' is only an FYI, nothing to do.

    if (webhookId) await db.from('bnpl_webhook_events').upsert({ webhook_id: webhookId, event }, { onConflict: 'webhook_id' });
    return ok();
  } catch (e) {
    console.error('klump-webhook error:', e);
    return ok({ error: 'internal error' }, 500);   // non-2xx makes Klump retry, which is what we want here
  }
});

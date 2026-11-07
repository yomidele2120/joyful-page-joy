// Receives Credit Direct's transaction events. A webhook is only a hint: for any event we ask Credit Direct's
// API ourselves (authenticated with our secret key) before marking anything paid, exactly like the buyer's return.
// If CREDITDIRECT_WEBHOOK_SECRET is set, the HMAC signature is required.
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  evaluateCreditDirect, fetchStatus, findOurReference, loadCreditDirectConfig, signatureValid, terminalFailure,
} from "../_shared/creditdirect.ts";

const ok = (body: unknown = { received: true }, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return ok({ error: 'POST only' }, 405);
  try {
    const raw = await req.text();
    const { config: cfg, missing } = loadCreditDirectConfig((k) => Deno.env.get(k));
    if (!cfg) { console.error('creditdirect-webhook: not configured', missing); return ok({ error: 'not configured' }, 500); }

    const header = req.headers.get(cfg.signatureHeader);
    const sigOk = cfg.webhookSecret ? await signatureValid(cfg.webhookSecret, raw, header) : false;
    console.log(`creditdirect-webhook sigOk=${sigOk} secretSet=${!!cfg.webhookSecret}`);
    if (cfg.webhookSecret && !sigOk) return ok({ error: 'bad signature' }, 401);
    if (!cfg.webhookSecret && cfg.requireSignature) return ok({ error: 'signature required but no secret configured' }, 401);

    let payload: unknown;
    try { payload = JSON.parse(raw); } catch { return ok({ received: true, ignored: 'not json' }); }

    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const eventId = 'cd:' + await sha256Hex(raw);
    const { data: seen } = await db.from('bnpl_webhook_events').select('webhook_id').eq('webhook_id', eventId).maybeSingle();
    if (seen) return ok({ received: true, duplicate: true });

    const reference = findOurReference(payload);
    if (reference) {
      const { data: tx } = await db.from('bnpl_transactions')
        .select('order_id, reference, amount, status, provider').eq('reference', reference).eq('provider', 'creditdirect').maybeSingle();
      if (tx && tx.status !== 'successful') {
        const { httpOk, json } = await fetchStatus(cfg, tx.reference);
        if (httpOk) {
          const outcome = evaluateCreditDirect(json, { amountNaira: Number(tx.amount), reference: tx.reference }, cfg, tx.reference);
          if (outcome.ok) {
            const { data: result } = await db.rpc('confirm_bnpl_payment', {
              _order_id: tx.order_id, _provider_reference: outcome.providerRef, _is_live: outcome.isLive ?? null, _raw: json,
            });
            console.log('creditdirect-webhook confirm result:', result);
          } else {
            console.log('creditdirect-webhook not confirmed:', outcome.reason);
            const failure = terminalFailure(json) ?? terminalFailure(payload);
            if (failure) await db.from('bnpl_transactions').update({ status: failure }).eq('order_id', tx.order_id).eq('status', 'initiated');
          }
        }
      }
    }

    await db.from('bnpl_webhook_events').upsert({ webhook_id: eventId, event: 'creditdirect' }, { onConflict: 'webhook_id' });
    return ok();
  } catch (e) {
    console.error('creditdirect-webhook error:', e);
    return ok({ error: 'internal error' }, 500);   // non-2xx so Credit Direct retries
  }
});

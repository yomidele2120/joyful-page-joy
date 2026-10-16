// Called by the checkout page right after the Klump widget reports success. We never take the browser's
// word for it: we ask Klump's API, and only mark the order paid if Klump confirms the right amount for
// this order. If Klump cannot confirm yet, the webhook (klump-webhook) finishes the job a moment later.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { candidateReferences, evaluateVerification, fetchVerify } from "../_shared/klump.ts";

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

    const SECRET = Deno.env.get('KLUMP_SECRET_KEY');
    if (!SECRET) return reply({ error: 'KLUMP_SECRET_KEY is missing on the server' }, 500);
    const requireLive = (Deno.env.get('KLUMP_ENV') ?? 'test').toLowerCase() === 'live';

    const { order_id, klump_response } = await req.json();
    if (!order_id) return reply({ error: 'order_id is required' }, 400);

    const { data: tx } = await db.from('bnpl_transactions')
      .select('order_id, user_id, reference, amount, status').eq('order_id', order_id).maybeSingle();
    if (!tx || tx.user_id !== user.id) return reply({ error: 'Pay later transaction not found' }, 404);
    if (tx.status === 'successful') return reply({ success: true, already: true });

    const candidates = candidateReferences(klump_response);
    const reasons: string[] = [];
    let lastJson: unknown = null;
    for (const c of candidates) {
      const { httpOk, json } = await fetchVerify(c, SECRET);
      lastJson = json ?? lastJson;
      if (!httpOk) { reasons.push(`${c.slice(0, 8)}…: Klump did not recognise it`); continue; }
      const outcome = evaluateVerification(json, { amount: Number(tx.amount), reference: tx.reference }, { requireLive, fallbackRef: c });
      if (!outcome.ok) { reasons.push(outcome.reason); continue; }

      const { data: result, error } = await db.rpc('confirm_bnpl_payment', {
        _order_id: order_id, _provider_reference: outcome.providerRef, _is_live: outcome.isLive ?? null, _raw: json,
      });
      if (error) return reply({ error: error.message }, 500);
      if (result === 'confirmed' || result === 'already_confirmed') return reply({ success: true });
      return reply({ error: `Could not confirm this payment (${result})` }, 409);
    }

    // Keep what Klump said, so a mismatch can be diagnosed from the Finance tab / database.
    if (lastJson) await db.from('bnpl_transactions').update({ raw_verify: lastJson as any }).eq('order_id', order_id);
    // Not confirmed yet. The webhook may still complete it, so tell the page to wait rather than fail.
    return reply({ pending: true, message: 'Waiting for Klump to confirm your payment', details: reasons.slice(0, 3) }, 202);
  } catch (e) {
    return reply({ error: e instanceof Error ? e.message : 'Internal server error' }, 500);
  }
});

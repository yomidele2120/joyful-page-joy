// Called by /pay-later/return when the buyer comes back from Credit Direct. We never trust the page URL:
// we ask Credit Direct's API about THIS order's reference and only mark the order paid if the answer matches
// the amount and reference we created. If Credit Direct has not finished yet, the page keeps asking and the
// webhook (creditdirect-webhook) can complete it too.
import { createClient } from "npm:@supabase/supabase-js@2";
import { evaluateCreditDirect, fetchStatus, loadCreditDirectConfig, terminalFailure } from "../_shared/creditdirect.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return reply({ error: 'Unauthorized' }, 401);
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: claimsData, error: claimsError } = await db.auth.getClaims(authHeader.replace('Bearer ', ''));
    const userId = claimsData?.claims?.sub as string | undefined;
    if (claimsError || !userId) return reply({ error: 'Unauthorized' }, 401);

    // Verification is deliberately NOT gated by the admin's current provider choice: a payment that was
    // started with Credit Direct must still be confirmable after the admin switches provider.
    const { config: cfg, missing } = loadCreditDirectConfig((k) => Deno.env.get(k));
    if (!cfg) { console.error('creditdirect-verify: not configured', missing); return reply({ error: 'Credit Direct is not set up on the server' }, 503); }

    const { order_id } = await req.json();
    if (!order_id) return reply({ error: 'order_id is required' }, 400);

    const { data: tx } = await db.from('bnpl_transactions')
      .select('order_id, user_id, reference, amount, status, provider').eq('order_id', order_id).maybeSingle();
    if (!tx || tx.user_id !== userId) return reply({ error: 'Pay later transaction not found' }, 404);
    if (tx.provider !== 'creditdirect') return reply({ error: 'This order was not paid with Credit Direct' }, 400);
    if (tx.status === 'successful') return reply({ success: true, already: true });

    const { httpOk, json } = await fetchStatus(cfg, tx.reference);
    if (!httpOk) {
      return reply({ pending: true, message: 'Waiting for Credit Direct to confirm your payment', details: ['Credit Direct did not recognise the transaction yet'] }, 202);
    }

    const outcome = evaluateCreditDirect(json, { amountNaira: Number(tx.amount), reference: tx.reference }, cfg, tx.reference);
    if (!outcome.ok) {
      // Keep what Credit Direct said so a mismatch can be diagnosed from the database.
      await db.from('bnpl_transactions').update({ raw_verify: json ?? null }).eq('order_id', order_id).neq('status', 'successful');
      const failure = terminalFailure(json);
      if (failure) {
        await db.from('bnpl_transactions').update({ status: failure }).eq('order_id', order_id).eq('status', 'initiated');
        return reply({ failed: true, message: failure === 'abandoned' ? 'The Pay later application was not completed' : 'Credit Direct did not approve this Pay later payment' }, 200);
      }
      return reply({ pending: true, message: 'Waiting for Credit Direct to confirm your payment', details: [outcome.reason] }, 202);
    }

    const { data: result, error } = await db.rpc('confirm_bnpl_payment', {
      _order_id: order_id, _provider_reference: outcome.providerRef, _is_live: outcome.isLive ?? null, _raw: json,
    });
    if (error) return reply({ error: error.message }, 500);
    if (result === 'confirmed' || result === 'already_confirmed') return reply({ success: true });
    return reply({ error: `Could not confirm this payment (${result})` }, 409);
  } catch (e) {
    console.error('creditdirect-verify error:', e);
    return reply({ error: e instanceof Error ? e.message : 'Internal server error' }, 500);
  }
});

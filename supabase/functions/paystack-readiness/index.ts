// Admin-only checklist: does your real Paystack account support how this marketplace moves money?
// It makes read-only calls with your secret key (which never leaves the server).
//
// How the money moves in this project:
//   1. The buyer pays the FULL amount (products + VAT + any shipping) into your main Paystack balance.
//   2. The database ledger records each supplier's share (product subtotal minus commission).
//   3. After delivery and the protection period, run-payouts sends that share by Paystack TRANSFER.
// So the account needs: a working secret key, a readable balance, and transfers (third-party payouts) enabled.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

interface Check { name: string; ok: boolean; detail: string }

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
    const checks: Check[] = [];
    if (!KEY) {
      checks.push({ name: 'Secret key', ok: false, detail: 'PAYSTACK_SECRET_KEY is not set in the edge function secrets.' });
      return reply({ mode: 'unknown', checks });
    }
    const mode = KEY.startsWith('sk_live_') ? 'live' : KEY.startsWith('sk_test_') ? 'test' : 'unknown';
    checks.push({
      name: 'Secret key mode', ok: mode === 'live',
      detail: mode === 'live' ? 'Live key in use.' : mode === 'test'
        ? 'This is a TEST key. Real customers cannot pay, and live transfers will not work. Switch to the live key before launch.'
        : 'The key does not look like a Paystack secret key.',
    });

    const call = async (path: string) => {
      try {
        const res = await fetch(`https://api.paystack.co${path}`, { headers: { Authorization: `Bearer ${KEY}` } });
        return { httpOk: res.ok, body: await res.json().catch(() => ({})) };
      } catch (e) {
        return { httpOk: false, body: { message: e instanceof Error ? e.message : 'Network error' } };
      }
    };

    const bal = await call('/balance');
    const ngn = (bal.body?.data ?? []).find((b: any) => b.currency === 'NGN');
    checks.push({
      name: 'Balance readable', ok: bal.httpOk && !!bal.body?.status,
      detail: bal.httpOk && bal.body?.status
        ? `Available NGN balance: N${(Number(ngn?.balance ?? 0) / 100).toLocaleString('en-NG')}. Supplier payouts are paid from this balance.`
        : `Paystack said: ${bal.body?.message ?? 'no answer'}`,
    });

    const tr = await call('/transfer?perPage=1');
    checks.push({
      name: 'Transfers (supplier payouts)', ok: tr.httpOk && !!tr.body?.status,
      detail: tr.httpOk && tr.body?.status
        ? 'The transfers API answered. Also confirm in the Paystack dashboard that payouts to third parties are approved for your business, and that OTP confirmation for transfers is switched off (otherwise automatic payouts wait for an OTP).'
        : `Paystack said: ${tr.body?.message ?? 'no answer'}. Transfers to suppliers will fail until Paystack enables them for your business.`,
    });

    const sub = await call('/subaccount?perPage=1');
    checks.push({
      name: 'Subaccounts', ok: sub.httpOk && !!sub.body?.status,
      detail: sub.httpOk && sub.body?.status
        ? `${sub.body?.meta?.total ?? 0} subaccount(s) exist. They are NOT used to split checkout payments in this project: payments are split by the ledger and paid out later by transfer.`
        : `Paystack said: ${sub.body?.message ?? 'no answer'}`,
    });

    checks.push({
      name: 'Webhook', ok: true,
      detail: 'Cannot be read through the API. In the Paystack dashboard (Settings > API Keys & Webhooks) the webhook URL must point to your paystack-webhook function. Events are accepted only with a valid HMAC-SHA512 signature made with this same secret key.',
    });

    return reply({ mode, allocation_model: 'ledger_and_transfers', checks });
  } catch (e) {
    console.error('paystack-readiness error:', e);
    return reply({ error: 'Internal server error' }, 500);
  }
});

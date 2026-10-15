// Verifies a supplier's bank account with Paystack and creates the "transfer recipient"
// that payouts are sent to. Admin only. Re-run it whenever a supplier changes bank details:
// run-payouts refuses to pay until the recipient matches the bank details on file.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const norm = (v: string) =>
  v.toLowerCase()
    .replace(/\b(plc|limited|ltd|mfb|microfinance|digital|services|bank|nigeria|of)\b/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

const ALIASES: Record<string, string> = {
  gtb: 'guaranty trust', gtbank: 'guaranty trust', gt: 'guaranty trust', uba: 'united for africa',
  fcmb: 'first city monument', 'first': 'first', zenith: 'zenith', access: 'access',
};

function findBank(typed: string, banks: { name: string; code: string }[]) {
  let t = norm(typed);
  if (ALIASES[t]) t = ALIASES[t];
  const scored = banks
    .map((b) => ({ b, n: norm(b.name) }))
    .filter(({ n }) => n && t && (n === t || n.includes(t) || t.includes(n)))
    .sort((x, y) => Math.abs(x.n.length - t.length) - Math.abs(y.n.length - t.length));
  return scored[0]?.b;
}

const nameTokens = (v: string) => norm(v).split(' ').filter((w) => w.length >= 3);

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return reply({ error: 'Unauthorized' }, 401);

    const adminClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: { user }, error: userError } = await adminClient.auth.getUser(authHeader.replace('Bearer ', ''));
    if (userError || !user) return reply({ error: 'Unauthorized' }, 401);
    const { data: roles } = await adminClient.from('user_roles').select('role').eq('user_id', user.id).eq('role', 'admin');
    if (!roles?.length) return reply({ error: 'Admins only' }, 403);

    const { vendor_id, confirm_name } = await req.json();
    if (!vendor_id) return reply({ error: 'vendor_id is required' }, 400);

    const KEY = Deno.env.get('PAYSTACK_SECRET_KEY');
    if (!KEY) return reply({ error: 'Paystack not configured' }, 500);
    const ps = (path: string, init?: RequestInit) =>
      fetch(`https://api.paystack.co${path}`, { ...init, headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' } }).then((r) => r.json());

    const { data: vendor } = await adminClient.from('vendors').select('id, store_name, is_approved').eq('id', vendor_id).maybeSingle();
    if (!vendor) return reply({ error: 'Supplier not found' }, 404);
    if (!vendor.is_approved) return reply({ error: 'Approve the supplier before setting up payouts' }, 400);

    const { data: bank } = await adminClient.from('vendor_private')
      .select('bank_name, bank_account_number, bank_account_name').eq('vendor_id', vendor_id).maybeSingle();
    if (!bank?.bank_name || !bank?.bank_account_number) {
      return reply({ error: 'Supplier bank details are incomplete', code: 'bank_incomplete' }, 400);
    }
    const accountNumber = bank.bank_account_number.trim();

    const list = await ps('/bank?country=nigeria&perPage=200&currency=NGN');
    if (!list.status) return reply({ error: list.message || 'Could not load the bank list from Paystack' }, 502);
    const match = findBank(bank.bank_name, list.data);
    if (!match) return reply({ error: `Bank not recognised: "${bank.bank_name}". Ask the supplier to re-enter it.`, code: 'bank_unsupported' }, 400);

    const resolved = await ps(`/bank/resolve?account_number=${encodeURIComponent(accountNumber)}&bank_code=${match.code}`);
    if (!resolved.status) return reply({ error: resolved.message || 'Paystack could not verify this account number', code: 'resolve_failed' }, 400);
    const resolvedName: string = resolved.data.account_name;

    // The name on the bank account should resemble the name the supplier gave us.
    const given = nameTokens(bank.bank_account_name || '');
    const found = new Set(nameTokens(resolvedName));
    const overlaps = given.some((w) => found.has(w));
    if (!overlaps && !confirm_name) {
      return reply({
        error: `Account name mismatch. Supplier entered "${bank.bank_account_name}" but the bank says "${resolvedName}".`,
        code: 'name_mismatch', entered_name: bank.bank_account_name, bank_name: resolvedName,
      }, 409);
    }

    const rec = await ps('/transferrecipient', {
      method: 'POST',
      body: JSON.stringify({ type: 'nuban', name: resolvedName, account_number: accountNumber, bank_code: match.code, currency: 'NGN' }),
    });
    if (!rec.status) return reply({ error: rec.message || 'Could not create the transfer recipient' }, 400);

    await adminClient.from('vendor_private').update({
      transfer_recipient_code: rec.data.recipient_code,
      transfer_recipient_fingerprint: `${bank.bank_name.toLowerCase().trim()}|${accountNumber}`,
    }).eq('vendor_id', vendor_id);

    return reply({ ok: true, account_name: resolvedName, bank: match.name });
  } catch (e) {
    return reply({ error: e instanceof Error ? e.message : 'Internal server error' }, 500);
  }
});

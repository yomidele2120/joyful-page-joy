// Looks up the account holder's name from a bank + 10-digit account number using Paystack, so the supplier
// sees the real name on the account instead of typing one. Works during sign-up (before an account exists).
// Returns HTTP 200 with { ok: true, account_name } or { ok: false, code }. The Paystack key never leaves the server.
import { findBank, loadBanks } from "../_shared/paystackBanks.ts";

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// Anyone can call this (sign-up has no session yet), so it is limited per visitor to stop people scanning account numbers.
const hits = new Map<string, number[]>();
function limited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 10 * 60_000);
  if (recent.length >= 12) { hits.set(ip, recent); return true; }
  recent.push(now); hits.set(ip, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < 10 * 60_000)) hits.delete(k);
  return false;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return reply({ ok: false, code: 'bad_request' }, 405);
  try {
    const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';
    if (limited(ip)) return reply({ ok: false, code: 'rate_limited' });

    const body = await req.json().catch(() => ({}));
    const bankName = typeof body.bank_name === 'string' ? body.bank_name.slice(0, 80) : '';
    const accountNumber = typeof body.account_number === 'string' ? body.account_number.trim() : '';
    if (!bankName || !/^\d{10}$/.test(accountNumber)) return reply({ ok: false, code: 'bad_request' });

    const secret = Deno.env.get('PAYSTACK_SECRET_KEY');
    if (!secret) { console.error('resolve-bank-account: PAYSTACK_SECRET_KEY is not set'); return reply({ ok: false, code: 'unavailable', detail: 'Paystack key is not set on the server' }); }
    const banks = await loadBanks(secret);
    if (!banks) { console.error('resolve-bank-account: could not load the Paystack bank list'); return reply({ ok: false, code: 'unavailable', detail: 'Could not load the bank list from Paystack' }); }
    const bank = findBank(bankName, banks);
    if (!bank) return reply({ ok: false, code: 'bank_unsupported' });

    const res = await fetch(`https://api.paystack.co/bank/resolve?account_number=${accountNumber}&bank_code=${encodeURIComponent(bank.code)}`, {
      headers: { Authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(12_000),
    });
    const j = await res.json().catch(() => null);
    if (res.ok && j?.status && typeof j.data?.account_name === 'string' && j.data.account_name.trim()) {
      return reply({ ok: true, account_name: j.data.account_name.trim() });
    }
    const notFound = res.status === 422 || res.status === 404;
    if (!notFound) console.error('resolve-bank-account: Paystack said', res.status, String(j?.message ?? '').slice(0, 200));
    // 422 / 404 = no such account. Anything else (rate limit, outage, test-mode key, resolve not allowed) = lookup unavailable.
    return reply({ ok: false, code: notFound ? 'not_found' : 'unavailable', detail: notFound ? undefined : String(j?.message ?? `Paystack error ${res.status}`).slice(0, 160) });
  } catch (e) {
    console.error('resolve-bank-account failed', e instanceof Error ? e.message : e);
    return reply({ ok: false, code: 'unavailable', detail: 'The lookup service did not respond' });
  }
});

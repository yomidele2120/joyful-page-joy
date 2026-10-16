// Helpers shared by the Klump edge functions. Pure functions only (no Deno APIs) so they can be unit tested.
//
// Klump verification works like this: after a customer pays, we ask Klump's API (with our SECRET key)
// whether that transaction really succeeded, and we only mark the order paid if the answer matches
// the order we created (amount, currency, our reference). Nothing the browser sends is trusted by itself.

export interface VerifyOutcome { ok: boolean; reason: string; providerRef?: string; isLive?: boolean }

const MAX_DEPTH = 5;

/** All string/number values found under the given key names, anywhere in a JSON value. */
export function collectByKeys(value: unknown, keys: string[], out: string[] = [], depth = 0): string[] {
  if (value === null || typeof value !== 'object' || depth > MAX_DEPTH) return out;
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (keys.includes(k) && (typeof v === 'string' || typeof v === 'number') && String(v).trim()) out.push(String(v).trim());
    if (v && typeof v === 'object') collectByKeys(v, keys, out, depth + 1);
  }
  return out;
}

/** Every string inside a JSON value (used to find our own reference wherever Klump echoes it). */
export function collectStrings(value: unknown, out: string[] = [], depth = 0): string[] {
  if (typeof value === 'string') { out.push(value); return out; }
  if (value === null || typeof value !== 'object' || depth > MAX_DEPTH) return out;
  for (const v of Object.values(value as Record<string, unknown>)) collectStrings(v, out, depth + 1);
  return out;
}

/** Possible Klump transaction ids inside a widget callback or webhook payload (most likely first). */
export function candidateReferences(payload: unknown): string[] {
  const ordered = [
    ...collectByKeys(payload, ['reference', 'transaction_reference', 'klump_reference', 'transaction_id']),
    ...collectByKeys(payload, ['id']),
  ];
  return [...new Set(ordered)].filter((s) => s.length >= 6 && s.length <= 120).slice(0, 6);
}

const SUCCESS = ['successful', 'success', 'completed', 'paid'];

function statusesOf(json: any): string[] {
  const d = json?.data ?? json ?? {};
  return [d?.status, d?.transaction_status, d?.state, json?.status]
    .filter((s) => typeof s === 'string')
    .map((s: string) => s.toLowerCase());
}

/** Decide whether Klump's verify response proves THIS order was paid. Fails closed on anything unclear. */
export function evaluateVerification(
  json: any,
  expected: { amount: number; reference: string },
  opts: { requireLive: boolean; fallbackRef?: string },
): VerifyOutcome {
  const d = json?.data ?? json;
  if (!d || typeof d !== 'object') return { ok: false, reason: 'Klump returned no transaction data' };

  if (!statusesOf(json).some((s) => SUCCESS.includes(s))) {
    return { ok: false, reason: `Klump says the transaction is not successful (${statusesOf(json).join(', ') || 'no status'})` };
  }
  if (String(d.currency ?? '').toUpperCase() !== 'NGN') return { ok: false, reason: 'Currency is not NGN' };

  const amount = Number(d.amount ?? d.total_amount ?? d.transaction_amount);
  if (!Number.isFinite(amount)) return { ok: false, reason: 'Could not read the amount from the Klump response' };
  const matches = Math.abs(amount - expected.amount) < 0.5 || Math.abs(amount - expected.amount * 100) < 0.5;
  if (!matches) return { ok: false, reason: `Amount mismatch: Klump has ${amount}, the order is ${expected.amount}` };

  const echoed = collectByKeys(d, ['merchant_reference', 'merchantReference']);
  if (echoed.length && !echoed.includes(expected.reference)) {
    return { ok: false, reason: 'The Klump transaction belongs to a different order reference' };
  }

  const isLive = typeof d.is_live === 'boolean' ? d.is_live : undefined;
  if (opts.requireLive && isLive !== true) return { ok: false, reason: 'Test transaction rejected: live mode is on' };

  const providerRef = String(d.reference ?? d.transaction_reference ?? d.id ?? opts.fallbackRef ?? '').trim();
  if (!providerRef) return { ok: false, reason: 'No transaction id in the Klump response' };
  return { ok: true, reason: 'verified', providerRef, isLive };
}

/** HMAC-SHA256 hex of the raw webhook body (used to check X-Klump-Signature). */
export async function hmacHex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/** Calls Klump's verify endpoint for one candidate id. */
export async function fetchVerify(candidate: string, secretKey: string): Promise<{ httpOk: boolean; json: any }> {
  const res = await fetch(`https://api.useklump.com/v1/transactions/${encodeURIComponent(candidate)}/verify`, {
    headers: { 'klump-secret-key': secretKey, 'Content-Type': 'application/json', Accept: 'application/json' },
  });
  let json: any = null;
  try { json = await res.json(); } catch { /* not JSON */ }
  return { httpOk: res.ok, json };
}

// ---- Klump's widget THROWS on values it dislikes, so only pass what it accepts -------------------------
/** Klump wants an 11-digit phone string (e.g. 08012345678). Returns undefined when it can't be made one. */
export function klumpPhone(raw: unknown): string | undefined {
  let d = String(raw ?? '').replace(/\D/g, '');
  if (d.length === 13 && d.startsWith('234')) d = '0' + d.slice(3);
  return d.length === 11 ? d : undefined;
}
/** Names must be at least 2 characters. */
export function klumpName(raw: unknown): string | undefined {
  const v = String(raw ?? '').trim();
  return v.length >= 2 ? v : undefined;
}
/** Klump's own URL check (https?:// with no spaces). */
export function klumpUrl(raw: unknown): string | undefined {
  const v = String(raw ?? '').trim();
  return /^https?:\/\/[^\s$.?#].[^\s]*$/.test(v) ? v : undefined;
}

// Credit Direct Checkout adapter. EVERYTHING that is specific to Credit Direct's API lives in this one file,
// so if their documentation differs from what is assumed here, this is the only place to edit.
//
// Flow (hosted checkout, redirect):
//   1. creditdirect-initialize  -> POST <base><CREATE_PATH>  (we send amount, items, our reference, return URL)
//                                  Credit Direct answers with a checkout link; the buyer is sent there.
//   2. The buyer applies / pays the down payment on Credit Direct's page and is returned to our site.
//   3. creditdirect-verify (and the webhook) -> GET <base><VERIFY_PATH>  asks Credit Direct directly whether
//      THIS order was paid. Only a matching answer marks the order paid. Nothing in the browser URL is trusted.
//
// Credit Direct does not publish a public API reference (it is given to approved merchants), so no endpoint,
// field name or header is hard-coded as fact. Connection details come from secrets (see CREDITDIRECT_SETUP.md),
// the request shape is in buildCreateBody() below, and every check on the response fails closed.
//
// Pure functions + an injectable fetch, so this file can be unit tested without Deno.
import { collectByKeys, collectStrings, hmacHex, safeEqual } from './klump.ts';

export interface CdConfig {
  baseUrl: string;
  secretKey: string;
  createPath: string;
  verifyPath: string;                 // must contain {reference}
  verifyMethod: 'GET' | 'POST';
  authHeader: string;                 // e.g. Authorization
  authScheme: string;                 // e.g. Bearer ('' = send the key as-is)
  amountUnit: 'naira' | 'kobo';
  amountField?: string;               // force which response field holds the amount
  successStatuses: string[];
  requireLive: boolean;
  echoesReference: boolean;           // does the verify response contain our reference? (strict by default)
  extraHeaders: Record<string, string>;
  extraBody: Record<string, unknown>; // merged into the create request (e.g. a merchant id)
  webhookSecret?: string;
  signatureHeader: string;
  requireSignature: boolean;
}

export interface CdConfigResult { config?: CdConfig; missing: string[]; problems: string[] }

const DEFAULT_SUCCESS = ['successful', 'success', 'completed', 'paid', 'disbursed'];

function parseJsonObject(raw: string | undefined, name: string, problems: string[]): Record<string, any> {
  if (!raw || !raw.trim()) return {};
  try {
    const v = JSON.parse(raw);
    if (v && typeof v === 'object' && !Array.isArray(v)) return v;
  } catch { /* fall through */ }
  problems.push(`${name} is not a valid JSON object`);
  return {};
}

/** Reads the connection settings. Reports exactly what is missing instead of guessing. */
export function loadCreditDirectConfig(get: (key: string) => string | undefined): CdConfigResult {
  const val = (k: string) => (get(k) ?? '').trim();
  const missing: string[] = [];
  const problems: string[] = [];
  for (const k of ['CREDITDIRECT_API_BASE_URL', 'CREDITDIRECT_SECRET_KEY', 'CREDITDIRECT_CREATE_PATH', 'CREDITDIRECT_VERIFY_PATH']) {
    if (!val(k)) missing.push(k);
  }
  const baseUrl = val('CREDITDIRECT_API_BASE_URL').replace(/\/+$/, '');
  if (baseUrl && !/^https:\/\/[^\s/]+/.test(baseUrl)) problems.push('CREDITDIRECT_API_BASE_URL must start with https://');
  const verifyPath = val('CREDITDIRECT_VERIFY_PATH');
  if (verifyPath && !verifyPath.includes('{reference}')) problems.push('CREDITDIRECT_VERIFY_PATH must contain {reference}, for example /checkout/{reference}/verify');
  const unit = (val('CREDITDIRECT_AMOUNT_UNIT') || 'naira').toLowerCase();
  if (unit !== 'naira' && unit !== 'kobo') problems.push('CREDITDIRECT_AMOUNT_UNIT must be naira or kobo');
  const method = (val('CREDITDIRECT_VERIFY_METHOD') || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'POST') problems.push('CREDITDIRECT_VERIFY_METHOD must be GET or POST');

  const extraHeaders = parseJsonObject(get('CREDITDIRECT_EXTRA_HEADERS'), 'CREDITDIRECT_EXTRA_HEADERS', problems);
  const extraBody = parseJsonObject(get('CREDITDIRECT_EXTRA_BODY'), 'CREDITDIRECT_EXTRA_BODY', problems);

  if (missing.length || problems.length) return { missing, problems };

  const success = val('CREDITDIRECT_SUCCESS_STATUSES')
    ? val('CREDITDIRECT_SUCCESS_STATUSES').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
    : DEFAULT_SUCCESS;
  const scheme = get('CREDITDIRECT_AUTH_SCHEME');
  return {
    missing, problems,
    config: {
      baseUrl,
      secretKey: val('CREDITDIRECT_SECRET_KEY'),
      createPath: '/' + val('CREDITDIRECT_CREATE_PATH').replace(/^\/+/, ''),
      verifyPath: '/' + verifyPath.replace(/^\/+/, ''),
      verifyMethod: method as 'GET' | 'POST',
      authHeader: val('CREDITDIRECT_AUTH_HEADER') || 'Authorization',
      authScheme: scheme === undefined ? 'Bearer' : scheme.trim(),
      amountUnit: unit as 'naira' | 'kobo',
      amountField: val('CREDITDIRECT_AMOUNT_FIELD') || undefined,
      successStatuses: success,
      requireLive: val('CREDITDIRECT_ENV').toLowerCase() === 'live',
      echoesReference: val('CREDITDIRECT_RESPONSE_ECHOES_REFERENCE').toLowerCase() !== 'false',
      extraHeaders: Object.fromEntries(Object.entries(extraHeaders).map(([k, v]) => [k, String(v)])),
      extraBody,
      webhookSecret: val('CREDITDIRECT_WEBHOOK_SECRET') || undefined,
      signatureHeader: (val('CREDITDIRECT_SIGNATURE_HEADER') || 'x-signature').toLowerCase(),
      requireSignature: val('CREDITDIRECT_REQUIRE_SIGNATURE').toLowerCase() === 'true',
    },
  };
}

export function authHeaders(cfg: CdConfig): Record<string, string> {
  const value = cfg.authScheme ? `${cfg.authScheme} ${cfg.secretKey}` : cfg.secretKey;
  return { [cfg.authHeader]: value, 'Content-Type': 'application/json', Accept: 'application/json', ...cfg.extraHeaders };
}

// ---- Request shape: the ONLY place that knows how a "create checkout" request looks ----------------------
export interface CreateInput {
  orderId: string;
  reference: string;            // our merchant reference (order-<uuid>)
  amountNaira: number;          // whole naira, equals the sum of the items
  items: { name: string; unitPriceNaira: number; quantity: number; imageUrl?: string; itemUrl?: string }[];
  customer: { name?: string; firstName?: string; lastName?: string; email?: string; phone?: string };
  callbackUrl: string;          // where the buyer is sent back to on our site
}

const money = (naira: number, unit: 'naira' | 'kobo') => (unit === 'kobo' ? Math.round(naira * 100) : naira);

/** Edit here if Credit Direct's documentation uses different field names. */
export function buildCreateBody(input: CreateInput, cfg: CdConfig): Record<string, unknown> {
  const body: Record<string, unknown> = {
    amount: money(input.amountNaira, cfg.amountUnit),
    currency: 'NGN',
    reference: input.reference,
    callback_url: input.callbackUrl,
    redirect_url: input.callbackUrl,
    customer: {
      name: input.customer.name, first_name: input.customer.firstName, last_name: input.customer.lastName,
      email: input.customer.email, phone: input.customer.phone,
    },
    items: input.items.map((i) => ({
      name: i.name, unit_price: money(i.unitPriceNaira, cfg.amountUnit), quantity: i.quantity,
      ...(i.imageUrl ? { image_url: i.imageUrl } : {}), ...(i.itemUrl ? { item_url: i.itemUrl } : {}),
    })),
    metadata: { order_id: input.orderId },
  };
  // Drop empty customer fields rather than sending blanks.
  const c = body.customer as Record<string, unknown>;
  for (const k of Object.keys(c)) if (c[k] === undefined || c[k] === '') delete c[k];
  return { ...body, ...cfg.extraBody };
}

/** 08012345678 style, or undefined when it cannot be made one. */
export function ngPhone(raw: unknown): string | undefined {
  let d = String(raw ?? '').replace(/\D/g, '');
  if (d.length === 13 && d.startsWith('234')) d = '0' + d.slice(3);
  return d.length === 11 ? d : undefined;
}

// ---- Calling Credit Direct -------------------------------------------------------------------------------
type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

async function call(fetchImpl: FetchLike, url: string, init: RequestInit): Promise<{ httpOk: boolean; status: number; json: any }> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 20_000);
  try {
    const res = await fetchImpl(url, { ...init, signal: ctl.signal });
    let json: any = null;
    try { json = await res.json(); } catch { /* not JSON */ }
    return { httpOk: res.ok, status: res.status, json };
  } finally { clearTimeout(timer); }
}

const URL_KEYS = ['checkout_url', 'checkoutUrl', 'payment_url', 'paymentUrl', 'authorization_url', 'authorizationUrl',
  'redirect_url', 'redirectUrl', 'payment_link', 'paymentLink', 'link', 'url'];

/** The hosted-checkout link in a create response. Only https links are accepted. */
export function extractCheckoutUrl(json: unknown): string | undefined {
  for (const c of collectByKeys(json, URL_KEYS)) {
    try { const u = new URL(c); if (u.protocol === 'https:') return u.toString(); } catch { /* not a URL */ }
  }
  return undefined;
}

/** A readable reason from an error response, never including keys. */
export function errorReason(json: any, status: number): string {
  const m = json?.message ?? json?.error ?? json?.error_description ?? json?.detail
    ?? (Array.isArray(json?.errors) ? json.errors.map((e: any) => e?.message ?? e).join('; ') : json?.errors);
  return `${typeof m === 'string' ? m.slice(0, 200) : 'no details'} (HTTP ${status})`;
}

export async function createSession(cfg: CdConfig, body: Record<string, unknown>, fetchImpl: FetchLike = fetch) {
  const r = await call(fetchImpl, cfg.baseUrl + cfg.createPath, { method: 'POST', headers: authHeaders(cfg), body: JSON.stringify(body) });
  if (!r.httpOk) return { ok: false as const, error: `Credit Direct refused the request: ${errorReason(r.json, r.status)}`, json: r.json };
  const checkoutUrl = extractCheckoutUrl(r.json);
  if (!checkoutUrl) return { ok: false as const, error: 'Credit Direct did not return a checkout link', json: r.json };
  return { ok: true as const, checkoutUrl, json: r.json };
}

export async function fetchStatus(cfg: CdConfig, reference: string, fetchImpl: FetchLike = fetch) {
  const url = cfg.baseUrl + cfg.verifyPath.replace('{reference}', encodeURIComponent(reference));
  const init: RequestInit = cfg.verifyMethod === 'POST'
    ? { method: 'POST', headers: authHeaders(cfg), body: JSON.stringify({ reference }) }
    : { method: 'GET', headers: authHeaders(cfg) };
  return call(fetchImpl, url, init);
}

// ---- Deciding whether a response proves THIS order was paid ------------------------------------------------
export interface CdOutcome { ok: boolean; reason: string; providerRef?: string; isLive?: boolean }

const STATUS_KEYS = ['status', 'transaction_status', 'payment_status', 'state'];
const AMOUNT_KEYS = ['amount', 'total_amount', 'transaction_amount', 'order_amount', 'purchase_amount', 'total'];
const ID_KEYS = ['transaction_id', 'loan_id', 'checkout_id', 'session_id', 'id'];
const NESTED = ['transaction', 'payment', 'checkout', 'order', 'loan', 'session'];

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** The objects a transaction's fields can sit in, most specific first: data.transaction, data, then the root. */
function levels(json: unknown): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const root = isObj(json) ? json : {};
  const data = isObj(root.data) ? root.data : undefined;
  for (const holder of [data, root]) {
    if (!holder) continue;
    for (const k of NESTED) if (isObj(holder[k])) out.push(holder[k] as Record<string, unknown>);
  }
  if (data) out.push(data);
  out.push(root);
  return out;
}

/** First level that has any of the keys as a direct string/number value (never digs into items or customers). */
function direct(json: unknown, keys: string[]): string[] {
  for (const lvl of levels(json)) {
    const found = keys.map((k) => lvl[k]).filter((v) => (typeof v === 'string' || typeof v === 'number') && String(v).trim()).map((v) => String(v).trim());
    if (found.length) return found;
  }
  return [];
}

function statusesOf(json: unknown): string[] {
  return direct(json, STATUS_KEYS).map((s) => s.toLowerCase());
}

/** Fails closed on anything unclear: wrong status, amount, currency, reference or a test payment in live mode. */
export function evaluateCreditDirect(
  json: any,
  expected: { amountNaira: number; reference: string },
  cfg: Pick<CdConfig, 'amountUnit' | 'amountField' | 'successStatuses' | 'requireLive' | 'echoesReference'>,
  fallbackRef?: string,
): CdOutcome {
  if (!isObj(json)) return { ok: false, reason: 'Credit Direct returned no transaction data' };

  const statuses = statusesOf(json);
  if (!statuses.some((s) => cfg.successStatuses.includes(s))) {
    return { ok: false, reason: `Credit Direct says the transaction is not complete (${statuses.join(', ') || 'no status'})` };
  }

  const currency = direct(json, ['currency'])[0];
  if (currency && currency.toUpperCase() !== 'NGN') return { ok: false, reason: 'Currency is not NGN' };

  const amountRaw = direct(json, cfg.amountField ? [cfg.amountField] : AMOUNT_KEYS)[0];
  const amount = Number(amountRaw);
  if (amountRaw === undefined || !Number.isFinite(amount)) return { ok: false, reason: 'Could not read the amount from the Credit Direct response' };
  const want = cfg.amountUnit === 'kobo' ? expected.amountNaira * 100 : expected.amountNaira;
  if (Math.abs(amount - want) >= 0.5) return { ok: false, reason: `Amount mismatch: Credit Direct has ${amount}, the order is ${want}` };

  if (cfg.echoesReference && !collectStrings(json).includes(expected.reference)) {
    return { ok: false, reason: 'The Credit Direct transaction does not carry this order reference' };
  }

  // A test payment must never be accepted while live. Only an explicit signal can prove it, so absence is allowed.
  let isLive: boolean | undefined;
  for (const lvl of levels(json)) {
    const flag = lvl.is_live ?? lvl.live ?? lvl.livemode;
    if (typeof flag === 'boolean') { isLive = flag; break; }
  }
  const mode = direct(json, ['mode', 'environment', 'env'])[0];
  if (mode && /test|sandbox|demo/i.test(mode)) isLive = false;
  if (cfg.requireLive && isLive === false) return { ok: false, reason: 'Test transaction rejected: live mode is on' };

  const providerRef = (direct(json, ID_KEYS)[0] ?? fallbackRef ?? '').trim();
  if (!providerRef) return { ok: false, reason: 'No transaction id in the Credit Direct response' };
  return { ok: true, reason: 'verified', providerRef, isLive };
}

/** Is a webhook/verify body saying the buyer gave up or it failed (so we can close the attempt)? */
export function terminalFailure(json: unknown): 'abandoned' | 'failed' | null {
  const s = statusesOf(json).join(' ');
  if (/abandon|cancel/.test(s)) return 'abandoned';
  if (/fail|declin|reject|expire/.test(s)) return 'failed';
  return null;
}

/** Our reference inside a webhook body (we only ever send "order-<uuid>"). */
export function findOurReference(payload: unknown): string | undefined {
  return collectStrings(payload).find((s) => /^order-[0-9a-f-]{36}$/i.test(s));
}

// ---- Webhook signature -------------------------------------------------------------------------------------
async function hmacBase64(secret: string, body: string): Promise<string> {
  const hex = await hmacHex(secret, body);
  const bytes = new Uint8Array(hex.match(/.{2}/g)!.map((h) => parseInt(h, 16)));
  let bin = ''; bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin);
}

/** HMAC-SHA256 of the raw body, header given as hex or base64, optionally prefixed "sha256=". */
export async function signatureValid(secret: string, rawBody: string, header: string | null): Promise<boolean> {
  const h = (header ?? '').trim().replace(/^sha256=/i, '');
  if (!h) return false;
  const hex = await hmacHex(secret, rawBody);
  if (safeEqual(hex, h.toLowerCase())) return true;
  return safeEqual(await hmacBase64(secret, rawBody), h);
}

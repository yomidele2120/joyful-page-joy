// Run: node --test supabase/functions/_shared/creditdirect.test.ts   (Node 22+)
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  authHeaders, buildCreateBody, createSession, evaluateCreditDirect, extractCheckoutUrl, fetchStatus,
  findOurReference, loadCreditDirectConfig, ngPhone, signatureValid, terminalFailure,
} from './creditdirect.ts';
import { hmacHex } from './klump.ts';

const ENV = {
  CREDITDIRECT_API_BASE_URL: 'https://api.example-cd.test/',
  CREDITDIRECT_SECRET_KEY: 'sk_test_123',
  CREDITDIRECT_CREATE_PATH: 'v1/checkout',
  CREDITDIRECT_VERIFY_PATH: '/v1/checkout/{reference}/verify',
};
const cfgOf = (extra: Record<string, string> = {}) => {
  const r = loadCreditDirectConfig((k) => ({ ...ENV, ...extra } as Record<string, string>)[k]);
  assert.ok(r.config, JSON.stringify(r)); return r.config!;
};
const REF = 'order-3f0c2a52-8a5c-4f0e-9d0a-0d1d3d9d7a11';
const ev = (json: any, over: Record<string, string> = {}, amount = 150000) =>
  evaluateCreditDirect(json, { amountNaira: amount, reference: REF }, cfgOf(over), REF);

test('config: reports every missing secret by name and never guesses', () => {
  const r = loadCreditDirectConfig(() => undefined);
  assert.equal(r.config, undefined);
  assert.deepEqual(r.missing, ['CREDITDIRECT_API_BASE_URL', 'CREDITDIRECT_SECRET_KEY', 'CREDITDIRECT_CREATE_PATH', 'CREDITDIRECT_VERIFY_PATH']);
});
test('config: rejects http base url, missing {reference}, bad JSON, bad unit', () => {
  const r = loadCreditDirectConfig((k) => ({
    ...ENV, CREDITDIRECT_API_BASE_URL: 'http://x.test', CREDITDIRECT_VERIFY_PATH: '/verify',
    CREDITDIRECT_EXTRA_BODY: '{nope', CREDITDIRECT_AMOUNT_UNIT: 'dollars',
  } as Record<string, string>)[k]);
  assert.equal(r.config, undefined);
  assert.equal(r.problems.length, 4);
});
test('config: defaults and normalised paths', () => {
  const c = cfgOf();
  assert.equal(c.baseUrl, 'https://api.example-cd.test');
  assert.equal(c.createPath, '/v1/checkout');
  assert.equal(c.authHeader, 'Authorization'); assert.equal(c.authScheme, 'Bearer');
  assert.equal(c.requireLive, false); assert.equal(c.echoesReference, true);
  assert.deepEqual(authHeaders(c).Authorization, 'Bearer sk_test_123');
  const raw = cfgOf({ CREDITDIRECT_AUTH_HEADER: 'X-Api-Key', CREDITDIRECT_AUTH_SCHEME: '' });
  assert.equal(authHeaders(raw)['X-Api-Key'], 'sk_test_123');
});

test('create body: whole-naira or kobo, extra body merged, blanks dropped', () => {
  const input = {
    orderId: 'o1', reference: REF, amountNaira: 107500, callbackUrl: 'https://shop.test/pay-later/return?order=o1',
    items: [{ name: 'Laptop', unitPriceNaira: 100000, quantity: 1 }, { name: 'VAT (7.5%)', unitPriceNaira: 7500, quantity: 1 }],
    customer: { name: 'Ada Obi', email: 'a@b.co', phone: '' },
  };
  const n: any = buildCreateBody(input, cfgOf({ CREDITDIRECT_EXTRA_BODY: '{"merchant_id":"M1"}' }));
  assert.equal(n.amount, 107500); assert.equal(n.merchant_id, 'M1'); assert.equal(n.reference, REF);
  assert.equal('phone' in n.customer, false);
  const k: any = buildCreateBody(input, cfgOf({ CREDITDIRECT_AMOUNT_UNIT: 'kobo' }));
  assert.equal(k.amount, 10750000); assert.equal(k.items[0].unit_price, 10000000);
});

test('phone normalisation', () => {
  assert.equal(ngPhone('+234 801 234 5678'), '08012345678');
  assert.equal(ngPhone('0801 234 5678'), '08012345678');
  assert.equal(ngPhone('123'), undefined);
});

test('checkout url: https only, nested ok, javascript: and http rejected', () => {
  assert.equal(extractCheckoutUrl({ data: { checkout_url: 'https://pay.cd.test/c/abc' } }), 'https://pay.cd.test/c/abc');
  assert.equal(extractCheckoutUrl({ link: 'http://pay.cd.test/x' }), undefined);
  assert.equal(extractCheckoutUrl({ url: 'javascript:alert(1)' }), undefined);
  assert.equal(extractCheckoutUrl({ nothing: true }), undefined);
});

const GOOD = { status: true, data: { status: 'successful', amount: 150000, currency: 'NGN', reference: REF, id: 'cd_777' } };

test('verify: a matching successful transaction is accepted', () => {
  const o = ev(GOOD);
  assert.equal(o.ok, true); assert.equal(o.providerRef, 'cd_777');
});
test('verify: pending / failed / missing status is refused', () => {
  for (const s of ['pending', 'approved', 'failed', 'abandoned', '']) {
    assert.equal(ev({ data: { ...GOOD.data, status: s } }).ok, false, s);
  }
  assert.equal(ev({ data: { amount: 150000, reference: REF } }).ok, false);
});
test('verify: wrong amount, wrong currency, unreadable amount are refused', () => {
  assert.match(ev({ data: { ...GOOD.data, amount: 149999 } }).reason, /Amount mismatch/);
  assert.match(ev({ data: { ...GOOD.data, currency: 'USD' } }).reason, /Currency/);
  const { amount, ...noAmount } = GOOD.data;
  assert.match(ev({ data: noAmount }).reason, /amount/);
});
test('verify: someone else\'s reference is refused (strict), allowed only when configured', () => {
  const other = { data: { ...GOOD.data, reference: 'order-00000000-0000-0000-0000-000000000000' } };
  assert.match(ev(other).reason, /order reference/);
  assert.equal(ev(other, { CREDITDIRECT_RESPONSE_ECHOES_REFERENCE: 'false' }).ok, true);
});
test('verify: kobo amounts compare in kobo', () => {
  const kobo = { data: { ...GOOD.data, amount: 15000000 } };
  assert.equal(ev(kobo, { CREDITDIRECT_AMOUNT_UNIT: 'kobo' }).ok, true);
  assert.equal(ev(kobo).ok, false);
});
test('verify: a nested item status cannot fake success; transaction level wins', () => {
  const sneaky = { data: { status: 'pending', amount: 150000, reference: REF, items: [{ status: 'successful' }] } };
  assert.equal(ev(sneaky).ok, false);
  const nested = { data: { transaction: { status: 'completed', amount: 150000, reference: REF, id: 't1' }, status: 'pending' } };
  assert.equal(ev(nested).ok, true);
});
test('verify: test payment rejected in live mode, allowed when no signal', () => {
  assert.match(ev({ data: { ...GOOD.data, is_live: false } }, { CREDITDIRECT_ENV: 'live' }).reason, /Test transaction/);
  assert.match(ev({ data: { ...GOOD.data, mode: 'sandbox' } }, { CREDITDIRECT_ENV: 'live' }).reason, /Test transaction/);
  assert.equal(ev({ data: { ...GOOD.data, is_live: true } }, { CREDITDIRECT_ENV: 'live' }).ok, true);
  assert.equal(ev(GOOD, { CREDITDIRECT_ENV: 'live' }).ok, true);
  assert.equal(ev({ data: { ...GOOD.data, is_live: false } }, { CREDITDIRECT_ENV: 'test' }).ok, true);
});
test('verify: custom success statuses and amount field', () => {
  assert.equal(ev({ data: { ...GOOD.data, status: 'approved' } }, { CREDITDIRECT_SUCCESS_STATUSES: 'approved' }).ok, true);
  const d = { data: { status: 'successful', amount: 30000, order_total: 150000, reference: REF, id: 'x' } };
  assert.equal(ev(d).ok, false);
  assert.equal(ev(d, { CREDITDIRECT_AMOUNT_FIELD: 'order_total' }).ok, true);
});
test('verify: garbage input is refused', () => {
  for (const g of [null, undefined, 'ok', 12, []]) assert.equal(ev(g as any).ok, false);
});

test('terminal failure + reference finder', () => {
  assert.equal(terminalFailure({ data: { status: 'abandoned' } }), 'abandoned');
  assert.equal(terminalFailure({ data: { status: 'declined' } }), 'failed');
  assert.equal(terminalFailure({ data: { status: 'pending' } }), null);
  assert.equal(findOurReference({ event: 'x', data: { merchant_ref: REF, other: 'order-short' } }), REF);
  assert.equal(findOurReference({ data: { a: 'order-nope' } }), undefined);
});

test('signature: hex, base64, sha256= prefix, wrong, missing', async () => {
  const body = '{"a":1}';
  const hex = await hmacHex('whsec', body);
  const b64 = Buffer.from(hex, 'hex').toString('base64');
  assert.equal(await signatureValid('whsec', body, hex), true);
  assert.equal(await signatureValid('whsec', body, hex.toUpperCase()), true);
  assert.equal(await signatureValid('whsec', body, 'sha256=' + hex), true);
  assert.equal(await signatureValid('whsec', body, b64), true);
  assert.equal(await signatureValid('whsec', body, hex.replace(/.$/, '0')), false);
  assert.equal(await signatureValid('other', body, hex), false);
  assert.equal(await signatureValid('whsec', body + ' ', hex), false);
  assert.equal(await signatureValid('whsec', body, null), false);
});

test('createSession / fetchStatus against a mock server', async () => {
  const seen: any[] = [];
  const mock = async (url: string, init?: RequestInit) => {
    seen.push({ url, method: init?.method, headers: init?.headers, body: init?.body });
    if (url.endsWith('/v1/checkout')) return new Response(JSON.stringify({ data: { checkout_url: 'https://pay.cd.test/c/1' } }), { status: 201 });
    if (url.includes('/verify')) return new Response(JSON.stringify(GOOD), { status: 200 });
    return new Response('{}', { status: 404 });
  };
  const cfg = cfgOf();
  const made = await createSession(cfg, { amount: 1 }, mock as any);
  assert.equal(made.ok, true);
  assert.equal(seen[0].url, 'https://api.example-cd.test/v1/checkout');
  assert.equal(seen[0].headers.Authorization, 'Bearer sk_test_123');
  const st = await fetchStatus(cfg, REF, mock as any);
  assert.equal(st.httpOk, true);
  assert.equal(seen[1].url, `https://api.example-cd.test/v1/checkout/${REF}/verify`);
  assert.equal(seen[1].method, 'GET');

  const refused = await createSession(cfg, {}, (async () => new Response(JSON.stringify({ message: 'Invalid key sk_test_123' }), { status: 401 })) as any);
  assert.equal(refused.ok, false);
  const noLink = await createSession(cfg, {}, (async () => new Response('{"data":{}}', { status: 200 })) as any);
  assert.equal(noLink.ok, false);
  const html = await createSession(cfg, {}, (async () => new Response('<html>', { status: 502 })) as any);
  assert.equal(html.ok, false);
});

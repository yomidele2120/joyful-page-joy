// Run from the project root:  node --import ./scripts/creditdirect-test/register.mjs scripts/creditdirect-test/run.mjs
import assert from 'node:assert/strict';
import { state, reset } from './fake-supabase.mjs';
import { hmacHex } from '../../supabase/functions/_shared/klump.ts';

// ---- Deno shim: capture the handler each function registers ----------------------------------------------
const env = {
  SUPABASE_URL: 'https://x.supabase.test', SUPABASE_SERVICE_ROLE_KEY: 'svc', SITE_URL: 'https://shop.test',
  CREDITDIRECT_API_BASE_URL: 'https://api.cd.test', CREDITDIRECT_SECRET_KEY: 'sk_cd', CREDITDIRECT_CREATE_PATH: '/v1/checkout',
  CREDITDIRECT_VERIFY_PATH: '/v1/checkout/{reference}/verify', CREDITDIRECT_WEBHOOK_SECRET: 'whsec',
};
let current;
globalThis.Deno = { env: { get: (k) => env[k] }, serve: (h) => { current = h; } };
const load = async (name) => { await import(`../../supabase/functions/${name}/index.ts?x=${name}`); return current; };
const init = await load('creditdirect-initialize');
const verify = await load('creditdirect-verify');
const hook = await load('creditdirect-webhook');

// ---- Fake Credit Direct ------------------------------------------------------------------------------------
const cd = { created: [], status: 'pending', amount: 107500, reference: null, down: false };
globalThis.fetch = async (url, init2) => {
  if (url === 'https://api.cd.test/v1/checkout') {
    assert.equal(init2.headers.Authorization, 'Bearer sk_cd');
    const body = JSON.parse(init2.body); cd.created.push(body); cd.reference = body.reference;
    if (cd.down) return new Response('{"message":"boom sk_cd"}', { status: 500 });
    return new Response(JSON.stringify({ data: { checkout_url: 'https://pay.cd.test/c/xyz' } }), { status: 201 });
  }
  if (url.startsWith('https://api.cd.test/v1/checkout/')) {
    return new Response(JSON.stringify({ data: { status: cd.status, amount: cd.amount, currency: 'NGN', reference: cd.reference, id: 'cd_tx_1' } }), { status: 200 });
  }
  throw new Error('unexpected fetch ' + url);
};

// ---- Seed --------------------------------------------------------------------------------------------------
const ORDER = '3f0c2a52-8a5c-4f0e-9d0a-0d1d3d9d7a11';
const REF = `order-${ORDER}`;
const seed = (provider = 'creditdirect') => reset({
  orders: [{ id: ORDER, user_id: 'u1', email: 'a@b.co', total: 107500, status: 'pending', payment_method: 'bnpl', bnpl_fee: 0 }],
  finance_settings: [{ id: true, bnpl_enabled: true, bnpl_provider: provider, bnpl_fee_bearer: 'platform' }],
  order_items: [{ order_id: ORDER, quantity: 1, price: 100000, products: { name: 'Laptop', image_url: 'https://img.test/a.jpg', slug: 'laptop' } }],
  bnpl_transactions: [], bnpl_webhook_events: [], payments: [],
});
state.users = { 'tok-u1': 'u1', 'tok-u2': 'u2', 'tok-admin': 'adm' };
state.admins = new Set(['adm']);
const call = (h, token, body, extraHeaders = {}) => h(new Request('https://f.test/', {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extraHeaders }, body: typeof body === 'string' ? body : JSON.stringify(body),
}));
const j = async (res) => ({ status: res.status, body: await res.json() });
const tx = () => state.tables.bnpl_transactions[0];
const order = () => state.tables.orders[0];
let n = 0; const ok = (name) => console.log(`  ok ${++n} - ${name}`);

// 1 -------------------------------------------------------------------------------------------------------------
seed();
assert.equal((await j(await call(init, null, { order_id: ORDER }))).status, 401); ok('initialize rejects a missing sign-in');
assert.equal((await j(await call(init, 'bad', { order_id: ORDER }))).status, 401); ok('initialize rejects a bad token');
assert.deepEqual((await j(await call(init, 'tok-u1', { warmup: true }))).body, { warm: true }); ok('warmup answers');

let r = await j(await call(init, 'tok-u1', { status: true }));
assert.equal(r.status, 403); ok('status check is admin-only');
r = await j(await call(init, 'tok-admin', { status: true }));
assert.deepEqual([r.body.configured, r.body.missing], [true, []]); ok('admin sees configured=true');
const saved = { ...env }; delete env.CREDITDIRECT_SECRET_KEY; delete env.CREDITDIRECT_VERIFY_PATH;
r = await j(await call(init, 'tok-admin', { status: true }));
assert.deepEqual(r.body.missing, ['CREDITDIRECT_SECRET_KEY', 'CREDITDIRECT_VERIFY_PATH']); assert.equal(r.body.configured, false);
assert.ok(!JSON.stringify(r.body).includes('sk_cd')); ok('admin sees exactly which secrets are missing (names only)');
r = await j(await call(init, 'tok-u1', { order_id: ORDER, customer_name: 'Ada Obi', phone: '08012345678' }));
assert.equal(r.status, 503); assert.equal(state.tables.bnpl_transactions.length, 0); ok('buyer gets a safe message and nothing is created when not configured');
Object.assign(env, saved);

// 2 -------------------------------------------------------------------------------------------------------------
r = await j(await call(init, 'tok-u2', { order_id: ORDER }));
assert.equal(r.status, 404); ok("someone else's order is refused");
seed('klump');
r = await j(await call(init, 'tok-u1', { order_id: ORDER, customer_name: 'Ada Obi', phone: '08012345678' }));
assert.equal(r.status, 409); assert.equal(state.tables.bnpl_transactions.length, 0); ok('a stale tab cannot start Credit Direct while Klump is the active provider');
seed('creditdirect');
r = await j(await call(init, 'tok-u1', { order_id: ORDER, customer_name: 'Ada Obi', phone: '+234 801 234 5678' }));
assert.equal(r.status, 200); assert.equal(r.body.checkout_url, 'https://pay.cd.test/c/xyz'); ok('initialize returns the hosted checkout link');
const sent = cd.created.at(-1);
assert.equal(sent.amount, 107500); assert.equal(sent.reference, REF);
assert.equal(sent.items.reduce((s, i) => s + i.unit_price * i.quantity, 0), sent.amount); ok('amount comes from the DB and the items add up to it exactly (VAT line added)');
assert.equal(sent.callback_url, `https://shop.test/pay-later/return?order=${ORDER}`); assert.equal(sent.customer.phone, '08012345678'); ok('return URL and phone are correct');
assert.deepEqual([tx().provider, tx().status, tx().checkout_url], ['creditdirect', 'initiated', 'https://pay.cd.test/c/xyz']); ok('transaction row records provider and link');

r = await j(await call(init, 'tok-u1', { order_id: ORDER, customer_name: 'Ada Obi' }));
assert.equal(r.status, 200); assert.equal(state.tables.bnpl_transactions.length, 1); ok('retrying reuses the same transaction row');

cd.down = true;
r = await j(await call(init, 'tok-u1', { order_id: ORDER }));
assert.equal(r.status, 502); assert.ok(!JSON.stringify(r.body).includes('sk_cd')); assert.equal(tx().status, 'failed'); cd.down = false; ok('provider outage: safe message, no secret leaked, attempt marked failed');
await call(init, 'tok-u1', { order_id: ORDER }); // retry works after failure
assert.equal(tx().status, 'initiated'); ok('buyer can retry after a failure');

// 3 verify ------------------------------------------------------------------------------------------------------
r = await j(await call(verify, 'tok-u2', { order_id: ORDER }));
assert.equal(r.status, 404); ok("verify: another user cannot confirm someone else's order");
cd.status = 'pending';
r = await j(await call(verify, 'tok-u1', { order_id: ORDER }));
assert.equal(r.status, 202); assert.equal(order().status, 'pending'); ok('verify: still pending at Credit Direct -> 202, order untouched');
cd.status = 'successful'; cd.amount = 5000;
r = await j(await call(verify, 'tok-u1', { order_id: ORDER }));
assert.equal(r.status, 202); assert.equal(order().status, 'pending'); assert.ok(tx().raw_verify); ok('verify: wrong amount is NOT accepted (kept for diagnosis)');
cd.amount = 107500;
r = await j(await call(verify, 'tok-u1', { order_id: ORDER }));
assert.equal(r.status, 200); assert.equal(r.body.success, true); assert.equal(order().status, 'paid');
assert.deepEqual([tx().status, tx().provider_reference, state.tables.payments[0].payment_method], ['successful', 'cd_tx_1', 'creditdirect_bnpl']); ok('verify: matching payment marks the order paid and records creditdirect_bnpl');
r = await j(await call(verify, 'tok-u1', { order_id: ORDER }));
assert.equal(r.body.already, true); ok('verify is idempotent');
r = await j(await call(init, 'tok-u1', { order_id: ORDER }));
assert.equal(r.status, 400); ok('a paid order cannot be started again');

// 4 declined ----------------------------------------------------------------------------------------------------
seed(); await call(init, 'tok-u1', { order_id: ORDER, customer_name: 'Ada Obi' });
cd.status = 'declined';
r = await j(await call(verify, 'tok-u1', { order_id: ORDER }));
assert.equal(r.body.failed, true); assert.equal(tx().status, 'failed'); assert.equal(order().status, 'pending'); ok('declined at Credit Direct -> attempt closed, order not paid');

// 5 webhook -----------------------------------------------------------------------------------------------------
seed(); await call(init, 'tok-u1', { order_id: ORDER, customer_name: 'Ada Obi' });
cd.status = 'successful'; cd.amount = 107500;
const body = JSON.stringify({ event: 'checkout.successful', data: { merchant_reference: REF, status: 'successful' } });
r = await j(await call(hook, null, body, { 'x-signature': 'deadbeef' }));
assert.equal(r.status, 401); assert.equal(order().status, 'pending'); ok('webhook: bad signature rejected');
r = await j(await call(hook, null, body));
assert.equal(r.status, 401); ok('webhook: missing signature rejected when a secret is set');
const sig = await hmacHex('whsec', body);
r = await j(await call(hook, null, body, { 'x-signature': sig }));
assert.equal(r.status, 200); assert.equal(order().status, 'paid'); assert.equal(tx().provider_reference, 'cd_tx_1'); ok('webhook: valid signature -> verified with Credit Direct -> order paid');
r = await j(await call(hook, null, body, { 'x-signature': sig }));
assert.equal(r.body.duplicate, true); ok('webhook: replay is ignored');

seed(); await call(init, 'tok-u1', { order_id: ORDER, customer_name: 'Ada Obi' });
cd.status = 'pending';
const forged = JSON.stringify({ event: 'checkout.successful', data: { merchant_reference: REF, status: 'successful' } });
r = await j(await call(hook, null, forged, { 'x-signature': await hmacHex('whsec', forged) }));
assert.equal(order().status, 'pending'); ok('webhook claims success but Credit Direct says pending -> order NOT paid (webhook is only a hint)');
const unknown = JSON.stringify({ data: { merchant_reference: 'order-00000000-0000-0000-0000-000000000000' } });
r = await j(await call(hook, null, unknown, { 'x-signature': await hmacHex('whsec', unknown) }));
assert.equal(r.status, 200); ok('webhook: unknown reference is ignored safely');
assert.equal((await j(await call(hook, null, 'not json', { 'x-signature': await hmacHex('whsec', 'not json') }))).status, 200); ok('webhook: non-JSON body is ignored safely');

// 6 provider switched mid-flight --------------------------------------------------------------------------------
seed(); await call(init, 'tok-u1', { order_id: ORDER, customer_name: 'Ada Obi' });
state.tables.finance_settings[0].bnpl_provider = 'klump';       // admin flips the switch while the buyer is at Credit Direct
cd.status = 'successful';
r = await j(await call(verify, 'tok-u1', { order_id: ORDER }));
assert.equal(r.body.success, true); assert.equal(order().status, 'paid'); ok('switching provider mid-flight does NOT strand a payment already started with Credit Direct');
// klump tx cannot be verified through the Credit Direct endpoint
seed(); state.tables.bnpl_transactions.push({ order_id: ORDER, user_id: 'u1', reference: REF, amount: 107500, status: 'initiated', provider: 'klump' });
r = await j(await call(verify, 'tok-u1', { order_id: ORDER }));
assert.equal(r.status, 400); ok('a Klump transaction cannot be confirmed through the Credit Direct function');

console.log(`\nall ${n} handler checks passed`);

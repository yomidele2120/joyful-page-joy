// Run from the project root:  node --import ./scripts/creditdirect-test/register.mjs scripts/creditdirect-test/zego-token-run.mjs
import assert from 'node:assert/strict';
import { createDecipheriv } from 'node:crypto';
import { state, reset } from './fake-supabase.mjs';

const env = { SUPABASE_URL: 'https://x.supabase.test', SUPABASE_SERVICE_ROLE_KEY: 'svc', ZEGO_APP_ID: '123456789', ZEGO_SERVER_SECRET: '0123456789abcdef0123456789abcdef' };
let current;
globalThis.Deno = { env: { get: (k) => env[k] }, serve: (h) => { current = h; } };
await import('../../supabase/functions/zego-token/index.ts');
const fn = current;

const U1 = '3f0c2a52-8a5c-4f0e-9d0a-0d1d3d9d7a11', U2 = '11111111-2222-3333-4444-555555555555';
state.users = { t1: U1, t2: U2, tadmin: 'adm' }; state.admins = new Set(['adm']);
const seed = (enabled) => reset({
  marketplace_settings: [{ calls_enabled: enabled }],
  vendors: [{ user_id: U1, store_name: 'Stormar Ltd' }],
  profiles: [{ user_id: U2, full_name: 'Ada Buyer' }],
});
const call = (token, body) => fn(new Request('https://f.test/', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) }));
const j = async (r) => ({ status: r.status, body: await r.json() });
let n = 0; const ok = (m) => console.log(`  ok ${++n} - ${m}`);

function open(token, secret) {            // decrypt token04 independently of the generator
  assert.equal(token.slice(0, 2), '04');
  const b = Buffer.from(token.slice(2), 'base64');
  const ivLen = b.readUInt16BE(8), iv = b.subarray(10, 10 + ivLen);
  const cLen = b.readUInt16BE(10 + ivLen), c = b.subarray(12 + ivLen, 12 + ivLen + cLen);
  const d = createDecipheriv(`aes-${secret.length * 8}-cbc`, Buffer.from(secret), iv);
  return JSON.parse(Buffer.concat([d.update(c), d.final()]).toString());
}

seed(true);
assert.equal((await j(await call(null, {}))).status, 401); ok('no sign-in is refused');
assert.equal((await j(await call('bad', {}))).status, 401); ok('bad token is refused');

let r = await j(await call('t1', {}));
assert.equal(r.status, 200);
assert.equal(r.body.appId, 123456789);
assert.equal(r.body.userId, U1.replace(/-/g, ''));
assert.equal(r.body.userName, 'Stormar Ltd'); ok('supplier gets a token named after the store');
const p = open(r.body.token, env.ZEGO_SERVER_SECRET);
assert.equal(p.app_id, 123456789); assert.equal(p.user_id, U1.replace(/-/g, ''));
assert.ok(p.expire - p.ctime === 86400); ok('token decrypts with the secret and is bound to this user and app for 24h');
assert.ok(!JSON.stringify(r.body).includes(env.ZEGO_SERVER_SECRET)); ok('the secret is never in the response');

r = await j(await call('t2', {}));
assert.equal(r.body.userName, 'Ada Buyer'); ok('buyer is named from profile');

r = await j(await call('t1', { status: true })); assert.equal(r.status, 403); ok('status is admin-only');
r = await j(await call('tadmin', { status: true }));
assert.deepEqual(r.body, { calls_enabled: true, configured: true, missing: [] }); ok('admin sees ready status');

seed(false);
r = await j(await call('t1', {})); assert.equal(r.status, 403); ok('switch off: no tokens issued');
r = await j(await call('tadmin', { status: true })); assert.equal(r.body.calls_enabled, false); ok('admin status shows switch off');

seed(true);
delete env.ZEGO_SERVER_SECRET;
r = await j(await call('t1', {})); assert.equal(r.status, 503); assert.ok(!JSON.stringify(r.body).includes('ZEGO')); ok('missing secret: safe 503');
r = await j(await call('tadmin', { status: true })); assert.deepEqual(r.body.missing, ['ZEGO_SERVER_SECRET']); ok('admin is told which key is missing');
env.ZEGO_SERVER_SECRET = 'short';
r = await j(await call('tadmin', { status: true })); assert.deepEqual(r.body.missing, ['ZEGO_SERVER_SECRET']); ok('wrong-length secret is flagged');
env.ZEGO_SERVER_SECRET = '0123456789abcdef0123456789abcdef'; env.ZEGO_APP_ID = 'abc';
r = await j(await call('tadmin', { status: true })); assert.deepEqual(r.body.missing, ['ZEGO_APP_ID']); ok('non-numeric AppID is flagged');
console.log(`\n${n} checks passed`);

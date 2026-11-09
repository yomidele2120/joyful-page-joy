// Run: node --test supabase/functions/_shared/zegoToken.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDecipheriv } from 'node:crypto';
import { generateToken04, toZegoUserId } from './zegoToken.ts';

const SECRET = '0123456789abcdef0123456789abcdef';   // 32 chars, like a real ServerSecret
const decode = (token: string, secret = SECRET) => {
  assert.equal(token.slice(0, 2), '04');
  const buf = Buffer.from(token.slice(2), 'base64');
  const expire = Number(buf.readBigInt64BE(0));
  const ivLen = buf.readUInt16BE(8);
  const iv = buf.subarray(10, 10 + ivLen);
  const cLen = buf.readUInt16BE(10 + ivLen);
  const cipher = buf.subarray(12 + ivLen, 12 + ivLen + cLen);
  assert.equal(12 + ivLen + cLen, buf.length, 'no trailing bytes');
  const algo = ({ 16: 'aes-128-cbc', 24: 'aes-192-cbc', 32: 'aes-256-cbc' } as any)[secret.length];
  const d = createDecipheriv(algo, Buffer.from(secret), iv);
  const json = JSON.parse(Buffer.concat([d.update(cipher), d.final()]).toString('utf8'));
  return { expire, ivLen, iv: iv.toString(), json };
};

test('token layout and contents decrypt back correctly', async () => {
  const now = 1_800_000_000_000;
  const t = await generateToken04(123456789, 'abcd1234abcd1234abcd1234abcd1234', SECRET, 86400, { nowMs: now });
  const { expire, ivLen, iv, json } = decode(t);
  assert.equal(ivLen, 16); assert.match(iv, /^[0-9a-zA-Z]{16}$/);
  assert.equal(expire, 1_800_000_000 + 86400);
  assert.deepEqual(Object.keys(json).sort(), ['app_id', 'ctime', 'expire', 'nonce', 'payload', 'user_id']);
  assert.equal(json.app_id, 123456789); assert.equal(json.user_id, 'abcd1234abcd1234abcd1234abcd1234');
  assert.equal(json.ctime, 1_800_000_000); assert.equal(json.expire, expire); assert.equal(json.payload, '');
  assert.ok(Number.isInteger(json.nonce) && Math.abs(json.nonce) < 2 ** 31);
});

test('every token is different (random iv and nonce) and wrong secret cannot decrypt', async () => {
  const a = await generateToken04(1, 'u', SECRET, 60);
  const b = await generateToken04(1, 'u', SECRET, 60);
  assert.notEqual(a, b);
  assert.throws(() => decode(a, 'x'.repeat(32)));
});

test('16 and 24 character secrets use AES-128 / AES-192', async () => {
  for (const len of [16, 24]) {
    const s = 'k'.repeat(len);
    assert.equal(decode(await generateToken04(7, 'u', s, 60), s).json.app_id, 7);
  }
});

test('payload is carried through', async () => {
  const p = JSON.stringify({ room_id: 'r1' });
  assert.equal(decode(await generateToken04(7, 'u', SECRET, 60, { payload: p })).json.payload, p);
});

test('bad input is refused', async () => {
  await assert.rejects(generateToken04(0, 'u', SECRET, 60));
  await assert.rejects(generateToken04(1.5, 'u', SECRET, 60));
  await assert.rejects(generateToken04(1, '', SECRET, 60));
  await assert.rejects(generateToken04(1, 'u', 'short', 60));
  await assert.rejects(generateToken04(1, 'u', SECRET, 0));
});

test('uuid becomes a 32 character zego id', () => {
  const id = toZegoUserId('3F0C2A52-8A5C-4F0E-9D0A-0D1D3D9D7A11');
  assert.equal(id, '3f0c2a528a5c4f0e9d0a0d1d3d9d7a11'); assert.equal(id.length, 32);
});

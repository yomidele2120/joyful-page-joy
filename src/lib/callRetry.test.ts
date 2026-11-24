import { test } from 'vitest';
import assert from 'node:assert/strict';
import { inviteWithRetry, isNotLoggedInError, sendWhenLoggedIn } from './callRetry';
import { urlBase64ToUint8Array } from './webPushKey';

const clock = () => { let t = 0; return { now: () => t, sleep: async (ms: number) => { t += ms; } }; };

test('reaches them at once: no alert, no retry', async () => {
  let sends = 0, offline = 0; const c = clock();
  const out = await inviteWithRetry({ send: async () => { sends++; return {}; }, isAborted: () => false, onOffline: () => { offline++; }, intervalMs: 5000, totalMs: 40000, ...c });
  assert.deepEqual([out, sends, offline], ['delivered', 1, 0]);
});
test('they open the site a few seconds later: alerted once, then delivered', async () => {
  let sends = 0, offline = 0; const c = clock();
  const out = await inviteWithRetry({ send: async () => (++sends < 3 ? { errorInvitees: [{}] } : {}), isAborted: () => false, onOffline: () => { offline++; }, intervalMs: 5000, totalMs: 40000, ...c });
  assert.deepEqual([out, sends, offline], ['delivered', 3, 1]);
});
test('never opens the site: gives up after about the total time', async () => {
  let sends = 0; const c = clock();
  const out = await inviteWithRetry({ send: async () => { sends++; return { errorInvitees: [{}] }; }, isAborted: () => false, onOffline: () => {}, intervalMs: 5000, totalMs: 40000, ...c });
  assert.equal(out, 'timeout');
  assert.ok(sends >= 7 && sends <= 9, `sends=${sends}`);
  assert.ok(c.now() <= 40000);
});
test('the caller cancels while ringing: stops at once', async () => {
  let sends = 0, aborted = false; const c = clock();
  const out = await inviteWithRetry({ send: async () => { sends++; if (sends === 2) aborted = true; return { errorInvitees: [{}] }; }, isAborted: () => aborted, onOffline: () => {}, intervalMs: 5000, totalMs: 40000, ...c });
  assert.deepEqual([out, sends], ['aborted', 2]);
});
test('a failed send is not swallowed', async () => {
  await assert.rejects(inviteWithRetry({ send: async () => { throw new Error('boom'); }, isAborted: () => false, onOffline: () => {}, intervalMs: 1, totalMs: 10 }), /boom/);
});
test('VAPID key conversion handles URL-safe base64 and missing padding', () => {
  const bytes = urlBase64ToUint8Array('AQID_-A');   // 01 02 03 ff e0
  assert.deepEqual(Array.from(bytes), [1, 2, 3, 255, 224]);
});

const notLogged = { code: 6000121, message: 'API.callInvite: Not logged with call.' };
test('recognises ZEGO error 6000121 in its different shapes', () => {
  assert.equal(isNotLoggedInError(notLogged), true);
  assert.equal(isNotLoggedInError(new Error('{"code":6000121,"message":"API.callInvite: Not logged with call."}')), true);
  assert.equal(isNotLoggedInError({ code: 1 }), false);
  assert.equal(isNotLoggedInError(null), false);
});
test('waits for sign-in and then succeeds', async () => {
  let n = 0; const sleeps: number[] = [];
  const r = await sendWhenLoggedIn({ send: async () => { if (++n < 3) throw notLogged; return 'ok'; }, isAborted: () => false, tries: 8, intervalMs: 1000, sleep: async (ms) => { sleeps.push(ms); } });
  assert.equal(r, 'ok'); assert.equal(n, 3); assert.deepEqual(sleeps, [1000, 1000]);
});
test('gives up after the allowed tries and throws the original error', async () => {
  let n = 0;
  await assert.rejects(sendWhenLoggedIn({ send: async () => { n++; throw notLogged; }, isAborted: () => false, tries: 3, intervalMs: 1, sleep: async () => {} }), (e) => e === notLogged);
  assert.equal(n, 4);
});
test('does not retry other errors, or after the caller cancelled', async () => {
  let n = 0;
  await assert.rejects(sendWhenLoggedIn({ send: async () => { n++; throw new Error('boom'); }, isAborted: () => false, tries: 5, intervalMs: 1, sleep: async () => {} }), /boom/);
  assert.equal(n, 1);
  n = 0;
  await assert.rejects(sendWhenLoggedIn({ send: async () => { n++; throw notLogged; }, isAborted: () => true, tries: 5, intervalMs: 1, sleep: async () => {} }), (e) => e === notLogged);
  assert.equal(n, 1);
});

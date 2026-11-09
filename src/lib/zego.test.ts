import { test } from 'vitest';
import assert from 'node:assert/strict';
import { toZegoUserId, fromZegoUserId, outcomeForEnd, formatDuration, callMessage, isGenuineIncomingCall, pairMayCall } from './zego';

const A = '3f0c2a52-8a5c-4f0e-9d0a-0d1d3d9d7a11', B = '11111111-2222-3333-4444-555555555555';
const row = (o = {}) => ({ caller_id: A, callee_id: B, call_type: 'voice' as const, status: 'ringing', ended_at: null, created_at: new Date().toISOString(), ...o });

test('id mapping round-trips and rejects junk', () => {
  assert.equal(toZegoUserId(A).length, 32);
  assert.equal(fromZegoUserId(toZegoUserId(A)), A);
  assert.equal(fromZegoUserId('abc'), null);
  assert.equal(fromZegoUserId('zz'.repeat(16)), null);
  assert.equal(fromZegoUserId(undefined), null);
});
test('end reasons map to outcomes', () => {
  assert.deepEqual(['Declined', 'Timeout', 'Canceled', 'Busy', 'LeaveRoom', 'weird', undefined].map(outcomeForEnd),
    ['declined', 'missed', 'cancelled', 'busy', 'ended', 'ended', 'ended']);
});
test('durations and chat lines', () => {
  assert.equal(formatDuration(95), '1:35'); assert.equal(formatDuration(5), '0:05'); assert.equal(formatDuration(-3), '0:00');
  assert.equal(callMessage('voice', 'ended', 95), 'Voice call · 1:35');
  assert.equal(callMessage('video', 'missed'), 'Missed video call');
  assert.equal(callMessage('video', 'declined'), 'Video call declined');
  assert.equal(callMessage('voice', 'cancelled'), 'Voice call cancelled');
});
test('incoming call gate', () => {
  const ctx = { me: B, callerZegoId: toZegoUserId(A) };
  assert.equal(isGenuineIncomingCall(row(), ctx), true);
  assert.equal(isGenuineIncomingCall(null, ctx), false, 'no row = forged ring');
  assert.equal(isGenuineIncomingCall(row({ caller_id: B }), ctx), false, 'row says someone else is the caller');
  assert.equal(isGenuineIncomingCall(row({ callee_id: A }), ctx), false, 'row is not addressed to me');
  assert.equal(isGenuineIncomingCall(row({ status: 'answered' }), ctx), false);
  assert.equal(isGenuineIncomingCall(row({ ended_at: new Date().toISOString() }), ctx), false);
  assert.equal(isGenuineIncomingCall(row({ created_at: new Date(Date.now() - 600_000).toISOString() }), ctx), false, 'stale row');
  assert.equal(isGenuineIncomingCall(row(), { me: B, callerZegoId: 'nope' }), false);
});
test('buttons only for buyer-supplier or supplier-supplier', () => {
  assert.equal(pairMayCall(false, true), true); assert.equal(pairMayCall(true, false), true);
  assert.equal(pairMayCall(true, true), true); assert.equal(pairMayCall(false, false), false);
});

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

import { parseCallMessage, callCardView, initialsOf } from './zego';
test('every line callMessage writes is recognised and round-trips', () => {
  for (const type of ['voice', 'video'] as const) {
    for (const status of ['ended', 'answered', 'declined', 'cancelled', 'busy', 'failed', 'missed']) {
      const p = parseCallMessage(callMessage(type, status, 95));
      assert.ok(p, `${type}/${status}`); assert.equal(p!.type, type);
    }
  }
  assert.deepEqual(parseCallMessage('Voice call · 1:35'), { type: 'voice', kind: 'completed', seconds: 95 });
  assert.equal(parseCallMessage('Missed video call')!.kind, 'missed');
  assert.equal(parseCallMessage('Video call could not connect')!.kind, 'failed');
  assert.equal(parseCallMessage('Voice call · line busy')!.kind, 'busy');
});
test('ordinary chat text is never mistaken for a call line', () => {
  for (const t of ['hello', 'Voice call', 'Can we do a voice call · tomorrow', 'Missed call', 'voice call · 1:35', 'Voice call · 1:35 please', '', null, undefined]) assert.equal(parseCallMessage(t as any), null, String(t));
});
test('call card text and start time', () => {
  const end = '2026-11-08T19:01:35.000Z';
  const done = callCardView({ type: 'voice', kind: 'completed', seconds: 95 }, true, end);
  assert.equal(done.title, 'Voice call'); assert.equal(done.direction, 'Outgoing'); assert.equal(done.duration, '1:35'); assert.equal(done.startedAt.toISOString(), '2026-11-08T19:00:00.000Z'); assert.equal(done.tone, 'ok');
  const missedIn = callCardView({ type: 'video', kind: 'missed' }, false, end);
  assert.equal(missedIn.title, 'Missed video call'); assert.equal(missedIn.tone, 'bad'); assert.equal(missedIn.direction, 'Incoming');
  assert.equal(callCardView({ type: 'video', kind: 'missed' }, true, end).title, 'Video call · no answer');
  assert.equal(callCardView({ type: 'voice', kind: 'cancelled' }, false, end).title, 'Missed voice call');
  assert.equal(callCardView({ type: 'voice', kind: 'declined' }, false, end).title, 'Voice call · declined');
});
test('initials', () => { assert.equal(initialsOf('Stormar Ltd'), 'SL'); assert.equal(initialsOf('bolt'), 'BO'); assert.equal(initialsOf('  '), '?'); assert.equal(initialsOf(null), '?'); });

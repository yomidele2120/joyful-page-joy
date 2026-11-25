import { test, beforeEach } from 'vitest';
import assert from 'node:assert/strict';

// Minimal stand-ins for the browser's media objects.
const track = (kind: 'audio' | 'video') => ({ kind, enabled: true, readyState: 'live' as 'live' | 'ended' });
const makeStream = () => { const a = track('audio'), v = track('video'); return { a, v, s: { getTracks: () => [a, v], getAudioTracks: () => [a], getVideoTracks: () => [v] } }; };

let produced: ReturnType<typeof makeStream>[] = [];
beforeEach(async () => {
  produced = [];
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: { getUserMedia: async () => { const m = makeStream(); produced.push(m); return m.s; } } } });
  const mod = await import('./localMedia');
  mod.resetLocalMedia();
});

test('mutes and unmutes the microphone without touching the camera', async () => {
  const m = await import('./localMedia');
  m.installMediaCapture();
  await (globalThis as any).navigator.mediaDevices.getUserMedia({ audio: true, video: true });
  assert.equal(m.setMicMuted(true), 1);
  assert.deepEqual([produced[0].a.enabled, produced[0].v.enabled], [false, true]);
  assert.equal(m.setMicMuted(false), 1);
  assert.equal(produced[0].a.enabled, true);
});

test('switches the camera off and on', async () => {
  const m = await import('./localMedia');
  m.installMediaCapture();
  await (globalThis as any).navigator.mediaDevices.getUserMedia({ audio: true, video: true });
  assert.equal(m.setCameraOff(true), 1);
  assert.deepEqual([produced[0].a.enabled, produced[0].v.enabled], [true, false]);
  m.setCameraOff(false);
  assert.equal(produced[0].v.enabled, true);
});

test('reports 0 when there is nothing to control, and ignores ended tracks', async () => {
  const m = await import('./localMedia');
  assert.equal(m.setMicMuted(true), 0);
  m.setMicMuted(false);
  m.installMediaCapture();
  await (globalThis as any).navigator.mediaDevices.getUserMedia({ audio: true });
  produced[0].a.readyState = 'ended'; produced[0].v.readyState = 'ended';
  assert.equal(m.setMicMuted(true), 0);
  m.setMicMuted(false);
});

test('a microphone opened while muted starts muted, and reset clears it', async () => {
  const m = await import('./localMedia');
  m.installMediaCapture();
  m.setMicMuted(true);
  await (globalThis as any).navigator.mediaDevices.getUserMedia({ audio: true });
  assert.equal(produced[0].a.enabled, false);
  m.resetLocalMedia();
  await (globalThis as any).navigator.mediaDevices.getUserMedia({ audio: true });
  assert.equal(produced[1].a.enabled, true);
});

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { pickSpeaker, pickEarpiece, canSwitchSpeaker } from './audioOutput';

const d = (label: string, deviceId = label) => ({ deviceId, label });

test('finds the loudspeaker and the earpiece on a phone', () => {
  const phone = [d('Default'), d('Speakerphone', 'spk'), d('Earpiece', 'ear')];
  assert.equal(pickSpeaker(phone)?.deviceId, 'spk');
  assert.equal(pickEarpiece(phone)?.deviceId, 'ear');
  assert.equal(canSwitchSpeaker(phone), true);
});
test('headsets, Bluetooth and the ear speaker never count as the loudspeaker', () => {
  assert.equal(pickSpeaker([d('Bluetooth speaker'), d('Headset'), d('Ear speaker'), d('Receiver')]), null);
});
test('no switch is offered without both outputs (desktop, iPhone, empty labels)', () => {
  assert.equal(canSwitchSpeaker([d('Speakers (Realtek)')]), false);
  assert.equal(canSwitchSpeaker([d('Default', 'default')]), false);
  assert.equal(canSwitchSpeaker([]), false);
  assert.equal(canSwitchSpeaker([d('', 'a'), d('', 'b')]), false);
});

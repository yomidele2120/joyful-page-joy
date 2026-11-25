// Lets our own call buttons mute the microphone and switch the camera off.
// ZEGO's call kit has no documented way to do either from outside its own buttons, so we remember the microphone and camera
// tracks the browser hands out while a call is on, and switch those tracks on and off. A switched-off track sends silence (or a
// black picture) to the other person, which is what muting means. Nothing here touches the network.

const streams = new Set<MediaStream>();
let micMuted = false;
let cameraOff = false;

const apply = (s: MediaStream) => {
  for (const t of s.getAudioTracks()) t.enabled = !micMuted;
  for (const t of s.getVideoTracks()) t.enabled = !cameraOff;
};
const prune = () => {
  for (const s of [...streams]) if (!s.getTracks().some((t) => t.readyState === 'live')) streams.delete(s);
};

/** Start remembering microphone/camera streams. Safe to call many times; does nothing where the browser has no media API. */
export function installMediaCapture(): void {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return;
  if ((navigator.mediaDevices.getUserMedia as { __capture?: boolean }).__capture) return;
  const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  const wrapped = async (constraints?: MediaStreamConstraints) => {
    const stream = await original(constraints);
    streams.add(stream);
    apply(stream);
    return stream;
  };
  (wrapped as { __capture?: boolean }).__capture = true;
  navigator.mediaDevices.getUserMedia = wrapped;
}

const liveTracks = (kind: 'audio' | 'video') => {
  prune();
  const out: MediaStreamTrack[] = [];
  for (const s of streams) for (const t of (kind === 'audio' ? s.getAudioTracks() : s.getVideoTracks())) if (t.readyState === 'live') out.push(t);
  return out;
};

/** Mute or unmute. Returns how many microphone tracks were changed (0 means the call has no microphone to control yet). */
export function setMicMuted(muted: boolean): number {
  micMuted = muted;
  const tracks = liveTracks('audio');
  tracks.forEach((t) => { t.enabled = !muted; });
  return tracks.length;
}

/** Camera off or on. Returns how many camera tracks were changed (0 on a voice call). */
export function setCameraOff(off: boolean): number {
  cameraOff = off;
  const tracks = liveTracks('video');
  tracks.forEach((t) => { t.enabled = !off; });
  return tracks.length;
}

export const hasMicrophone = () => liveTracks('audio').length > 0;
export const hasCamera = () => liveTracks('video').length > 0;

/** Call over: forget everything so the next call starts unmuted with the camera on. */
export function resetLocalMedia(): void {
  micMuted = false; cameraOff = false;
  streams.clear();
}

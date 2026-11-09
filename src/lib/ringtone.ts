// A simple phone ring made with the browser's own audio (no sound file to host).
//   incoming: a classic double-ring, every 3 seconds.   outgoing: a soft single ring-back tone, every 4 seconds.
// Browsers only allow sound after the person has used the page, which is normal for a signed-in member. If it is blocked, the
// call still works silently (the screen is the notification).

type Kind = 'incoming' | 'outgoing';
let ctx: AudioContext | null = null;
let primed: AudioContext | null = null;   // created inside a tap, so the browser lets it play later
let timer: number | null = null;

const AudioCtor = (): typeof AudioContext | null =>
  typeof window === 'undefined' ? null : (window.AudioContext ?? (window as any).webkitAudioContext ?? null);

function tone(c: AudioContext, freq: number, start: number, length: number, volume: number) {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(volume, start + 0.03);
  gain.gain.setValueAtTime(volume, start + length - 0.05);
  gain.gain.linearRampToValueAtTime(0, start + length);
  osc.connect(gain); gain.connect(c.destination);
  osc.start(start); osc.stop(start + length + 0.02);
}

function pattern(kind: Kind) {
  if (!ctx) return;
  const t = ctx.currentTime + 0.02;
  if (kind === 'incoming') {
    // two quick bursts of two notes
    for (const offset of [0, 0.5]) { tone(ctx, 880, t + offset, 0.18, 0.18); tone(ctx, 660, t + offset + 0.2, 0.18, 0.18); }
  } else {
    tone(ctx, 440, t, 1.0, 0.1); tone(ctx, 480, t, 1.0, 0.1);
  }
}

export function stopRingtone() {
  if (timer !== null) { window.clearInterval(timer); timer = null; }
  if (ctx) { const c = ctx; ctx = null; void c.close().catch(() => {}); }
}

/** Call this synchronously inside the tap that starts a call. Phones only allow sound that was unlocked by a tap, and the ring-back
 *  starts a moment later (after the network), when the tap no longer counts. */
export function primeRingtone() {
  const Ctor = AudioCtor();
  if (!Ctor) return;
  try {
    if (!primed || primed.state === 'closed') primed = new Ctor();
    void primed.resume().catch(() => {});
  } catch { primed = null; }
}

export function startRingtone(kind: Kind) {
  stopRingtone();
  const Ctor = AudioCtor();
  if (!Ctor) return;
  try {
    ctx = primed && primed.state !== 'closed' ? primed : new Ctor();
    primed = null;
    void ctx.resume().catch(() => {});
    pattern(kind);
    timer = window.setInterval(() => pattern(kind), kind === 'incoming' ? 3000 : 4000);
  } catch { stopRingtone(); }
}

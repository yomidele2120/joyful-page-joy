// ZEGO lets only ONE browser tab per person stay signed in to its messaging service: a second tab signs in and kicks the first
// one out, and call invitations then go to whichever tab won, which may be a background tab nobody is looking at.
// This keeps exactly one tab per person (per browser) as the "call tab" using the browser's Web Locks, and hands the role to
// the tab the person is actually looking at. Where Web Locks are missing, every tab is treated as the call tab (the old behaviour).

export interface TabElection { stop: () => void }

export function joinCallTabElection(userId: string, onChange: (isCallTab: boolean) => void, canYield: () => boolean): TabElection {
  const locks = typeof navigator !== 'undefined' ? (navigator as Navigator & { locks?: LockManager }).locks : undefined;
  if (!locks) { onChange(true); return { stop: () => {} }; }

  const name = `ithub-call-tab:${userId}`;
  let channel: BroadcastChannel | null = null;
  try { channel = new BroadcastChannel(name); } catch { channel = null; }
  let holding: (() => void) | null = null;       // resolves the lock we hold
  let waiting: AbortController | null = null;    // our place in the queue
  let stopped = false;
  const visible = () => typeof document === 'undefined' || document.visibilityState === 'visible';

  const take = (done: () => void) => {
    holding = done; waiting = null; onChange(true);
  };
  const queue = () => {
    if (stopped || holding || waiting) return;
    const ac = new AbortController(); waiting = ac;
    locks.request(name, { signal: ac.signal }, () => new Promise<void>((resolve) => { if (stopped) { resolve(); return; } take(resolve); })).catch(() => { waiting = null; });
  };
  const takeIfFree = () => {
    if (stopped || holding || waiting) return;
    locks.request(name, { ifAvailable: true }, (lock) => (lock && !stopped && !holding ? new Promise<void>((resolve) => take(resolve)) : undefined)).catch(() => {});
  };
  const release = () => {
    if (!holding) return;
    const r = holding; holding = null; onChange(false); r();
  };
  const leaveQueue = () => { if (waiting) { waiting.abort(); waiting = null; } };

  const onVisibility = () => {
    if (visible()) { queue(); channel?.postMessage({ t: 'want' }); }
    else if (!holding) leaveQueue();                // a background tab does not wait in line
  };
  if (channel) channel.onmessage = (e) => {
    // Someone is looking at another tab. Give them the role if we are in the background and not on a call.
    if (e.data?.t === 'want' && holding && !visible() && canYield()) release();
  };

  onChange(false);
  if (visible()) { queue(); channel?.postMessage({ t: 'want' }); } else takeIfFree();
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('focus', onVisibility);

  return {
    stop: () => {
      stopped = true;
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onVisibility);
      leaveQueue(); release();
      try { channel?.close(); } catch { /* already closed */ }
    },
  };
}

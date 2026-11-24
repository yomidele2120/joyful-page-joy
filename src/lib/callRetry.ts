// Placing a call to someone whose site is closed: ZEGO cannot reach them, so we alert them another way and keep trying
// to ring them for a short time. This helper holds only the timing logic, so it can be tested without ZEGO.

export interface InviteResult { errorInvitees?: unknown[] }
export type InviteOutcome = 'delivered' | 'aborted' | 'timeout';

export interface RetryOptions {
  /** Sends one invitation. Resolves with ZEGO's result: errorInvitees is non-empty when the other person could not be reached. */
  send: () => Promise<InviteResult | undefined>;
  isAborted: () => boolean;
  /** Called once, after the first attempt fails to reach them. */
  onOffline: () => void;
  intervalMs: number;
  totalMs: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export async function inviteWithRetry(o: RetryOptions): Promise<InviteOutcome> {
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => window.setTimeout(r, ms)));
  const now = o.now ?? Date.now;
  const start = now();
  let notified = false;
  for (;;) {
    if (o.isAborted()) return 'aborted';
    const res = await o.send();
    if (!res?.errorInvitees?.length) return 'delivered';
    if (!notified) { notified = true; o.onOffline(); }
    if (now() - start + o.intervalMs > o.totalMs) return 'timeout';
    await sleep(o.intervalMs);
  }
}

// ZEGO signs the user in to its messaging service a moment after calling starts (and again after a phone wakes up or the
// connection drops). An invitation sent before that finishes fails with code 6000121, "Not logged with call". That is not a
// real failure: wait a little and send again. This is separate from the "other person is offline" retry above.
export function isNotLoggedInError(e: unknown): boolean {
  if (!e) return false;
  const code = (e as { code?: unknown }).code;
  if (code === 6000121 || code === '6000121') return true;
  let text = '';
  try { text = typeof e === 'string' ? e : JSON.stringify(e) + ' ' + String((e as { message?: unknown }).message ?? ''); } catch { text = String(e); }
  return /6000121|not logged/i.test(text);
}

export interface LoginWaitOptions<T> {
  send: () => Promise<T>;
  isAborted: () => boolean;
  tries: number;
  intervalMs: number;
  sleep?: (ms: number) => Promise<void>;
}
/** Sends, and while ZEGO says it is not signed in yet, tries again every intervalMs, up to `tries` extra times. Other errors are thrown at once. */
export async function sendWhenLoggedIn<T>(o: LoginWaitOptions<T>): Promise<T> {
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => window.setTimeout(r, ms)));
  for (let i = 0; ; i++) {
    try { return await o.send(); }
    catch (e) {
      if (!isNotLoggedInError(e) || i >= o.tries || o.isAborted()) throw e;
      await sleep(o.intervalMs);
    }
  }
}

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

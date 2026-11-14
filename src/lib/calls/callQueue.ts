// Pure helpers for the call waiting queue (the queue itself lives in the database: see call_queue migration).
export type QueueAction = 'call_now' | 'queued' | 'already_queued' | 'queue_full' | 'unavailable';
export interface JoinResult { action: QueueAction; id?: string; position?: number; capacity?: number; reason?: string }
export interface QueueEntry {
  id: string; callee_id: string; call_type: 'voice' | 'video'; status: 'waiting' | 'offered'; joined_at: string;
  offer_expires_at: string | null; store_name: string | null; position: number;
}

const REASON: Record<string, string> = {
  queue_off: 'The waiting list is switched off right now.',
  calls_off: 'Calling is not switched on yet.',
  no_conversation: 'Send a message first, then you can call.',
  buyers_cannot_call_buyers: 'Calls are only between buyers and suppliers.',
  vendor_not_available: 'This supplier cannot take calls right now.',
  your_allowance_used: 'You have used your call allowance for now.',
  vendor_allowance_used: 'This supplier has used their call allowance for now. Please try later.',
  too_many_queues: 'You are already waiting for several suppliers. Leave one to join another.',
  queue_not_available: 'This supplier is busy and does not have a waiting list.',
};
export const queueReasonText = (reason?: string) => REASON[reason ?? ''] ?? 'You cannot join the waiting list right now.';

/** Whole seconds left on an offer (never negative). */
export function secondsLeft(offerExpiresAt: string | null, now = Date.now()): number {
  if (!offerExpiresAt) return 0;
  const t = new Date(offerExpiresAt).getTime();
  return Number.isFinite(t) ? Math.max(0, Math.ceil((t - now) / 1000)) : 0;
}
export function positionText(position: number): string {
  if (position <= 1) return "You're next";
  const n = position - 1;
  return `${n} ${n === 1 ? 'person is' : 'people are'} ahead of you`;
}
/** Decides what the call button should do with the server's answer. */
export function nextStep(r: JoinResult | null): 'call' | 'wait' | 'message' {
  if (!r) return 'call';                       // the queue could not be reached: fall back to a normal call attempt
  if (r.action === 'call_now') return 'call';
  if (r.action === 'queued' || r.action === 'already_queued') return 'wait';
  return 'message';
}

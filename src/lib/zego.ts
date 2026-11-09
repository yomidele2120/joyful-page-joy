// Small pure helpers for voice/video calling (kept free of React and of the ZEGO libraries so they can be tested alone).

export type CallType = 'voice' | 'video';
export type CallOutcome = 'answered' | 'ended' | 'declined' | 'missed' | 'cancelled' | 'busy' | 'failed';

/** ZEGO user ids are limited to 32 bytes, so a Supabase uuid is used without its dashes. */
export const toZegoUserId = (uuid: string) => uuid.replace(/-/g, '').toLowerCase();

/** The reverse of toZegoUserId. Returns null for anything that is not a 32-character hex id. */
export function fromZegoUserId(id: string | undefined | null): string | null {
  const h = String(id ?? '').toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(h)) return null;
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** ZEGO tells us why an invitation ended: Declined, Timeout, Canceled, Busy or LeaveRoom. */
export function outcomeForEnd(reason: string | undefined | null): CallOutcome {
  switch (String(reason ?? '').toLowerCase()) {
    case 'declined': return 'declined';
    case 'timeout': return 'missed';
    case 'canceled': case 'cancelled': return 'cancelled';
    case 'busy': return 'busy';
    default: return 'ended';          // LeaveRoom and anything new: the database decides if it was connected
  }
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds || 0));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

/** The line left in the chat after a call, written by the caller's browser. */
export function callMessage(type: CallType, status: string, seconds?: number | null): string {
  const label = type === 'video' ? 'Video call' : 'Voice call';
  switch (status) {
    case 'ended': case 'answered': return `${label} · ${formatDuration(seconds ?? 0)}`;
    case 'declined': return `${label} declined`;
    case 'cancelled': return `${label} cancelled`;
    case 'busy': return `${label} · line busy`;
    case 'failed': return `${label} could not connect`;
    default: return `Missed ${label.toLowerCase()}`;
  }
}

/** A ringing call row is only believable for a short time. */
export const CALL_FRESH_SECONDS = 120;

export interface CallRow { id?: string; caller_id: string; callee_id: string; call_type: CallType; status: string; ended_at: string | null; created_at: string }

/**
 * The receiving browser's gate. A call is real only if start_call created a row for it (that is where every rule and
 * rate limit is enforced, and nobody can write that table directly). Anything else is an unsolicited ring: refuse it.
 */
export function isGenuineIncomingCall(row: CallRow | null | undefined, ctx: { me: string; callerZegoId: string; nowMs?: number }): boolean {
  if (!row) return false;
  const callerUuid = fromZegoUserId(ctx.callerZegoId);
  if (!callerUuid || row.caller_id !== callerUuid || row.callee_id !== ctx.me) return false;
  if (row.ended_at || row.status !== 'ringing') return false;
  const age = ((ctx.nowMs ?? Date.now()) - new Date(row.created_at).getTime()) / 1000;
  return age >= -5 && age <= CALL_FRESH_SECONDS;
}

/** Can this pair call each other? Mirrors the database rule (which is the real enforcement) so buttons only show when it can work. */
export const pairMayCall = (meIsVendor: boolean, peerIsVendor: boolean) => meIsVendor || peerIsVendor;

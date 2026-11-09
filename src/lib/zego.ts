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

/** A ringing call is only believable for a short time. */
export const CALL_FRESH_SECONDS = 120;

/** What the database says about a call addressed to me (see incoming_call_info). The age is measured on the server. */
export interface IncomingCallInfo { caller_id: string; callee_id: string; call_type: CallType; status: string; ended: boolean; age_seconds: number }

/**
 * The receiving browser's gate. A call is real only if start_call created a record for it (that is where every rule and
 * rate limit is enforced, and nobody can write that table directly). Anything else is an unsolicited ring: refuse it.
 * The age comes from the server, so a phone with the wrong clock still accepts real calls.
 */
export function isGenuineIncomingCall(info: IncomingCallInfo | null | undefined, ctx: { me: string; callerZegoId: string }): boolean {
  if (!info) return false;
  const callerUuid = fromZegoUserId(ctx.callerZegoId);
  if (!callerUuid || info.caller_id !== callerUuid || info.callee_id !== ctx.me) return false;
  if (info.ended || info.status !== 'ringing') return false;
  const age = Number(info.age_seconds);
  return Number.isFinite(age) && age >= -5 && age <= CALL_FRESH_SECONDS;
}

/** Can this pair call each other? Mirrors the database rule (which is the real enforcement) so buttons only show when it can work. */
export const pairMayCall = (meIsVendor: boolean, peerIsVendor: boolean) => meIsVendor || peerIsVendor;

/* ------------------------- call lines in the chat, shown as cards ------------------------- */

export type CallLineKind = 'completed' | 'missed' | 'declined' | 'cancelled' | 'busy' | 'failed';
export interface ParsedCallLine { type: CallType; kind: CallLineKind; seconds?: number }

/** Recognises exactly the lines callMessage() writes, so the chat can show them as call cards. Anything else is normal text. */
export function parseCallMessage(content: string | null | undefined): ParsedCallLine | null {
  const t = String(content ?? '').trim();
  let m = /^(Voice|Video) call · (\d+):(\d{2})$/.exec(t);
  if (m) return { type: m[1] === 'Video' ? 'video' : 'voice', kind: 'completed', seconds: Number(m[2]) * 60 + Number(m[3]) };
  m = /^(Voice|Video) call (declined|cancelled|could not connect)$/.exec(t);
  if (m) return { type: m[1] === 'Video' ? 'video' : 'voice', kind: m[2] === 'declined' ? 'declined' : m[2] === 'cancelled' ? 'cancelled' : 'failed' };
  m = /^(Voice|Video) call · line busy$/.exec(t);
  if (m) return { type: m[1] === 'Video' ? 'video' : 'voice', kind: 'busy' };
  m = /^Missed (voice|video) call$/.exec(t);
  if (m) return { type: m[1] === 'video' ? 'video' : 'voice', kind: 'missed' };
  return null;
}

export interface CallCardView { title: string; direction: string; startedAt: Date; duration: string | null; tone: 'ok' | 'bad' | 'neutral' }

/**
 * What the call card says. The line is written when the call ENDS, so for a connected call the start time is the
 * message time minus the duration. `own` = I placed the call (the caller's browser writes the line).
 */
export function callCardView(p: ParsedCallLine, own: boolean, createdAtIso: string): CallCardView {
  const label = p.type === 'video' ? 'Video call' : 'Voice call';
  const end = new Date(createdAtIso);
  const startedAt = p.kind === 'completed' ? new Date(end.getTime() - (p.seconds ?? 0) * 1000) : end;
  const direction = own ? 'Outgoing' : 'Incoming';
  switch (p.kind) {
    case 'completed': return { title: label, direction, startedAt, duration: formatDuration(p.seconds ?? 0), tone: 'ok' };
    case 'missed': return { title: own ? `${label} · no answer` : `Missed ${label.toLowerCase()}`, direction, startedAt, duration: null, tone: own ? 'neutral' : 'bad' };
    case 'cancelled': return { title: own ? `${label} · cancelled` : `Missed ${label.toLowerCase()}`, direction, startedAt, duration: null, tone: own ? 'neutral' : 'bad' };
    case 'declined': return { title: `${label} · declined`, direction, startedAt, duration: null, tone: 'neutral' };
    case 'busy': return { title: `${label} · line busy`, direction, startedAt, duration: null, tone: 'neutral' };
    default: return { title: `${label} · could not connect`, direction, startedAt, duration: null, tone: 'neutral' };
  }
}

/** Two letters for the call screen's avatar circle. */
export function initialsOf(name: string | null | undefined): string {
  const parts = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[1][0]).toUpperCase();
}

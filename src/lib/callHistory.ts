import { formatDuration, type CallType } from '@/lib/zego';

export interface CallHistoryRow {
  id: string; direction: 'incoming' | 'outgoing'; peer_id: string; peer_name: string;
  call_type: CallType; status: string; created_at: string; duration_seconds: number | null;
}
export type CallTone = 'ok' | 'bad' | 'neutral';

/** What to show for one call, from the viewer's side. */
export function describeCall(row: Pick<CallHistoryRow, 'direction' | 'status' | 'duration_seconds'>): { label: string; tone: CallTone; missed: boolean } {
  const incoming = row.direction === 'incoming';
  switch (row.status) {
    case 'answered': case 'ended':
      return { label: row.duration_seconds ? formatDuration(row.duration_seconds) : 'Connected', tone: 'ok', missed: false };
    case 'missed':
      return incoming ? { label: 'Missed', tone: 'bad', missed: true } : { label: 'No answer', tone: 'bad', missed: false };
    case 'declined': return { label: incoming ? 'You declined' : 'Declined', tone: 'neutral', missed: false };
    case 'cancelled': return incoming ? { label: 'Missed', tone: 'bad', missed: true } : { label: 'Cancelled', tone: 'neutral', missed: false };
    case 'busy': return { label: 'Line busy', tone: 'neutral', missed: false };
    case 'failed': return { label: 'Could not connect', tone: 'bad', missed: false };
    case 'ringing': return { label: 'Not answered', tone: 'neutral', missed: incoming };
    default: return { label: row.status, tone: 'neutral', missed: false };
  }
}

export function formatCallTime(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const sameDay = d.toDateString() === now.toDateString();
  const yesterday = new Date(now.getTime() - 86_400_000).toDateString() === d.toDateString();
  if (sameDay) return time;
  if (yesterday) return `Yesterday, ${time}`;
  return `${d.toLocaleDateString([], { day: 'numeric', month: 'short' })}, ${time}`;
}

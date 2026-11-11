export type SubStage = 'expired' | 'd1' | 'd7' | 'd14' | 'd30' | 'exhausted' | 'p95' | 'p90' | 'p80' | null;
export interface SubscriptionRow {
  id: string; slug: string; name: string; kind: 'term' | 'minutes'; note: string | null;
  started_at: string; expires_at: string | null; days_left: number | null;
  total_minutes: number | null; used_minutes: number; remaining_minutes: number | null; calls_counted: number;
  counts_from: string | null; participants_counted: 1 | 2; block_when_exhausted: boolean; stage: SubStage;
}
export type Tone = 'ok' | 'warn' | 'bad';

export function stageView(stage: SubStage, kind: 'term' | 'minutes'): { label: string; tone: Tone } {
  switch (stage) {
    case 'expired': return { label: 'Expired', tone: 'bad' };
    case 'exhausted': return { label: 'Minutes used up', tone: 'bad' };
    case 'd1': return { label: 'Expires within a day', tone: 'bad' };
    case 'd7': return { label: 'Expires this week', tone: 'bad' };
    case 'd14': case 'd30': return { label: 'Expiring soon', tone: 'warn' };
    case 'p95': return { label: 'Almost used up', tone: 'bad' };
    case 'p90': case 'p80': return { label: 'Running low', tone: 'warn' };
    default: return { label: kind === 'term' ? 'Active' : 'Plenty left', tone: 'ok' };
  }
}

/** Share of the period or the minutes that has been used, 0-100. */
export function usedPercent(row: Pick<SubscriptionRow, 'kind' | 'started_at' | 'expires_at' | 'total_minutes' | 'used_minutes'>, now = Date.now()): number {
  if (row.kind === 'minutes') {
    if (!row.total_minutes) return 100;
    return Math.min(100, Math.max(0, Math.round((row.used_minutes / row.total_minutes) * 100)));
  }
  const start = new Date(row.started_at).getTime();
  const end = row.expires_at ? new Date(row.expires_at).getTime() : start;
  if (!(end > start)) return 100;
  return Math.min(100, Math.max(0, Math.round(((now - start) / (end - start)) * 100)));
}

export function daysLeftText(days: number | null): string {
  if (days === null) return '';
  if (days < 0) return `Expired ${Math.abs(days)} ${Math.abs(days) === 1 ? 'day' : 'days'} ago`;
  if (days === 0) return 'Expires today';
  if (days < 60) return `${days} ${days === 1 ? 'day' : 'days'} left`;
  const months = Math.floor(days / 30.4);
  return `${months} months left`;
}

/** Subscriptions that need attention now, worst first. */
export function alertsOf(rows: SubscriptionRow[]): SubscriptionRow[] {
  const rank = (r: SubscriptionRow) => (stageView(r.stage, r.kind).tone === 'bad' ? 0 : 1);
  return rows.filter(r => r.stage !== null).sort((a, b) => rank(a) - rank(b));
}

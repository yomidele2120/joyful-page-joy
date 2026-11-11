import { describe, expect, it } from 'vitest';
import { alertsOf, daysLeftText, stageView, usedPercent, type SubscriptionRow } from './subscriptions';

const base = { id: '1', slug: 's', name: 'S', note: null, started_at: '2026-11-03T00:00:00Z', expires_at: null, days_left: null, total_minutes: null, used_minutes: 0, remaining_minutes: null, calls_counted: 0, counts_from: null, participants_counted: 1, block_when_exhausted: true, stage: null } as const;

describe('subscriptions helpers', () => {
  it('shows how much of a year has passed', () => {
    const row = { ...base, kind: 'term' as const, expires_at: '2027-11-03T00:00:00Z' };
    expect(usedPercent(row, new Date('2026-11-11T00:00:00Z').getTime())).toBe(2);
    expect(usedPercent(row, new Date('2027-05-04T12:00:00Z').getTime())).toBe(50);
    expect(usedPercent(row, new Date('2028-01-01T00:00:00Z').getTime())).toBe(100);
  });
  it('shows how many call minutes are used', () => {
    expect(usedPercent({ ...base, kind: 'minutes', total_minutes: 10000, used_minutes: 2500 })).toBe(25);
    expect(usedPercent({ ...base, kind: 'minutes', total_minutes: 100, used_minutes: 150 })).toBe(100);
    expect(usedPercent({ ...base, kind: 'minutes', total_minutes: 0, used_minutes: 0 })).toBe(100);
  });
  it('words days left', () => {
    expect(daysLeftText(356)).toBe('11 months left');
    expect(daysLeftText(6)).toBe('6 days left');
    expect(daysLeftText(1)).toBe('1 day left');
    expect(daysLeftText(0)).toBe('Expires today');
    expect(daysLeftText(-3)).toBe('Expired 3 days ago');
  });
  it('colours the stages', () => {
    expect(stageView(null, 'term')).toEqual({ label: 'Active', tone: 'ok' });
    expect(stageView('d30', 'term').tone).toBe('warn');
    expect(stageView('d7', 'term').tone).toBe('bad');
    expect(stageView('exhausted', 'minutes').tone).toBe('bad');
  });
  it('lists only subscriptions needing attention, worst first', () => {
    const rows = [{ ...base, id: 'a', kind: 'term' as const, stage: 'd30' as const }, { ...base, id: 'b', kind: 'term' as const, stage: null }, { ...base, id: 'c', kind: 'minutes' as const, stage: 'exhausted' as const }];
    expect(alertsOf(rows as SubscriptionRow[]).map(r => r.id)).toEqual(['c', 'a']);
  });
});

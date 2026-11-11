import { describe, expect, it } from 'vitest';
import { describeCall, formatCallTime } from './callHistory';

describe('describeCall', () => {
  it('shows length for connected calls', () => {
    expect(describeCall({ direction: 'outgoing', status: 'ended', duration_seconds: 95 })).toEqual({ label: '1:35', tone: 'ok', missed: false });
    expect(describeCall({ direction: 'incoming', status: 'answered', duration_seconds: null }).label).toBe('Connected');
  });
  it('separates missed (incoming) from no answer (outgoing)', () => {
    expect(describeCall({ direction: 'incoming', status: 'missed', duration_seconds: null })).toMatchObject({ label: 'Missed', missed: true });
    expect(describeCall({ direction: 'outgoing', status: 'missed', duration_seconds: null })).toMatchObject({ label: 'No answer', missed: false });
  });
  it('treats a call the caller cancelled as missed for the receiver', () => {
    expect(describeCall({ direction: 'incoming', status: 'cancelled', duration_seconds: null }).missed).toBe(true);
    expect(describeCall({ direction: 'outgoing', status: 'cancelled', duration_seconds: null }).label).toBe('Cancelled');
  });
});
describe('formatCallTime', () => {
  it('says Yesterday for the day before', () => {
    const now = new Date('2026-11-11T12:00:00');
    expect(formatCallTime('2026-11-10T09:05:00', now)).toMatch(/^Yesterday, /);
  });
});

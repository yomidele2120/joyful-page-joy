import { describe, expect, it } from 'vitest';
import { formatClock, getStoreStatus, lagosClock } from '@/lib/storeStatus';
import type { OpeningHours } from '@/config/business';

// Example hours used only by these tests.
const weekday = { open: '09:00', close: '18:00' };
const HOURS: OpeningHours = { mon: weekday, tue: weekday, wed: weekday, thu: weekday, fri: weekday, sat: { open: '10:00', close: '16:00' }, sun: null };
// Lagos is UTC+1 all year, so 08:30Z is 09:30 in Lagos. 22 Oct 2026 is a Thursday.

describe('store status (Lagos time)', () => {
  it('reads the weekday and time in Lagos', () => {
    expect(lagosClock(new Date('2026-10-22T08:30:00Z'))).toEqual({ day: 'thu', minutes: 9 * 60 + 30 });
    expect(lagosClock(new Date('2026-10-22T23:30:00Z'))).toEqual({ day: 'fri', minutes: 30 });   // past midnight in Lagos
  });
  it('is open during opening hours', () => {
    expect(getStoreStatus(HOURS, new Date('2026-10-22T08:30:00Z'))).toEqual({ isOpen: true, label: 'Open now · closes 6:00 PM' });
  });
  it('says when it opens later today', () => {
    expect(getStoreStatus(HOURS, new Date('2026-10-22T06:00:00Z')).label).toBe('Closed · opens today at 9:00 AM');
  });
  it('says tomorrow after closing', () => {
    expect(getStoreStatus(HOURS, new Date('2026-10-22T18:00:00Z')).label).toBe('Closed · opens tomorrow at 9:00 AM');
  });
  it('skips a closed day', () => {
    expect(getStoreStatus(HOURS, new Date('2026-10-24T16:00:00Z')).label).toBe('Closed · opens Monday at 9:00 AM');
  });
  it('formats times', () => {
    expect(formatClock('09:00')).toBe('9:00 AM');
    expect(formatClock('12:30')).toBe('12:30 PM');
    expect(formatClock('00:05')).toBe('12:05 AM');
  });
});

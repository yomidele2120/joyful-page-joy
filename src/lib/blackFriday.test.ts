import { describe, expect, it } from 'vitest';
import { BLACK_FRIDAY_END, BLACK_FRIDAY_START, blackFridayPhase, splitDuration } from './blackFriday';

describe('blackFridayPhase', () => {
  it('counts down before, is live during, and ends after', () => {
    expect(blackFridayPhase(Date.UTC(2026, 10, 17))).toBe('coming');
    expect(blackFridayPhase(BLACK_FRIDAY_START - 1)).toBe('coming');
    expect(blackFridayPhase(BLACK_FRIDAY_START)).toBe('live');
    expect(blackFridayPhase(BLACK_FRIDAY_END - 1)).toBe('live');
    expect(blackFridayPhase(BLACK_FRIDAY_END)).toBe('over');
  });
  it('starts at midnight Friday 27 November in Nigeria (UTC+1)', () => {
    expect(new Date(BLACK_FRIDAY_START).toISOString()).toBe('2026-11-26T23:00:00.000Z');
    expect(new Date(BLACK_FRIDAY_END).toISOString()).toBe('2026-11-30T23:00:00.000Z');
  });
});

describe('splitDuration', () => {
  it('splits and never goes negative', () => {
    expect(splitDuration(((9 * 24 + 14) * 3600 + 5 * 60 + 7) * 1000)).toEqual({ days: 9, hours: 14, minutes: 5, seconds: 7 });
    expect(splitDuration(-5000)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  });
});

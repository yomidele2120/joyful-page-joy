import { test, expect } from 'vitest';
import { dayLabel, isNewDay } from './chatDays';

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).toISOString();
const NOW = new Date(2026, 10, 9, 15);   // 9 Nov 2026

test('labels', () => {
  expect(dayLabel(at(2026, 11, 9, 1), NOW)).toBe('Today');
  expect(dayLabel(at(2026, 11, 8, 23), NOW)).toBe('Yesterday');
  expect(dayLabel(at(2026, 11, 5), NOW)).toBe(new Date(2026, 10, 5).toLocaleDateString([], { weekday: 'long' }));
  expect(dayLabel(at(2026, 10, 20), NOW)).toBe(new Date(2026, 9, 20).toLocaleDateString([], { month: 'short', day: 'numeric' }));
  expect(dayLabel(at(2025, 12, 31), NOW)).toContain('2025');
});
test('new day detection', () => {
  expect(isNewDay(null, at(2026, 11, 9))).toBe(true);
  expect(isNewDay(at(2026, 11, 9, 1), at(2026, 11, 9, 23))).toBe(false);
  expect(isNewDay(at(2026, 11, 8, 23), at(2026, 11, 9, 0))).toBe(true);
});

import type { DayKey, OpeningHours } from '@/config/business';

// "Open now / closes 6:00 PM" for the store. Always worked out in Lagos time, whatever the visitor's phone says.

export const DAYS: { key: DayKey; label: string }[] = [
  { key: 'mon', label: 'Monday' }, { key: 'tue', label: 'Tuesday' }, { key: 'wed', label: 'Wednesday' },
  { key: 'thu', label: 'Thursday' }, { key: 'fri', label: 'Friday' }, { key: 'sat', label: 'Saturday' },
  { key: 'sun', label: 'Sunday' },
];

const KEY_BY_WEEKDAY: Record<string, DayKey> = { Mon: 'mon', Tue: 'tue', Wed: 'wed', Thu: 'thu', Fri: 'fri', Sat: 'sat', Sun: 'sun' };

/** The weekday and minutes since midnight in Lagos right now. */
export function lagosClock(now: Date): { day: DayKey; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Lagos', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '';
  return { day: KEY_BY_WEEKDAY[get('weekday')] ?? 'mon', minutes: Number(get('hour')) * 60 + Number(get('minute')) };
}

export function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + (m || 0);
}

/** "18:00" becomes "6:00 PM". */
export function formatClock(time: string): string {
  const [h, m] = time.split(':').map(Number);
  return `${h % 12 || 12}:${String(m || 0).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

export interface StoreStatus { isOpen: boolean; label: string }

export function getStoreStatus(hours: OpeningHours, now: Date = new Date()): StoreStatus {
  const { day, minutes } = lagosClock(now);
  const today = hours[day];
  if (today) {
    if (minutes >= toMinutes(today.open) && minutes < toMinutes(today.close)) {
      return { isOpen: true, label: `Open now · closes ${formatClock(today.close)}` };
    }
    if (minutes < toMinutes(today.open)) {
      return { isOpen: false, label: `Closed · opens today at ${formatClock(today.open)}` };
    }
  }
  const start = DAYS.findIndex(d => d.key === day);
  for (let i = 1; i <= 7; i++) {
    const next = DAYS[(start + i) % 7];
    const h = hours[next.key];
    if (h) return { isOpen: false, label: `Closed · opens ${i === 1 ? 'tomorrow' : next.label} at ${formatClock(h.open)}` };
  }
  return { isOpen: false, label: 'Closed' };
}

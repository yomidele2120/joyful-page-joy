// Black Friday 2026 is Friday 27 November. Times are Nigerian time (UTC+1).
// The banner appears right away, counts down to the start, switches to "live" for the sale days,
// and removes itself after the last day. Change these two dates to reuse it next year.
export const BLACK_FRIDAY_START = Date.UTC(2026, 10, 26, 23, 0, 0); // 27 Nov 2026, 00:00 in Nigeria
export const BLACK_FRIDAY_END = Date.UTC(2026, 11, 0, 23, 0, 0);    // 30 Nov 2026 ends 23:59:59 in Nigeria (Cyber Monday)

export type BlackFridayPhase = 'coming' | 'live' | 'over';

export function blackFridayPhase(now: number): BlackFridayPhase {
  if (now < BLACK_FRIDAY_START) return 'coming';
  if (now < BLACK_FRIDAY_END) return 'live';
  return 'over';
}

/** Splits a number of milliseconds into days, hours, minutes and seconds (never negative). */
export function splitDuration(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return { days: Math.floor(total / 86400), hours: Math.floor((total % 86400) / 3600), minutes: Math.floor((total % 3600) / 60), seconds: total % 60 };
}

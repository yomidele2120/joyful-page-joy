// All commission dates are shown in Nigeria time (WAT, UTC+1, no daylight saving),
// whatever timezone the browser is in, so admin and supplier always see the same moment.
export function formatLagos(iso: string | null | undefined, withTime = true): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('en-NG', {
    timeZone: 'Africa/Lagos',
    dateStyle: 'medium',
    ...(withTime ? { timeStyle: 'short' as const } : {}),
  });
}

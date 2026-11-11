// Display currencies. Every price in the database and every payment is in Naira (NGN); the other currencies are an
// estimate shown next to it, using rates the admin keeps up to date (Admin > Currency rates).

export type CurrencyCode = 'NGN' | 'USD' | 'AED';
export const CURRENCIES: { code: CurrencyCode; label: string; locale: string }[] = [
  { code: 'NGN', label: 'Naira (NGN)', locale: 'en-NG' },
  { code: 'USD', label: 'US Dollar (USD)', locale: 'en-US' },
  { code: 'AED', label: 'UAE Dirham (AED)', locale: 'en-AE' },
];

/** per_ngn = how much of that currency one Naira is worth, e.g. USD 0.00065. */
export type RateMap = Partial<Record<CurrencyCode, number>>;

export const isCurrencyCode = (v: unknown): v is CurrencyCode => v === 'NGN' || v === 'USD' || v === 'AED';

export function convertFromNgn(amountNgn: number, code: CurrencyCode, rates: RateMap): number | null {
  if (code === 'NGN') return amountNgn;
  const r = rates[code];
  return typeof r === 'number' && Number.isFinite(r) && r > 0 ? amountNgn * r : null;
}

/** Format a Naira amount in the chosen currency. Falls back to Naira if no rate is available. */
export function formatInCurrency(amountNgn: number, code: CurrencyCode, rates: RateMap): string {
  const converted = convertFromNgn(amountNgn, code, rates);
  const useCode: CurrencyCode = converted === null ? 'NGN' : code;
  const value = converted === null ? amountNgn : converted;
  const meta = CURRENCIES.find(c => c.code === useCode)!;
  const digits = useCode === 'NGN' ? 0 : Math.abs(value) < 100 ? 2 : 0;
  const text = new Intl.NumberFormat(meta.locale, { style: 'currency', currency: useCode, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
  return useCode === 'NGN' ? text : `≈ ${text}`;
}

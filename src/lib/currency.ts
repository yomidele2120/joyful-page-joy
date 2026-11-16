// Display currencies. Every price in the database and every payment is in Naira (NGN); the other currencies are an
// estimate shown next to it, using rates the admin keeps up to date (Admin > Currency rates).

export type CurrencyCode = 'NGN' | 'USD' | 'AED' | 'EUR' | 'GBP' | 'CHF' | 'CNY' | 'JPY';
// A currency appears in the shop's selector only after the admin has entered its rate (Admin > Currency rates).
// CNY and JPY both use the yen sign, so they use the US format, which writes CN¥ for the Chinese yuan.
export const CURRENCIES: { code: CurrencyCode; label: string; locale: string }[] = [
  { code: 'NGN', label: 'Naira (NGN)', locale: 'en-NG' },
  { code: 'USD', label: 'US Dollar (USD)', locale: 'en-US' },
  { code: 'AED', label: 'UAE Dirham (AED)', locale: 'en-AE' },
  { code: 'EUR', label: 'Euro (EUR)', locale: 'en-IE' },
  { code: 'GBP', label: 'British Pound (GBP)', locale: 'en-GB' },
  { code: 'CHF', label: 'Swiss Franc (CHF)', locale: 'en-CH' },
  { code: 'CNY', label: 'Chinese Yuan (CNY)', locale: 'en-US' },
  { code: 'JPY', label: 'Japanese Yen (JPY)', locale: 'en-US' },
];

/** per_ngn = how much of that currency one Naira is worth, e.g. USD 0.00065. */
export type RateMap = Partial<Record<CurrencyCode, number>>;

export const isCurrencyCode = (v: unknown): v is CurrencyCode => CURRENCIES.some(c => c.code === v);

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
  const digits = useCode === 'NGN' || useCode === 'JPY' ? 0 : Math.abs(value) < 100 ? 2 : 0; // yen has no cents
  const text = new Intl.NumberFormat(meta.locale, { style: 'currency', currency: useCode, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
  return useCode === 'NGN' ? text : `≈ ${text}`;
}

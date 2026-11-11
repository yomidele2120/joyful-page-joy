import { CURRENCIES, isCurrencyCode } from '@/lib/currency';
import { useCurrency } from '@/hooks/useCurrency';

// A small selector for the display currency. Only shown once the admin has set at least one non-Naira rate.
export default function CurrencySwitcher({ className = '' }: { className?: string }) {
  const { currency, setCurrency, rates } = useCurrency();
  const available = CURRENCIES.filter(c => c.code === 'NGN' || (rates[c.code] ?? 0) > 0);
  if (available.length < 2) return null;
  return (
    <label className={`inline-flex items-center ${className}`}>
      <span className="sr-only">Display currency</span>
      <select
        value={currency}
        onChange={e => { if (isCurrencyCode(e.target.value)) setCurrency(e.target.value); }}
        className="h-8 rounded-md border border-input bg-background px-2 text-xs font-medium"
        title="Prices are charged in Naira. Other currencies are estimates."
      >
        {available.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
      </select>
    </label>
  );
}

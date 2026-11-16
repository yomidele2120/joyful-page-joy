import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useCurrencyRates } from '@/hooks/useCurrency';
import { formatNaira } from '@/lib/format';
import { CURRENCIES } from '@/lib/currency';

// Admin: how many Naira one unit of each foreign currency costs today. Buyers can then view prices in those currencies
// (an estimate; payments are always taken in Naira). Typed as "Naira per 1 unit" because that is how people quote rates.
// A currency with no rate typed stays hidden from buyers.
const FOREIGN = CURRENCIES.filter(c => c.code !== 'NGN');
const PLACEHOLDER: Record<string, string> = { USD: '1500', AED: '410', EUR: '1650', GBP: '1950', CHF: '1700', CNY: '210', JPY: '10' };

export default function CurrencyRatesPanel() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useCurrencyRates();
  const [values, setValues] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!data) return;
    const next: Record<string, string> = {};
    for (const c of FOREIGN) {
      const r = data.rates[c.code];
      next[c.code] = r ? String(Math.round(1 / r * 100) / 100) : '';
    }
    setValues(next);
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      const rows = [] as { code: string; per_ngn: number }[];
      for (const c of FOREIGN) {
        const text = (values[c.code] ?? '').trim();
        if (!text) continue; // left empty: that currency stays as it is (hidden from buyers if it never had a rate)
        const ngnPerUnit = Number(text);
        if (!Number.isFinite(ngnPerUnit) || ngnPerUnit <= 0) throw new Error(`Enter a valid rate for ${c.code}`);
        rows.push({ code: c.code, per_ngn: 1 / ngnPerUnit });
      }
      if (!rows.length) throw new Error('Enter at least one rate');
      const { error } = await (supabase as any).from('currency_rates').upsert(rows, { onConflict: 'code' });
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Rates saved'); queryClient.invalidateQueries({ queryKey: ['currency-rates'] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading...</p>;
  const usd = Number(values.USD);
  return (
    <section className="max-w-xl space-y-4 rounded-lg bg-card p-5 card-shadow">
      <div>
        <h3 className="font-heading text-lg font-semibold">Currency rates</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Buyers can view prices in Naira or in any currency below that has a rate. Payments are always taken in Naira, so other currencies are shown as estimates.
          Leave a currency empty to keep it hidden. Update these whenever the market moves. {data?.updatedAt && <>Last saved {new Date(data.updatedAt).toLocaleString()}.</>}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {FOREIGN.map(c => (
          <label key={c.code} className="block text-sm">1 {c.label.replace(/ \(.*\)/, '')} ({c.code}) = ₦
            <Input
              className="mt-1" type="number" inputMode="decimal" min={0} step="0.01"
              value={values[c.code] ?? ''} onChange={e => setValues(v => ({ ...v, [c.code]: e.target.value }))}
              placeholder={`e.g. ${PLACEHOLDER[c.code] ?? ''}`}
            />
          </label>
        ))}
      </div>
      {usd > 0 && <p className="text-xs text-muted-foreground">Preview: {formatNaira(150_000)} shows as about ${(150_000 / usd).toFixed(2)}.</p>}
      <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? 'Saving...' : 'Save rates'}</Button>
    </section>
  );
}

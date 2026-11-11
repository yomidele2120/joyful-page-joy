import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useCurrencyRates } from '@/hooks/useCurrency';
import { formatNaira } from '@/lib/format';

// Admin: how many Naira one US Dollar / UAE Dirham costs today. Buyers can then view prices in USD or AED (an estimate;
// payments are always taken in Naira). Typed as "Naira per 1 unit" because that is how people quote rates.
export default function CurrencyRatesPanel() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useCurrencyRates();
  const [usd, setUsd] = useState('');
  const [aed, setAed] = useState('');
  useEffect(() => {
    if (!data) return;
    setUsd(data.rates.USD ? String(Math.round(1 / data.rates.USD * 100) / 100) : '');
    setAed(data.rates.AED ? String(Math.round(1 / data.rates.AED * 100) / 100) : '');
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      const rows = [] as { code: string; per_ngn: number }[];
      for (const [code, text] of [['USD', usd], ['AED', aed]] as const) {
        const ngnPerUnit = Number(text);
        if (!Number.isFinite(ngnPerUnit) || ngnPerUnit <= 0) throw new Error(`Enter a valid rate for ${code}`);
        rows.push({ code, per_ngn: 1 / ngnPerUnit });
      }
      const { error } = await (supabase as any).from('currency_rates').upsert(rows, { onConflict: 'code' });
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Rates saved'); queryClient.invalidateQueries({ queryKey: ['currency-rates'] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading...</p>;
  return (
    <section className="max-w-xl space-y-4 rounded-lg bg-card p-5 card-shadow">
      <div>
        <h3 className="font-heading text-lg font-semibold">Currency rates</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Buyers can view prices in Naira, US Dollars or UAE Dirhams. Payments are always taken in Naira, so other currencies are shown as estimates.
          Update these whenever the market moves. {data?.updatedAt && <>Last saved {new Date(data.updatedAt).toLocaleString()}.</>}
        </p>
      </div>
      <label className="block text-sm">1 US Dollar (USD) = ₦
        <Input className="mt-1" type="number" inputMode="decimal" min={0} step="0.01" value={usd} onChange={e => setUsd(e.target.value)} placeholder="e.g. 1500" />
      </label>
      <label className="block text-sm">1 UAE Dirham (AED) = ₦
        <Input className="mt-1" type="number" inputMode="decimal" min={0} step="0.01" value={aed} onChange={e => setAed(e.target.value)} placeholder="e.g. 410" />
      </label>
      {Number(usd) > 0 && <p className="text-xs text-muted-foreground">Preview: {formatNaira(150_000)} shows as about ${(150_000 / Number(usd)).toFixed(2)}.</p>}
      <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? 'Saving...' : 'Save rates'}</Button>
    </section>
  );
}

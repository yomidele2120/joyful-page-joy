import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Panel, StatCard } from '@/components/dashboard/DashboardShell';
import { supabase } from '@/integrations/supabase/client';
import { call } from '@/lib/ads/adsApi';
import { formatNaira } from '@/lib/format';
import { errText, fmtDate } from '@/components/ads/adUi';

const naira = (kobo: number) => formatNaira(kobo / 100);
const KIND: Record<string, string> = { topup: 'Funds added', spend: 'Ad spend', adjustment: 'Adjustment' };
const PLATFORM: Record<string, string> = { google: 'Google', meta: 'Meta', tiktok: 'TikTok', other: 'Other' };

/** The supplier's advertising balance: add funds through Paystack, see the balance and every deposit and spend. */
export default function AdWalletPanel() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<any>({ queryKey: ['my-ad-wallet'], queryFn: () => call('my_ad_wallet'), staleTime: 15_000 });
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);

  // Coming back from Paystack: ask the server to confirm the payment (never trust the redirect itself).
  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get('wallet_ref');
    if (!ref || !/^itha_wallet_[a-f0-9]{32}$/i.test(ref)) return;
    (async () => {
      const { data: res, error } = await supabase.functions.invoke('verify-ad-wallet-topup', { body: { reference: ref } });
      if (error || (res as any)?.error) toast.error((res as any)?.error ?? 'We could not confirm the payment yet. If you were charged, the funds are added automatically once Paystack confirms.');
      else toast.success('Payment confirmed. Funds added to your advertising balance.');
      const u = new URL(window.location.href); u.searchParams.delete('wallet_ref'); window.history.replaceState({}, '', u);
      qc.invalidateQueries({ queryKey: ['my-ad-wallet'] });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (isLoading || !data) return null;
  const min = Number(data.min_topup_kobo) / 100, max = Number(data.max_topup_kobo) / 100;
  const value = Number(amount);
  const valid = Number.isInteger(value) && value >= min && value <= max;

  const add = async () => {
    setBusy(true);
    try {
      const { data: res, error } = await supabase.functions.invoke('initialize-ad-wallet-topup', { body: { amountNaira: value } });
      if (error || (res as any)?.error) throw new Error((res as any)?.error ?? 'Could not start the payment');
      window.location.href = (res as any).authorization_url;
    } catch (e) { toast.error(errText(e)); setBusy(false); }
  };

  return (
    <Panel title="Advertising balance">
      <div className="grid grid-cols-3 gap-2">
        <StatCard icon={<Wallet />} label="Balance" value={naira(Number(data.balance_kobo))} />
        <StatCard icon={<Wallet />} tone="sky" label="Added in total" value={naira(Number(data.topped_up_kobo))} />
        <StatCard icon={<Wallet />} tone="accent" label="Spent in total" value={naira(Number(data.spent_kobo))} />
      </div>

      <p className="mt-3 text-sm text-muted-foreground">
        Add money here to pay for ads on other platforms such as Google, Meta and TikTok. When ITHUBAFRICA runs one for you, the cost is taken from this balance and listed below.
      </p>

      {data.enabled ? (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="text-sm">
            <span className="mb-1 block text-xs text-muted-foreground">Amount to add (₦{min.toLocaleString('en-NG')} to ₦{max.toLocaleString('en-NG')})</span>
            <Input inputMode="numeric" value={amount} onChange={e => setAmount(e.target.value.replace(/[^0-9]/g, ''))} placeholder="e.g. 20000" className="w-44" />
          </label>
          <Button disabled={!valid || busy} onClick={add}>{busy ? 'Opening Paystack…' : 'Add funds'}</Button>
        </div>
      ) : <p className="mt-3 text-sm font-medium">Adding funds is switched off right now.</p>}
      {!!data.pending?.length && <p className="mt-2 text-xs text-muted-foreground">{data.pending.length} payment{data.pending.length === 1 ? ' is' : 's are'} waiting for Paystack to confirm. Funds appear here once it does.</p>}

      <h3 className="mb-1 mt-5 font-heading text-sm">History</h3>
      {!data.ledger?.length ? <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">Nothing yet. Funds you add and ad spend will be listed here.</p> : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {data.ledger.map((l: any) => (
            <li key={l.id} className="flex items-start justify-between gap-3 px-3 py-2.5 text-sm">
              <span className="min-w-0">
                <span className="block font-medium">{KIND[l.kind] ?? l.kind}{l.platform ? ` · ${PLATFORM[l.platform] ?? l.platform}` : ''}</span>
                <span className="block text-xs text-muted-foreground">{fmtDate(l.created_at)}{l.note ? ` · ${l.note}` : ''}</span>
              </span>
              <span className={`shrink-0 font-semibold tabular-nums ${Number(l.amount_kobo) < 0 ? 'text-destructive' : 'text-emerald-600'}`}>
                {Number(l.amount_kobo) < 0 ? '-' : '+'}{naira(Math.abs(Number(l.amount_kobo)))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

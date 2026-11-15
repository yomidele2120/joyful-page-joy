import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Panel } from '@/components/dashboard/DashboardShell';
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

  const quick = [5000, 10000, 20000, 50000].filter(q => q >= min && q <= max);

  return (
    <Panel title="Advertising balance">
      {/* Compact balance card: the balance is the one big number, the totals sit small underneath. */}
      <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-[#0a2236] to-[#12395a] p-4 text-white shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-white/70">Available balance</p>
            <p className="truncate font-heading text-2xl font-bold tabular-nums sm:text-3xl">{naira(Number(data.balance_kobo))}</p>
          </div>
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/10"><Wallet className="h-5 w-5" aria-hidden="true" /></span>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-xl bg-white/10 px-3 py-2"><dt className="text-white/70">Added</dt><dd className="font-semibold tabular-nums">{naira(Number(data.topped_up_kobo))}</dd></div>
          <div className="rounded-xl bg-white/10 px-3 py-2"><dt className="text-white/70">Spent</dt><dd className="font-semibold tabular-nums">{naira(Number(data.spent_kobo))}</dd></div>
        </dl>
      </div>

      {data.enabled ? (
        <div className="mt-3 rounded-2xl border border-border p-3">
          <label className="block text-xs text-muted-foreground" htmlFor="wallet-amount">Add funds (₦{min.toLocaleString('en-NG')} to ₦{max.toLocaleString('en-NG')})</label>
          <div className="mt-1.5 flex gap-2">
            <Input id="wallet-amount" inputMode="numeric" value={amount} onChange={e => setAmount(e.target.value.replace(/[^0-9]/g, ''))} placeholder="e.g. 20000" className="h-11 min-w-0 flex-1 rounded-xl" />
            <Button variant="cta" className="h-11 shrink-0 rounded-xl px-4" disabled={!valid || busy} onClick={add}>{busy ? 'Opening…' : 'Add funds'}</Button>
          </div>
          {quick.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {quick.map(q => (
                <button key={q} type="button" onClick={() => setAmount(String(q))}
                  className={`rounded-full border px-3 py-1 text-xs font-medium ${value === q ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted-foreground hover:bg-secondary'}`}>
                  ₦{q.toLocaleString('en-NG')}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : <p className="mt-3 text-sm font-medium">Adding funds is switched off right now.</p>}
      {!!data.pending?.length && <p className="mt-2 text-xs text-muted-foreground">{data.pending.length} payment{data.pending.length === 1 ? ' is' : 's are'} waiting for Paystack to confirm. Funds appear here once it does.</p>}
      <p className="mt-2 text-xs text-muted-foreground">Pays for ads on Google, Meta and TikTok. Each cost is taken from this balance and listed in your history.</p>

      <h3 className="mb-1 mt-4 font-heading text-sm">History</h3>
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

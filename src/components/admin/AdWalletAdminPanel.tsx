import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Panel } from '@/components/dashboard/DashboardShell';
import { call } from '@/lib/ads/adsApi';
import { formatNaira } from '@/lib/format';
import { errText } from '@/components/ads/adUi';

const naira = (kobo: number) => formatNaira(kobo / 100);

/** Admin side of the supplier advertising balances: limits, who holds how much, and recording spend or a correction. */
export default function AdWalletAdminPanel() {
  const qc = useQueryClient();
  const { data } = useQuery<any>({ queryKey: ['admin-ad-wallets'], queryFn: () => call('admin_ad_wallets'), staleTime: 15_000 });
  const [vendor, setVendor] = useState('');
  const [amount, setAmount] = useState('');
  const [platform, setPlatform] = useState('google');
  const [note, setNote] = useState('');
  const [mode, setMode] = useState<'spend' | 'credit' | 'debit'>('spend');
  const [min, setMin] = useState<string | null>(null);
  const [max, setMax] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!data) return null;
  const s = data.settings;
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin-ad-wallets'] });

  const saveSettings = async (enabled: boolean, minN: number, maxN: number) => {
    try { await call('admin_set_ad_wallet_settings', { _enabled: enabled, _min_kobo: minN * 100, _max_kobo: maxN * 100 }); toast.success('Saved.'); refresh(); } catch (e) { toast.error(errText(e)); }
  };
  const record = async () => {
    const kobo = Math.round(Number(amount) * 100);
    setBusy(true);
    try {
      if (mode === 'spend') await call('admin_record_ad_spend', { _vendor: vendor, _amount_kobo: kobo, _platform: platform, _note: note });
      else await call('admin_adjust_ad_wallet', { _vendor: vendor, _amount_kobo: mode === 'credit' ? kobo : -kobo, _note: note });
      toast.success('Recorded.'); setAmount(''); setNote(''); refresh();
    } catch (e) { toast.error(errText(e)); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <Panel title="Advertising balance settings">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex items-center gap-2 text-sm"><Switch checked={s.enabled} onCheckedChange={v => saveSettings(v, Number(s.min_topup_kobo) / 100, Number(s.max_topup_kobo) / 100)} /> Suppliers can add funds</label>
          <label className="text-sm"><span className="block text-xs text-muted-foreground">Smallest top-up (₦)</span>
            <Input className="w-32" inputMode="numeric" value={min ?? String(Number(s.min_topup_kobo) / 100)} onChange={e => setMin(e.target.value.replace(/\D/g, ''))} /></label>
          <label className="text-sm"><span className="block text-xs text-muted-foreground">Largest top-up (₦)</span>
            <Input className="w-32" inputMode="numeric" value={max ?? String(Number(s.max_topup_kobo) / 100)} onChange={e => setMax(e.target.value.replace(/\D/g, ''))} /></label>
          <Button size="sm" variant="outline" onClick={() => saveSettings(s.enabled, Number(min ?? Number(s.min_topup_kobo) / 100), Number(max ?? Number(s.max_topup_kobo) / 100))}>Save limits</Button>
        </div>
      </Panel>

      <Panel title="Record spend or a correction">
        <div className="grid gap-2 sm:grid-cols-2">
          <select className="h-10 rounded-md border border-border bg-background px-2 text-sm" value={vendor} onChange={e => setVendor(e.target.value)} aria-label="Supplier">
            <option value="">Choose a supplier</option>
            {data.vendors.map((v: any) => <option key={v.vendor_id} value={v.vendor_id}>{v.store_name} ({naira(Number(v.balance_kobo))})</option>)}
          </select>
          <select className="h-10 rounded-md border border-border bg-background px-2 text-sm" value={mode} onChange={e => setMode(e.target.value as any)} aria-label="Type">
            <option value="spend">Ad spend (takes from balance)</option><option value="credit">Refund / credit (adds)</option><option value="debit">Correction (takes)</option>
          </select>
          <Input inputMode="decimal" placeholder="Amount in ₦" value={amount} onChange={e => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} />
          {mode === 'spend' && (
            <select className="h-10 rounded-md border border-border bg-background px-2 text-sm" value={platform} onChange={e => setPlatform(e.target.value)} aria-label="Platform">
              <option value="google">Google</option><option value="meta">Meta</option><option value="tiktok">TikTok</option><option value="other">Other</option>
            </select>
          )}
          <Input className="sm:col-span-2" placeholder={mode === 'spend' ? 'Note (campaign, dates)' : 'Reason (required)'} value={note} onChange={e => setNote(e.target.value)} />
        </div>
        <Button className="mt-3" disabled={busy || !vendor || !(Number(amount) > 0)} onClick={record}>Record</Button>
        <p className="mt-2 text-xs text-muted-foreground">A balance can never go below zero. Funds themselves are added only by a confirmed Paystack payment.</p>
      </Panel>

      <Panel title="Supplier balances" flush>
        {!data.vendors.length ? <p className="p-6 text-center text-sm text-muted-foreground">No supplier has added funds yet.</p> : (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border text-left text-xs text-muted-foreground"><th className="p-3">Supplier</th><th className="p-3 text-right">Balance</th><th className="p-3 text-right">Added</th><th className="p-3 text-right">Spent</th></tr></thead>
            <tbody>{data.vendors.map((v: any) => (
              <tr key={v.vendor_id} className="border-b border-border last:border-0">
                <td className="p-3">{v.store_name}</td><td className="p-3 text-right font-semibold tabular-nums">{naira(Number(v.balance_kobo))}</td>
                <td className="p-3 text-right tabular-nums">{naira(Number(v.topped_up_kobo))}</td><td className="p-3 text-right tabular-nums">{naira(Number(v.spent_kobo))}</td>
              </tr>))}</tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}

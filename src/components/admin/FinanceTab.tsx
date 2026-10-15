import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Banknote, CheckCircle2, Clock, Hourglass, Landmark, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { functionErrorMessage } from '@/lib/functionError';
import { formatNaira } from '@/lib/format';
import { Panel, StatCard } from '@/components/dashboard/DashboardShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// The finance tables are new, so they are not in the generated Supabase types yet.
// (Regenerate the types later and this cast can be removed.)
const db = supabase as any;

interface PayableRow {
  vendor_id: string; store_name: string; is_approved: boolean; commission_percent: number | null;
  held: number; available: number; processing: number; paid: number; adjustments: number;
  has_bank: boolean; recipient_ready: boolean;
}
interface PayoutRow {
  id: string; amount: number; status: 'processing' | 'paid' | 'failed' | 'reversed';
  paystack_transfer_code: string | null; failure_reason: string | null; created_at: string; paid_at: string | null;
  vendors?: { store_name: string } | null;
}
interface Settings {
  default_commission_percent: number; payout_hold_days: number; min_payout_amount: number;
  bnpl_enabled: boolean; bnpl_fee_percent: number; bnpl_fee_bearer: 'platform' | 'supplier' | 'customer';
  bnpl_min_order: number; bnpl_max_order: number; bnpl_max_outstanding_per_customer: number; bnpl_down_payment_percent: number;
}
interface RunResult { vendor: string; status: string; amount?: number; reason?: string }

async function callFunction(name: string, body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) throw new Error(await functionErrorMessage(error, data));
  if (data?.error) throw new Error(String(data.error));
  return data;
}

const statusBadge = (s: PayoutRow['status']) => {
  const map = {
    paid: { label: 'Paid', variant: 'default' as const },
    processing: { label: 'Processing', variant: 'secondary' as const },
    failed: { label: 'Failed', variant: 'destructive' as const },
    reversed: { label: 'Reversed', variant: 'destructive' as const },
  };
  const m = map[s];
  return <Badge variant={m.variant}>{m.label}</Badge>;
};

const TH = 'p-3 text-left text-xs font-medium text-muted-foreground whitespace-nowrap';
const TD = 'p-3 text-sm whitespace-nowrap';

export default function FinanceTab() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<RunResult[] | null>(null);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['finance-payables'] });
    qc.invalidateQueries({ queryKey: ['finance-payouts'] });
  };

  // ---- data --------------------------------------------------------------------------
  const { data: payables, isLoading: payablesLoading, error: payablesError } = useQuery({
    queryKey: ['finance-payables'],
    queryFn: async () => {
      const { data, error } = await db.rpc('finance_payables_summary');
      if (error) throw error;
      return ((data ?? []) as PayableRow[]).map(r => ({
        ...r, held: +r.held, available: +r.available, processing: +r.processing, paid: +r.paid, adjustments: +r.adjustments,
      }));
    },
  });

  const { data: payouts, isLoading: payoutsLoading } = useQuery({
    queryKey: ['finance-payouts'],
    queryFn: async () => {
      const { data, error } = await db.from('payouts').select('*, vendors(store_name)').order('created_at', { ascending: false }).limit(100);
      if (error) throw error;
      return (data ?? []).map((p: any) => ({ ...p, amount: +p.amount })) as PayoutRow[];
    },
  });

  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ['finance-settings'],
    queryFn: async () => {
      const { data, error } = await db.from('finance_settings').select('*').eq('id', true).single();
      if (error) throw error;
      return data as Settings;
    },
  });

  const [form, setForm] = useState<Settings | null>(null);
  useEffect(() => { if (settings) setForm(settings); }, [settings]);

  const totals = (payables ?? []).reduce(
    (t, r) => ({ held: t.held + r.held, available: t.available + r.available, processing: t.processing + r.processing, paid: t.paid + r.paid }),
    { held: 0, available: 0, processing: 0, paid: 0 },
  );

  // ---- actions -----------------------------------------------------------------------
  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try { await fn(); } catch (e) { toast.error(e instanceof Error ? e.message : 'Something went wrong'); }
    finally { setBusy(null); refresh(); }
  };

  const releaseMatured = () => run('release', async () => {
    const { data, error } = await db.rpc('release_matured_payables');
    if (error) throw error;
    toast.success(data > 0 ? `${data} order line(s) are now available to pay` : 'Nothing new to release yet');
  });

  const payNow = (vendorId?: string) => run(vendorId ?? 'all', async () => {
    const out = await callFunction('run-payouts', { action: 'run', vendor_id: vendorId });
    const results: RunResult[] = out.results ?? [];
    setLastRun(results);
    if (!results.length) { toast.info(out.message ?? 'Nothing to pay'); return; }
    const ok = results.filter(r => r.status === 'paid' || r.status === 'processing').length;
    toast[ok ? 'success' : 'warning'](`${ok} payout(s) sent, ${results.length - ok} skipped or failed`);
  });

  const verifyBank = (vendorId: string, confirmName = false) => run(`bank-${vendorId}`, async () => {
    try {
      const out = await callFunction('create-recipient', { vendor_id: vendorId, confirm_name: confirmName });
      toast.success(`Bank verified: ${out.account_name} (${out.bank})`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (!confirmName && msg.includes('Account name mismatch')) {
        if (window.confirm(`${msg}\n\nUse this account anyway?`)) { await callFunction('create-recipient', { vendor_id: vendorId, confirm_name: true }); toast.success('Bank verified'); }
        return;
      }
      throw e;
    }
  });

  const checkPayout = (id: string) => run(`check-${id}`, async () => {
    const out = await callFunction('run-payouts', { action: 'verify', payout_id: id });
    toast.info(`Paystack says: ${out.paystack_status}`);
  });

  const saveCommission = async (vendorId: string, raw: string) => {
    const value = raw.trim() === '' ? null : Number(raw);
    if (value !== null && (!Number.isFinite(value) || value < 0 || value > 100)) { toast.error('Commission must be between 0 and 100'); return; }
    const { error } = await db.from('vendors').update({ commission_percent: value }).eq('id', vendorId);
    if (error) toast.error(error.message); else { toast.success('Commission saved. It applies to new orders.'); refresh(); }
  };

  const saveSettings = () => run('settings', async () => {
    if (!form) return;
    if (form.bnpl_min_order > form.bnpl_max_order) throw new Error('BNPL minimum order cannot be above the maximum');
    const { error } = await db.from('finance_settings').update(form).eq('id', true);
    if (error) throw error;
    qc.invalidateQueries({ queryKey: ['finance-settings'] });
    toast.success('Finance settings saved');
  });

  const num = (k: keyof Settings) => (
    <Input type="number" min={0} step="any" value={form ? String(form[k]) : ''}
      onChange={e => setForm(f => f ? { ...f, [k]: e.target.value === '' ? 0 : Number(e.target.value) } : f)} />
  );

  // ---- UI ----------------------------------------------------------------------------
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={<Hourglass />} label="Held (not yet released)" value={formatNaira(totals.held)} loading={payablesLoading} />
        <StatCard icon={<Banknote />} label="Owed now (available)" value={formatNaira(totals.available)} loading={payablesLoading} />
        <StatCard icon={<Clock />} label="Payouts in progress" value={formatNaira(totals.processing)} loading={payablesLoading} />
        <StatCard icon={<CheckCircle2 />} label="Paid to suppliers" value={formatNaira(totals.paid)} loading={payablesLoading} />
      </div>

      <Tabs defaultValue="payables">
        <TabsList>
          <TabsTrigger value="payables">Payables</TabsTrigger>
          <TabsTrigger value="payouts">Payouts</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        {/* ---------------- Payables ---------------- */}
        <TabsContent value="payables" className="space-y-4">
          <Panel
            title="What each supplier is owed"
            action={
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={busy === 'release'} onClick={releaseMatured}>
                  <RefreshCw className="mr-1 h-3.5 w-3.5" /> Release matured funds
                </Button>
                <Button size="sm" disabled={busy === 'all' || totals.available <= 0} onClick={() => payNow()}>
                  <Landmark className="mr-1 h-3.5 w-3.5" /> Pay all available
                </Button>
              </div>
            }
            flush
          >
            {payablesError ? (
              <p className="p-4 text-sm text-destructive">{String((payablesError as any).message)}</p>
            ) : payablesLoading ? (
              <div className="space-y-2 p-4">{[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b border-border">
                    <tr>
                      <th className={TH}>Supplier</th><th className={TH}>Commission %</th><th className={TH}>Held</th>
                      <th className={TH}>Available</th><th className={TH}>In progress</th><th className={TH}>Paid</th>
                      <th className={TH}>Adjustments</th><th className={TH}>Bank</th><th className={TH}></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {(payables ?? []).map(r => (
                      <tr key={r.vendor_id}>
                        <td className={TD}>
                          <div className="font-medium">{r.store_name}</div>
                          {!r.is_approved && <span className="text-xs text-destructive">Not approved</span>}
                        </td>
                        <td className={TD}>
                          <Input className="h-8 w-20" type="number" min={0} max={100} step="any" placeholder={settings ? String(settings.default_commission_percent) : ''}
                            defaultValue={r.commission_percent ?? ''} onBlur={e => saveCommission(r.vendor_id, e.target.value)} />
                        </td>
                        <td className={TD}>{formatNaira(r.held)}</td>
                        <td className={`${TD} font-semibold`}>{formatNaira(r.available)}</td>
                        <td className={TD}>{formatNaira(r.processing)}</td>
                        <td className={TD}>{formatNaira(r.paid)}</td>
                        <td className={TD}>{r.adjustments ? formatNaira(r.adjustments) : '-'}</td>
                        <td className={TD}>
                          {r.recipient_ready ? <Badge>Verified</Badge>
                            : r.has_bank ? <Badge variant="secondary">Needs verification</Badge>
                            : <Badge variant="outline">No bank details</Badge>}
                        </td>
                        <td className={`${TD} text-right`}>
                          <div className="flex justify-end gap-2">
                            {!r.recipient_ready && r.has_bank && r.is_approved && (
                              <Button size="sm" variant="outline" disabled={busy === `bank-${r.vendor_id}`} onClick={() => verifyBank(r.vendor_id)}>Verify bank</Button>
                            )}
                            <Button size="sm" disabled={!r.recipient_ready || r.available + r.adjustments <= 0 || busy === r.vendor_id} onClick={() => payNow(r.vendor_id)}>Pay now</Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!payables?.length && <tr><td className="p-6 text-center text-sm text-muted-foreground" colSpan={9}>No suppliers yet.</td></tr>}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          {lastRun && (
            <Panel title="Last payout run">
              <ul className="space-y-1 text-sm">
                {lastRun.map((r, i) => (
                  <li key={i}>
                    <span className="font-medium">{r.vendor}</span>: {r.status}
                    {r.amount ? ` (${formatNaira(r.amount)})` : ''}{r.reason ? `. ${r.reason}` : ''}
                  </li>
                ))}
              </ul>
            </Panel>
          )}
          <p className="text-xs text-muted-foreground">
            Money is "held" until the order is delivered, the payment has reached you, and the hold period has passed.
            Orders placed before the finance system was installed are not included.
          </p>
        </TabsContent>

        {/* ---------------- Payouts ---------------- */}
        <TabsContent value="payouts">
          <Panel title="Payout history" flush>
            {payoutsLoading ? (
              <div className="space-y-2 p-4">{[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b border-border">
                    <tr><th className={TH}>Date</th><th className={TH}>Supplier</th><th className={TH}>Amount</th><th className={TH}>Status</th><th className={TH}>Note</th><th className={TH}></th></tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {(payouts ?? []).map(p => (
                      <tr key={p.id}>
                        <td className={TD}>{new Date(p.created_at).toLocaleString('en-NG')}</td>
                        <td className={TD}>{p.vendors?.store_name ?? '-'}</td>
                        <td className={`${TD} font-semibold`}>{formatNaira(p.amount)}</td>
                        <td className={TD}>{statusBadge(p.status)}</td>
                        <td className={`${TD} max-w-[280px] truncate text-muted-foreground`} title={p.failure_reason ?? ''}>{p.failure_reason ?? p.paystack_transfer_code ?? ''}</td>
                        <td className={`${TD} text-right`}>
                          {p.status === 'processing' && (
                            <Button size="sm" variant="outline" disabled={busy === `check-${p.id}`} onClick={() => checkPayout(p.id)}>Check status</Button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {!payouts?.length && <tr><td className="p-6 text-center text-sm text-muted-foreground" colSpan={6}>No payouts yet.</td></tr>}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </TabsContent>

        {/* ---------------- Settings ---------------- */}
        <TabsContent value="settings" className="space-y-4">
          {settingsLoading || !form ? <Skeleton className="h-64 w-full" /> : (
            <>
              <Panel title="Commission and payouts">
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-1.5"><Label>Default commission (%)</Label>{num('default_commission_percent')}
                    <p className="text-xs text-muted-foreground">Taken from each supplier sale. Override per supplier in Payables.</p></div>
                  <div className="space-y-1.5"><Label>Hold after delivery (days)</Label>{num('payout_hold_days')}
                    <p className="text-xs text-muted-foreground">Protects you against returns before suppliers are paid.</p></div>
                  <div className="space-y-1.5"><Label>Minimum payout (₦)</Label>{num('min_payout_amount')}
                    <p className="text-xs text-muted-foreground">Smaller balances roll over to the next payout.</p></div>
                </div>
              </Panel>

              <Panel title="Buy now, pay later">
                <p className="mb-4 rounded-md bg-muted p-3 text-xs text-muted-foreground">
                  These are saved now and take effect once the BNPL provider is connected at checkout. The provider decides each customer's own approval and credit limit; the limits below can only be stricter.
                </p>
                <div className="mb-4 flex items-center gap-3">
                  <Switch checked={form.bnpl_enabled} onCheckedChange={v => setForm(f => f ? { ...f, bnpl_enabled: v } : f)} />
                  <Label>Offer "Pay later" at checkout</Label>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-1.5"><Label>Merchant fee (%)</Label>{num('bnpl_fee_percent')}</div>
                  <div className="space-y-1.5"><Label>Who pays the fee</Label>
                    <Select value={form.bnpl_fee_bearer} onValueChange={v => setForm(f => f ? { ...f, bnpl_fee_bearer: v as Settings['bnpl_fee_bearer'] } : f)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="platform">Platform (you)</SelectItem>
                        <SelectItem value="supplier">Suppliers</SelectItem>
                        <SelectItem value="customer">Customer</SelectItem>
                      </SelectContent>
                    </Select></div>
                  <div className="space-y-1.5"><Label>Down payment (%)</Label>{num('bnpl_down_payment_percent')}</div>
                  <div className="space-y-1.5"><Label>Minimum order (₦)</Label>{num('bnpl_min_order')}</div>
                  <div className="space-y-1.5"><Label>Maximum order (₦)</Label>{num('bnpl_max_order')}</div>
                  <div className="space-y-1.5"><Label>Max outstanding per customer (₦)</Label>{num('bnpl_max_outstanding_per_customer')}</div>
                </div>
              </Panel>

              <div className="flex justify-end">
                <Button disabled={busy === 'settings'} onClick={saveSettings}>Save settings</Button>
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

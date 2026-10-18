import { Fragment, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ShieldCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { functionErrorMessage } from '@/lib/functionError';
import { formatNaira } from '@/lib/format';
import { formatLagos } from '@/lib/dates';
import { Panel } from '@/components/dashboard/DashboardShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

const db = supabase as any;

function Money({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{formatNaira(Number(value) || 0)}</p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export default function SupplierCommissionTab() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [openVendor, setOpenVendor] = useState<string | null>(null);
  const [days, setDays] = useState(30);
  const [pct, setPct] = useState('');
  const [months, setMonths] = useState('');
  const [tv, setTv] = useState({ version: '', title: '', body: '' });
  const [checks, setChecks] = useState<any | null>(null);

  const refresh = () => ['commission-settings', 'commission-overview', 'commission-audit', 'commission-terms', 'commission-earnings']
    .forEach(k => qc.invalidateQueries({ queryKey: [k] }));

  const { data: isSuper } = useQuery({
    queryKey: ['am-i-super-admin'],
    queryFn: async () => { const { data } = await db.rpc('am_i_super_admin'); return !!data; },
  });

  const { data: settings } = useQuery({
    queryKey: ['commission-settings'],
    queryFn: async () => {
      const { data, error } = await db.from('finance_settings').select('default_commission_percent, free_period_months').eq('id', true).single();
      if (error) throw error;
      return data as { default_commission_percent: number; free_period_months: number };
    },
  });
  useEffect(() => {
    if (settings) { setPct(String(settings.default_commission_percent)); setMonths(String(settings.free_period_months)); }
  }, [settings]);

  const { data: overview } = useQuery({
    queryKey: ['commission-overview'],
    queryFn: async () => { const { data, error } = await db.rpc('admin_supplier_commission_overview'); if (error) throw error; return (data ?? []) as any[]; },
  });

  const { data: earnings } = useQuery({
    queryKey: ['commission-earnings', days],
    queryFn: async () => {
      const to = new Date(Date.now() + 60_000).toISOString();
      const from = new Date(Date.now() - days * 86_400_000).toISOString();
      const { data, error } = await db.rpc('admin_platform_earnings', { _from: from, _to: to });
      if (error) throw error;
      return data as any;
    },
  });

  const { data: txns } = useQuery({
    queryKey: ['commission-txns', openVendor],
    enabled: !!openVendor,
    queryFn: async () => {
      const { data, error } = await db.rpc('admin_vendor_transactions', { _vendor_id: openVendor, _limit: 100 });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: audit } = useQuery({
    queryKey: ['commission-audit'],
    queryFn: async () => {
      const { data } = await db.from('commission_audit_log').select('*').order('at', { ascending: false }).limit(60);
      return (data ?? []) as any[];
    },
  });

  const { data: currentTerms } = useQuery({
    queryKey: ['commission-terms'],
    queryFn: async () => {
      const { data } = await db.from('supplier_terms_versions').select('*').order('published_at', { ascending: false });
      return (data ?? []) as any[];
    },
  });

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try { await fn(); } catch (e) { toast.error(e instanceof Error ? e.message : 'Something went wrong'); }
    finally { setBusy(null); }
  };

  const saveSettings = () => run('settings', async () => {
    const { error } = await db.rpc('set_commission_settings', { _default_percent: Number(pct), _free_months: Number(months) });
    if (error) throw new Error(error.message);
    toast.success('Commission settings saved and recorded in the audit log');
    refresh();
  });

  const publishTerms = () => run('terms', async () => {
    const { error } = await db.rpc('publish_supplier_terms', { _version: tv.version, _title: tv.title, _body: tv.body });
    if (error) throw new Error(error.message);
    toast.success('New terms published. Suppliers will be asked to accept them.');
    setTv({ version: '', title: '', body: '' });
    refresh();
  });

  const checkPaystack = () => run('paystack', async () => {
    const { data, error } = await supabase.functions.invoke('paystack-readiness');
    if (error || data?.error) throw new Error(await functionErrorMessage(error, data));
    setChecks(data);
  });

  const rows = overview ?? [];

  return (
    <div className="space-y-6">
      <Panel title="Commission policy">
        <p className="mb-3 text-sm text-muted-foreground">
          Every newly approved supplier sells commission-free for the free period (counted in calendar months from the moment of approval,
          Nigeria time). After that the rate below applies to the product subtotal of every successful sale. VAT and shipping are never charged commission.
        </p>
        <div className="grid gap-4 sm:grid-cols-3 sm:items-end">
          <div className="space-y-1.5"><Label>Commission after the free period (%)</Label>
            <Input type="number" min={0} max={100} step="0.01" value={pct} onChange={e => setPct(e.target.value)} disabled={!isSuper} /></div>
          <div className="space-y-1.5"><Label>Free period (calendar months)</Label>
            <Input type="number" min={0} max={24} step={1} value={months} onChange={e => setMonths(e.target.value)} disabled={!isSuper} /></div>
          <Button onClick={saveSettings} disabled={!isSuper || busy === 'settings'}>
            <ShieldCheck className="mr-1.5 h-4 w-4" />Save settings
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {isSuper
            ? 'A change affects suppliers approved from now on (free-period length) and sales paid from now on (rate). Give suppliers the notice your terms require.'
            : 'Only a super admin can change these settings.'}
        </p>
      </Panel>

      <Panel title="Where the money went">
        <div className="mb-3 flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Period:</span>
          {[7, 30, 90].map(d => (
            <Button key={d} size="sm" variant={days === d ? 'default' : 'outline'} onClick={() => setDays(d)}>Last {d} days</Button>
          ))}
        </div>
        {earnings && (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Money label={`Collected from buyers (${earnings.orders} orders)`} value={earnings.gross_collected} />
            <Money label="Product subtotal" value={earnings.product_subtotal} hint="What commission is calculated on" />
            <Money label="VAT collected" value={earnings.vat_collected} hint="Not platform income" />
            <Money label="Shipping collected" value={earnings.shipping_collected} hint="Not platform income" />
            <Money label="Commission earned" value={earnings.commission_earned} />
            <Money label="Commission reversed (refunds)" value={earnings.commission_reversed} />
            <Money label="Paystack fees" value={earnings.paystack_fees} hint="Paid by the platform" />
            <Money label="Net platform earnings" value={earnings.net_platform_earnings} hint="Commission earned minus Paystack fees" />
          </div>
        )}
      </Panel>

      <Panel title={`Suppliers (${rows.length})`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="p-2">Supplier</th><th className="p-2">Activated</th><th className="p-2">Free until</th>
                <th className="p-2">Rate now</th><th className="p-2">Agreement</th><th className="p-2 text-right">Sales</th>
                <th className="p-2 text-right">Commission</th><th className="p-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <Fragment key={r.vendor_id}>
                  <tr className="border-t border-border align-top">
                    <td className="p-2"><p className="font-medium">{r.store_name}</p>
                      <p className="text-xs text-muted-foreground">{r.is_approved ? 'Approved' : 'Pending approval'}</p></td>
                    <td className="p-2 whitespace-nowrap">{r.activated_at ? formatLagos(r.activated_at) : (r.is_approved ? 'Before this feature' : '-')}</td>
                    <td className="p-2 whitespace-nowrap">{r.commission_free_until ? formatLagos(r.commission_free_until) : '-'}</td>
                    <td className="p-2 whitespace-nowrap">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${r.in_free_period ? 'bg-emerald-100 text-emerald-800' : 'bg-secondary'}`}>
                        {Number(r.current_rate)}%{r.in_free_period ? ' (free period)' : ''}
                      </span>
                      {r.override_percent !== null && <p className="text-[11px] text-muted-foreground">custom rate {r.override_percent}% after free period</p>}
                    </td>
                    <td className="p-2 whitespace-nowrap">
                      {r.terms_accepted_at
                        ? <><span className="text-emerald-700">Accepted</span><p className="text-[11px] text-muted-foreground">v{r.terms_version}, {formatLagos(r.terms_accepted_at, false)}</p></>
                        : <span className="text-destructive">Not accepted</span>}
                    </td>
                    <td className="p-2 text-right">{formatNaira(Number(r.sales))}</td>
                    <td className="p-2 text-right">{formatNaira(Number(r.commission))}</td>
                    <td className="p-2 text-right">
                      <Button size="sm" variant="outline" onClick={() => setOpenVendor(openVendor === r.vendor_id ? null : r.vendor_id)}>
                        {openVendor === r.vendor_id ? 'Hide' : 'Transactions'}
                      </Button>
                    </td>
                  </tr>
                  {openVendor === r.vendor_id && (
                    <tr className="bg-muted/30">
                      <td colSpan={8} className="p-3">
                        {!txns ? <p className="text-sm text-muted-foreground">Loading...</p> : !txns.length ? (
                          <p className="text-sm text-muted-foreground">No paid transactions yet.</p>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead className="text-muted-foreground"><tr>
                                <th className="p-1.5 text-left">Date</th><th className="p-1.5 text-left">Order</th><th className="p-1.5 text-left">Status</th>
                                <th className="p-1.5 text-right">Product subtotal</th><th className="p-1.5 text-right">VAT</th>
                                <th className="p-1.5 text-right">Rate</th><th className="p-1.5 text-right">Commission</th><th className="p-1.5 text-right">Supplier receives</th>
                              </tr></thead>
                              <tbody>
                                {txns.map(t => (
                                  <tr key={t.order_id} className="border-t border-border">
                                    <td className="p-1.5 whitespace-nowrap">{formatLagos(t.created_at, false)}</td>
                                    <td className="p-1.5 font-mono">#{String(t.order_id).slice(0, 8)}</td>
                                    <td className="p-1.5">{t.refunded ? 'refunded' : t.order_status} / {t.payout_status}</td>
                                    <td className="p-1.5 text-right">{formatNaira(Number(t.product_subtotal))}</td>
                                    <td className="p-1.5 text-right">{formatNaira(Number(t.vat_on_subtotal))}</td>
                                    <td className="p-1.5 text-right">{Number(t.commission_percent)}%</td>
                                    <td className="p-1.5 text-right">{formatNaira(Number(t.commission_amount))}</td>
                                    <td className="p-1.5 text-right">{formatNaira(Number(t.supplier_net))}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Supplier terms">
        <div className="space-y-2 text-sm">
          {(currentTerms ?? []).map(t => (
            <details key={t.version} className="rounded-lg border border-border p-3">
              <summary className="cursor-pointer font-medium">
                Version {t.version}: {t.title} {t.is_current && <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">current</span>}
                <span className="ml-2 text-xs text-muted-foreground">{formatLagos(t.published_at, false)}</span>
              </summary>
              <div className="mt-2 max-h-72 overflow-y-auto whitespace-pre-wrap text-xs text-muted-foreground">{String(t.body).trim()}</div>
            </details>
          ))}
        </div>
        {isSuper && (
          <div className="mt-4 space-y-3 rounded-lg border border-dashed border-border p-3">
            <p className="text-sm font-medium">Publish a new version</p>
            <p className="text-xs text-muted-foreground">
              Use {'{{FREE_PERIOD_MONTHS}}'} and {'{{COMMISSION_PERCENT}}'} where the numbers belong. Every supplier is asked to accept the new version, and each acceptance is stored. Have a lawyer review the wording.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input placeholder="Version, e.g. 1.1" value={tv.version} onChange={e => setTv(v => ({ ...v, version: e.target.value }))} />
              <Input placeholder="Title" value={tv.title} onChange={e => setTv(v => ({ ...v, title: e.target.value }))} />
            </div>
            <Textarea rows={8} placeholder="Full terms text" value={tv.body} onChange={e => setTv(v => ({ ...v, body: e.target.value }))} />
            <Button size="sm" onClick={publishTerms} disabled={busy === 'terms' || !tv.version || !tv.title || tv.body.length < 50}>Publish</Button>
          </div>
        )}
      </Panel>

      <Panel title="Paystack setup check">
        <p className="mb-3 text-sm text-muted-foreground">
          Checks your real Paystack account against how this marketplace moves money: buyers pay your main balance in full, the ledger records each
          supplier's share, and suppliers are paid later by transfer.
        </p>
        <Button size="sm" variant="outline" onClick={checkPaystack} disabled={busy === 'paystack'}>Run the check</Button>
        {checks && (
          <ul className="mt-3 space-y-2 text-sm">
            {checks.checks.map((c: any) => (
              <li key={c.name} className="rounded-lg border border-border p-2.5">
                <p className="font-medium"><span className={c.ok ? 'text-emerald-700' : 'text-destructive'}>{c.ok ? 'OK' : 'Needs attention'}</span> | {c.name}</p>
                <p className="text-xs text-muted-foreground">{c.detail}</p>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Audit log (latest 60 changes)">
        {!audit?.length ? <p className="text-sm text-muted-foreground">Nothing recorded yet.</p> : (
          <div className="max-h-96 space-y-1.5 overflow-y-auto text-xs">
            {audit.map(a => (
              <div key={a.id} className="rounded-md border border-border p-2">
                <p><span className="font-medium">{a.entity}</span> | {a.action} | {formatLagos(a.at)}
                  <span className="text-muted-foreground"> | {a.actor_id ? `by ${String(a.actor_id).slice(0, 8)}` : 'system'}</span></p>
                <p className="break-all text-muted-foreground">
                  {a.old_value ? `from ${JSON.stringify(a.old_value)} ` : ''}{a.new_value ? `to ${JSON.stringify(a.new_value)}` : ''}
                </p>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

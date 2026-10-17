import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { functionErrorMessage } from '@/lib/functionError';
import { formatNaira } from '@/lib/format';
import { Panel } from '@/components/dashboard/DashboardShell';
import { Button } from '@/components/ui/button';

const db = supabase as any;

export default function OrderOpsTab() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['ops-disputes'] });
    qc.invalidateQueries({ queryKey: ['ops-refunds'] });
    qc.invalidateQueries({ queryKey: ['admin-orders'] });
  };

  const { data: disputes } = useQuery({
    queryKey: ['ops-disputes'],
    queryFn: async () => {
      const { data, error } = await db.from('order_shipments')
        .select('*, orders(email, phone, total), vendors(store_name)')
        .eq('status', 'disputed').order('disputed_at', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: refunds } = useQuery({
    queryKey: ['ops-refunds'],
    queryFn: async () => {
      const { data, error } = await db.from('refunds')
        .select('*, orders(email, phone, payment_method)')
        .order('created_at', { ascending: false }).limit(60);
      if (error) throw error;
      return data ?? [];
    },
  });

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try { await fn(); } catch (e) { toast.error(e instanceof Error ? e.message : 'Something went wrong'); }
    finally { setBusy(null); refresh(); }
  };

  const resolve = (d: any, resolution: 'release' | 'refund') => run(d.id, async () => {
    const note = window.prompt(
      resolution === 'release'
        ? 'Release the money to the supplier. Add a short note (optional):'
        : 'Refund the buyer. Add a short note (optional):',
      '',
    );
    if (note === null) return;
    const { error } = await db.rpc('admin_resolve_dispute', {
      _order_id: d.order_id, _vendor_id: d.vendor_id, _resolution: resolution, _note: note || null,
    });
    if (error) throw new Error(error.message);
    toast.success(resolution === 'release' ? 'Released to the supplier' : 'Refund queued below. Press "Send refund" to pay the buyer.');
  });

  const sendRefund = (r: any) => run(r.id, async () => {
    const { data, error } = await supabase.functions.invoke('refund-order', { body: { refund_id: r.id } });
    if (error || data?.error) throw new Error(await functionErrorMessage(error, data));
    toast.success(data?.status === 'processed' ? 'Refund completed' : 'Refund sent to Paystack. It will show as completed shortly.');
  });

  const mark = (r: any, status: 'processed' | 'failed') => run(r.id, async () => {
    const note = status === 'failed' ? (window.prompt('Why did it fail?', '') ?? '') : null;
    const { error } = await db.rpc('admin_set_refund_status', { _refund_id: r.id, _status: status, _note: note });
    if (error) throw new Error(error.message);
  });

  const expireNow = () => run('expire', async () => {
    const { data, error } = await db.rpc('expire_unpaid_orders');
    if (error) throw new Error(error.message);
    toast.success(data > 0 ? `${data} unpaid order(s) cancelled and their stock returned` : 'No expired unpaid orders');
  });

  const openRefunds = (refunds ?? []).filter((r: any) => r.status !== 'processed');
  const doneRefunds = (refunds ?? []).filter((r: any) => r.status === 'processed').slice(0, 15);

  return (
    <div className="space-y-6">
      <Panel title={`Disputes (${disputes?.length ?? 0})`}>
        {!disputes?.length ? (
          <p className="text-sm text-muted-foreground">No open disputes.</p>
        ) : (
          <div className="space-y-3">
            {disputes.map((d: any) => (
              <div key={d.id} className="rounded-lg border border-border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">Order #{d.order_id.slice(0, 8)} with {d.vendors?.store_name}</p>
                  <p className="text-xs text-muted-foreground">{d.disputed_at ? new Date(d.disputed_at).toLocaleString() : ''}</p>
                </div>
                <p className="mt-1 text-muted-foreground">Buyer: {d.orders?.email} {d.orders?.phone}</p>
                <p className="mt-1">Courier: {d.courier ?? '-'} | Waybill: {d.waybill ?? '-'}</p>
                <p className="mt-2 rounded-md bg-muted p-2">"{d.dispute_reason}"</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" disabled={busy === d.id} onClick={() => resolve(d, 'release')}>Release to supplier</Button>
                  <Button size="sm" variant="destructive" disabled={busy === d.id} onClick={() => resolve(d, 'refund')}>Refund buyer</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel title={`Refunds to handle (${openRefunds.length})`}>
        {!openRefunds.length ? (
          <p className="text-sm text-muted-foreground">Nothing waiting.</p>
        ) : (
          <div className="space-y-3">
            {openRefunds.map((r: any) => {
              const bnpl = r.orders?.payment_method === 'bnpl';
              return (
                <div key={r.id} className="rounded-lg border border-border p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">{formatNaira(Number(r.amount))} for order #{r.order_id.slice(0, 8)}</p>
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">{r.status.replace('_', ' ')}</span>
                  </div>
                  <p className="mt-1 text-muted-foreground">{r.reason} | {r.orders?.email} {r.orders?.phone}</p>
                  {r.failure_reason && (
                    <p className="mt-1 flex items-center gap-1 text-destructive"><AlertTriangle className="h-3.5 w-3.5" />{r.failure_reason}</p>
                  )}
                  {bnpl && (
                    <p className="mt-1 text-xs text-muted-foreground">Paid with Klump pay later: refund it in the Klump dashboard, then press "Mark refunded".</p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {!bnpl && (r.status === 'to_process' || r.status === 'failed') && (
                      <Button size="sm" disabled={busy === r.id} onClick={() => sendRefund(r)}>Send refund</Button>
                    )}
                    <Button size="sm" variant="outline" disabled={busy === r.id} onClick={() => mark(r, 'processed')}>Mark refunded</Button>
                    {r.status === 'processing' && (
                      <Button size="sm" variant="ghost" disabled={busy === r.id} onClick={() => mark(r, 'failed')}>Mark failed</Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <Panel title="Housekeeping">
        <p className="mb-3 text-sm text-muted-foreground">
          Orders not paid within 30 minutes are cancelled and their stock goes back on the shelf. This runs by itself
          if you enabled the scheduler (supabase/seed/ops_scheduler.sql). You can also run it by hand.
        </p>
        <Button variant="outline" size="sm" disabled={busy === 'expire'} onClick={expireNow}>
          <RefreshCw className="mr-1.5 h-4 w-4" />Expire unpaid orders now
        </Button>
      </Panel>

      {doneRefunds.length > 0 && (
        <Panel title="Recent completed refunds">
          <div className="space-y-1 text-sm">
            {doneRefunds.map((r: any) => (
              <p key={r.id} className="flex justify-between gap-3 text-muted-foreground">
                <span>#{r.order_id.slice(0, 8)} | {r.reason}</span><span>{formatNaira(Number(r.amount))}</span>
              </p>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}

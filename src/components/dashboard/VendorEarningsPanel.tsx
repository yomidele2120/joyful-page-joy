import { useQuery } from '@tanstack/react-query';
import { Wallet } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { formatNaira } from '@/lib/format';
import { Panel, StatCard } from '@/components/dashboard/DashboardShell';

export interface VendorBalance { available: number; held: number; processing: number; paid: number }

// Real figures from the supplier's own payable lines (the database only lets a supplier read their own).
export function useVendorBalance(vendorId?: string) {
  return useQuery({
    queryKey: ['vendor-balance', vendorId],
    enabled: !!vendorId,
    staleTime: 60_000,
    queryFn: async (): Promise<VendorBalance> => {
      const { data, error } = await (supabase as any).from('order_item_payables').select('vendor_net, payout_status').eq('vendor_id', vendorId).limit(5000);
      if (error) throw error;
      const sum = (s: string) => (data ?? []).filter((r: any) => r.payout_status === s).reduce((n: number, r: any) => n + Number(r.vendor_net || 0), 0);
      return { available: sum('available'), held: sum('held'), processing: sum('processing'), paid: sum('paid') };
    },
  });
}

export default function VendorEarningsPanel({ vendorId }: { vendorId: string }) {
  const { data: b, isLoading } = useVendorBalance(vendorId);
  const { data: payouts } = useQuery({
    queryKey: ['vendor-payouts', vendorId],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('payouts').select('id, amount, status, created_at, paid_at').eq('vendor_id', vendorId).order('created_at', { ascending: false }).limit(20);
      if (error) throw error;
      return (data ?? []) as { id: string; amount: number; status: string; created_at: string; paid_at: string | null }[];
    },
  });
  return (
    <div className="max-w-3xl space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <StatCard icon={<Wallet />} label="Ready to pay out" value={formatNaira(b?.available ?? 0)} loading={isLoading} />
        <StatCard icon={<Wallet />} tone="sky" label="Held until delivery" value={formatNaira(b?.held ?? 0)} loading={isLoading} hint="Released when the order completes" />
        <StatCard icon={<Wallet />} tone="accent" label="On the way to your bank" value={formatNaira(b?.processing ?? 0)} loading={isLoading} />
        <StatCard icon={<Wallet />} label="Paid out so far" value={formatNaira(b?.paid ?? 0)} loading={isLoading} />
      </div>
      <Panel title="Recent payouts" flush>
        {!payouts?.length ? <p className="p-6 text-center text-sm text-muted-foreground">No payouts yet.</p> : (
          <ul className="divide-y divide-border">
            {payouts.map(p => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <span>{new Date(p.paid_at ?? p.created_at).toLocaleDateString('en-NG', { dateStyle: 'medium' })}</span>
                <span className="text-xs capitalize text-muted-foreground">{p.status}</span>
                <span className="font-semibold tabular-nums">{formatNaira(Number(p.amount))}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

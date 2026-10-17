import { useState } from 'react';
import { toast } from 'sonner';
import { Truck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { formatNaira } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// New tables and functions are not in the generated Supabase types yet.
const db = supabase as any;

export interface VendorOrder {
  order_id: string; created_at: string; order_status: string;
  ship_status: 'pending' | 'shipped' | 'delivered' | 'disputed' | 'refunded' | null;
  courier: string | null; waybill: string | null; shipped_at: string | null; delivered_at: string | null;
  dispute_reason: string | null; gross: number; net: number;
  ship_to: { address: string | null; city: string | null; state: string | null; phone: string | null; email: string | null } | null;
  items: { name: string | null; quantity: number; price: number; unit: string | null }[];
}

const LABEL: Record<string, string> = {
  pending: 'Ready to ship', shipped: 'Shipped', delivered: 'Delivered', disputed: 'Problem reported', refunded: 'Refunded',
};

function OrderCard({ o, onChanged }: { o: VendorOrder; onChanged: () => void }) {
  const [courier, setCourier] = useState('');
  const [waybill, setWaybill] = useState('');
  const [busy, setBusy] = useState(false);

  const ship = async () => {
    setBusy(true);
    const { error } = await db.rpc('vendor_mark_shipped', { _order_id: o.order_id, _courier: courier, _waybill: waybill });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Marked as shipped. The buyer has been asked to confirm receipt.');
    onChanged();
  };

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <p className="text-sm font-medium">Order #{o.order_id.slice(0, 8)}</p>
          <p className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleDateString()}</p>
        </div>
        <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium">
          {o.ship_status ? LABEL[o.ship_status] : o.order_status}
        </span>
      </div>

      <div className="divide-y divide-border">
        {o.items.map((it, i) => (
          <div key={i} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
            <span className="min-w-0 flex-1 truncate">{it.name ?? 'Product'}</span>
            <span className="text-muted-foreground">{it.quantity} {it.unit ?? ''} x {formatNaira(Number(it.price))}</span>
          </div>
        ))}
      </div>

      <div className="grid gap-1 border-t border-border px-4 py-3 text-sm sm:grid-cols-2">
        <p>Your sales: <span className="font-medium">{formatNaira(Number(o.gross))}</span></p>
        <p>You receive after commission: <span className="font-medium">{formatNaira(Number(o.net))}</span></p>
      </div>

      <div className="border-t border-border px-4 py-3 text-sm">
        {o.ship_to ? (
          <div className="mb-3">
            <p className="font-medium">Deliver to</p>
            <p className="text-muted-foreground">
              {[o.ship_to.address, o.ship_to.city, o.ship_to.state].filter(Boolean).join(', ') || 'No address given'}
            </p>
            <p className="text-muted-foreground">{[o.ship_to.phone, o.ship_to.email].filter(Boolean).join(' | ')}</p>
          </div>
        ) : (
          <p className="mb-3 text-muted-foreground">The delivery address appears here once the buyer has paid.</p>
        )}

        {o.ship_status === 'pending' && (
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div className="space-y-1"><Label>Courier</Label>
              <Input value={courier} onChange={e => setCourier(e.target.value)} placeholder="e.g. GIG Logistics" maxLength={80} /></div>
            <div className="space-y-1"><Label>Waybill or tracking no.</Label>
              <Input value={waybill} onChange={e => setWaybill(e.target.value)} placeholder="e.g. 7003419928" maxLength={80} /></div>
            <Button onClick={ship} disabled={busy || !courier.trim() || !waybill.trim()}>
              <Truck className="mr-1.5 h-4 w-4" />{busy ? 'Saving...' : 'Mark as shipped'}
            </Button>
          </div>
        )}
        {o.ship_status === 'shipped' && (
          <p className="text-muted-foreground">
            Shipped via {o.courier}, waybill {o.waybill}. Your money is released after the buyer confirms receipt,
            or automatically a few days after shipping if they do not respond.
          </p>
        )}
        {o.ship_status === 'delivered' && (
          <p className="text-muted-foreground">Delivered. Your earnings are released after the short protection period.</p>
        )}
        {o.ship_status === 'disputed' && (
          <p className="text-destructive">The buyer reported a problem: "{o.dispute_reason}". Our team is reviewing it and will contact you.</p>
        )}
        {o.ship_status === 'refunded' && <p className="text-muted-foreground">This order was refunded to the buyer.</p>}
      </div>
    </div>
  );
}

export default function VendorOrdersTab({ orders, onChanged }: { orders: VendorOrder[]; onChanged: () => void }) {
  if (!orders.length) {
    return <p className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">No orders yet.</p>;
  }
  return <div className="space-y-4">{orders.map(o => <OrderCard key={o.order_id} o={o} onChanged={onChanged} />)}</div>;
}

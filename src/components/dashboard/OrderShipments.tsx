import { useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

const db = supabase as any;

export interface Shipment {
  id: string; order_id: string; vendor_id: string; status: 'pending' | 'shipped' | 'delivered' | 'disputed' | 'refunded';
  courier: string | null; waybill: string | null; delivered_at: string | null; dispute_reason: string | null;
  vendors?: { store_name: string } | null;
}

function Row({ s, onChanged }: { s: Shipment; onChanged: () => void }) {
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    if (!window.confirm('Only confirm if you have received the goods and checked them. The supplier is paid after you confirm.')) return;
    setBusy(true);
    const { error } = await db.rpc('buyer_confirm_receipt', { _order_id: s.order_id, _vendor_id: s.vendor_id });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Thank you. Delivery confirmed.');
    onChanged();
  };

  const report = async () => {
    setBusy(true);
    const { error } = await db.rpc('buyer_open_dispute', { _order_id: s.order_id, _vendor_id: s.vendor_id, _reason: reason });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Problem reported. The supplier will not be paid until we have looked into it.');
    setReporting(false);
    onChanged();
  };

  const recentlyDelivered = s.status === 'delivered' && s.delivered_at
    && Date.now() - new Date(s.delivered_at).getTime() < 14 * 24 * 3600 * 1000;

  return (
    <div className="border-t border-border px-4 py-3 text-sm">
      <p className="font-medium">{s.vendors?.store_name ?? 'Supplier'}</p>
      {s.status === 'pending' && <p className="text-muted-foreground">Waiting for the supplier to ship your items.</p>}
      {s.status === 'shipped' && (
        <>
          <p className="text-muted-foreground">Shipped via {s.courier}, waybill {s.waybill}.</p>
          {!reporting && (
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" onClick={confirm} disabled={busy}>I received it</Button>
              <Button size="sm" variant="outline" onClick={() => setReporting(true)}>Report a problem</Button>
            </div>
          )}
        </>
      )}
      {s.status === 'delivered' && (
        <>
          <p className="text-muted-foreground">Delivered.</p>
          {recentlyDelivered && !reporting && (
            <Button size="sm" variant="ghost" className="mt-1 h-7 px-2 text-xs" onClick={() => setReporting(true)}>Report a problem</Button>
          )}
        </>
      )}
      {s.status === 'disputed' && (
        <p className="text-muted-foreground">Problem reported: "{s.dispute_reason}". Our team is reviewing it.</p>
      )}
      {s.status === 'refunded' && <p className="text-muted-foreground">Refunded.</p>}

      {reporting && (
        <div className="mt-2 space-y-2">
          <Textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} maxLength={1000}
            placeholder="What went wrong? (wrong item, damaged, not delivered...)" />
          <div className="flex gap-2">
            <Button size="sm" variant="destructive" onClick={report} disabled={busy || reason.trim().length < 10}>Send report</Button>
            <Button size="sm" variant="ghost" onClick={() => setReporting(false)}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function OrderShipments({ shipments, onChanged }: { shipments: Shipment[]; onChanged: () => void }) {
  if (!shipments.length) return null;
  return <>{shipments.map(s => <Row key={s.id} s={s} onChanged={onChanged} />)}</>;
}

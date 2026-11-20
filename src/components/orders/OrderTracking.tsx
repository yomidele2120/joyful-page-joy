import { Check, Copy, ExternalLink, Truck } from 'lucide-react';
import { toast } from 'sonner';
import { trackingUrl } from '@/lib/couriers';

export interface TrackedShipment {
  id: string; vendor_id: string; status: string; courier: string | null; waybill: string | null;
  shipped_at: string | null; delivered_at: string | null; created_at: string;
  vendors: { store_name: string } | null;
}

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');

function stepsFor(s: TrackedShipment, orderDate: string) {
  const delivered = s.status === 'delivered';
  const shipped = delivered || s.status === 'shipped' || s.status === 'disputed';
  return [
    { label: 'Order placed', done: true, date: when(orderDate) },
    { label: 'Being prepared', done: true, date: when(s.created_at) },
    { label: 'Shipped', done: shipped, date: when(s.shipped_at) },
    { label: 'Delivered', done: delivered, date: when(s.delivered_at) },
  ];
}

const copy = async (text: string) => { try { await navigator.clipboard.writeText(text); toast.success('Waybill copied'); } catch { toast.error('Copy failed. Select the number and copy it.'); } };

/** Where each supplier's parcel is: a four-step timeline, the courier and waybill, and a link to the courier when we have one. */
export default function OrderTracking({ shipments, orderDate }: { shipments: TrackedShipment[]; orderDate: string }) {
  if (!shipments.length) return null;
  return (
    <div className="space-y-3 border-t border-border p-3" aria-label="Order tracking">
      <p className="flex items-center gap-1.5 text-sm font-medium"><Truck className="h-4 w-4" aria-hidden="true" /> Track your order</p>
      {shipments.map(s => {
        const steps = stepsFor(s, orderDate);
        const url = trackingUrl(s.courier, s.waybill);
        const current = steps.findIndex(x => !x.done);   // -1 when everything is done
        return (
          <div key={s.id} className="rounded-lg bg-secondary/50 p-3">
            {(shipments.length > 1 || s.vendors?.store_name) && <p className="mb-2 text-xs font-medium text-muted-foreground">From {s.vendors?.store_name ?? 'the supplier'}</p>}
            <ol className="grid grid-cols-4 gap-1">
              {steps.map((st, i) => (
                <li key={st.label} className="min-w-0 text-center">
                  <span className={`mx-auto grid h-6 w-6 place-items-center rounded-full text-xs ${st.done ? 'bg-primary text-primary-foreground' : i === current ? 'border-2 border-primary text-primary' : 'border border-border text-muted-foreground'}`}>
                    {st.done ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : i + 1}
                  </span>
                  <p className={`mt-1 text-[11px] leading-tight ${st.done || i === current ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>{st.label}</p>
                  {st.done && st.date && <p className="text-[10px] text-muted-foreground">{st.date}</p>}
                </li>
              ))}
            </ol>
            {s.status === 'disputed' && <p className="mt-2 text-xs font-medium text-amber-600">A problem was reported for this delivery. The team is looking into it.</p>}
            {s.status === 'refunded' && <p className="mt-2 text-xs font-medium text-muted-foreground">This delivery was refunded.</p>}
            {s.courier && s.waybill && (
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
                <span className="text-muted-foreground">{s.courier}</span>
                <span className="font-mono text-xs">{s.waybill}</span>
                <button type="button" onClick={() => copy(s.waybill!)} className="inline-flex items-center gap-1 text-xs font-medium text-primary"><Copy className="h-3 w-3" aria-hidden="true" /> Copy</button>
                {url && <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">Track with {s.courier} <ExternalLink className="h-3 w-3" aria-hidden="true" /></a>}
              </div>
            )}
            {!s.courier && s.status === 'pending' && <p className="mt-2 text-xs text-muted-foreground">The supplier is preparing your items. The courier and tracking number appear here once it ships.</p>}
          </div>
        );
      })}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useCalls } from '@/contexts/CallContext';
import { beginQueueOffer, completeQueueOffer, leaveCallQueue, useMyCallQueue } from '@/hooks/useCallQueue';
import { positionText, secondsLeft } from '@/lib/calls/callQueue';

/** Small floating card showing the buyer's place in a supplier's call waiting list, and the "your turn" offer. */
export default function CallQueueTracker() {
  const { entries, refresh } = useMyCallQueue();
  const { startCall } = useCalls();
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const active = entries.length > 0;
  useEffect(() => { if (!active) return; const t = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(t); }, [active]);
  // A lapsed offer is re-checked as soon as it reaches zero.
  const offered = entries.find((e) => e.status === 'offered');
  const left = offered ? secondsLeft(offered.offer_expires_at, now) : 0;
  useEffect(() => { if (offered && left === 0) void refresh(); }, [offered, left, refresh]);
  if (!active) return null;

  const take = async (id: string) => {
    setBusy(true);
    try {
      const d = await beginQueueOffer(id);
      await startCall(d.callee_id, d.store_name ?? 'Supplier', d.call_type);   // the normal call path: every quota and permission check still applies
      await completeQueueOffer(id);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not start the call.'); }
    finally { setBusy(false); void refresh(); }
  };

  return (
    <div className="fixed bottom-4 left-4 z-50 w-[calc(100%-2rem)] max-w-xs space-y-2" role="status" aria-live="polite">
      {entries.map((e) => (
        <div key={e.id} className="rounded-xl border border-border bg-background p-3 shadow-xl">
          <p className="truncate text-sm font-semibold">{e.store_name ?? 'Supplier'}</p>
          {e.status === 'offered' && secondsLeft(e.offer_expires_at, now) > 0 ? (
            <>
              <p className="text-xs text-muted-foreground">It's your turn. Take the call within {secondsLeft(e.offer_expires_at, now)}s or the next person goes ahead.</p>
              <div className="mt-2 flex gap-2"><Button size="sm" disabled={busy} onClick={() => take(e.id)}>{e.call_type === 'video' ? 'Start video call' : 'Start call'}</Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={async () => { await leaveCallQueue(e.id); void refresh(); }}>Skip</Button></div>
            </>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">Supplier is on another call. {positionText(e.position)}.</p>
              <Button size="sm" variant="ghost" className="mt-1 px-0" onClick={async () => { await leaveCallQueue(e.id); void refresh(); toast.success('You left the waiting list.'); }}>Leave waiting list</Button>
            </>
          )}
        </div>))}
    </div>
  );
}

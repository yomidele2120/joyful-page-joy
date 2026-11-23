// Delivery log for the server-side TikTok Events API (table tiktok_event_log). Read-only, admins only.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Panel, StatusDot } from '@/components/dashboard/DashboardShell';
import { supabase } from '@/integrations/supabase/client';
import { Stat } from '@/components/ads/adUi';

const db = supabase as any;
const TONE: Record<string, 'good' | 'warn' | 'bad' | 'idle'> = { sent: 'good', pending: 'warn', failed: 'bad', skipped: 'idle' };

export default function TikTokEventsLog({ platform = 'tiktok' }: { platform?: 'tiktok' | 'meta' }) {
  const meta = platform === 'meta';
  const table = meta ? 'meta_event_log' : 'tiktok_event_log';
  const fn = meta ? 'meta-events-send' : 'tiktok-events-send';
  const name = meta ? 'Meta' : 'TikTok';
  const qc = useQueryClient(); const [busy, setBusy] = useState(false);
  const { data: rows = [] } = useQuery<any[]>({
    queryKey: [table],
    queryFn: async () => { const { data, error } = await db.from(table).select('id, order_id, event_name, status, attempts, http_status, detail, created_at, sent_at').order('created_at', { ascending: false }).limit(100); if (error) throw error; return data; },
    refetchInterval: 30_000,
  });
  const n = (s: string) => rows.filter(r => r.status === s).length;
  const sendNow = async () => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke(fn, { body: {} });
    setBusy(false);
    if (error || data?.error || data?.ok === false) return toast.error(data?.error ?? error?.message ?? 'Could not send. Check the access token secret.');
    toast.success(`Sent ${data.sent}, failed ${data.failed}, skipped ${data.skipped}`);
    qc.invalidateQueries({ queryKey: [table] });
  };
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4"><Stat label="Sent" value={String(n('sent'))} /><Stat label="Waiting" value={String(n('pending'))} /><Stat label="Failed" value={String(n('failed'))} /><Stat label="Skipped" value={String(n('skipped'))} /></div>
      <Panel title={`Server-side events sent to ${name} (latest 100)`} action={<Button size="sm" onClick={sendNow} disabled={busy}>{busy ? 'Sending...' : 'Send waiting events now'}</Button>} flush>
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs text-muted-foreground"><tr><th className="px-3 py-2">Time</th><th className="px-3 py-2">Event</th><th className="px-3 py-2">Order</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Tries</th><th className="px-3 py-2">Detail</th></tr></thead>
          <tbody>{rows.map(r => (
            <tr key={r.id} className="border-t border-border"><td className="px-3 py-2 whitespace-nowrap text-xs">{new Date(r.created_at).toLocaleString()}</td><td className="px-3 py-2">{r.event_name}</td>
              <td className="px-3 py-2 font-mono text-xs">{String(r.order_id ?? '').slice(0, 8)}</td><td className="px-3 py-2"><StatusDot tone={TONE[r.status] ?? 'idle'}>{r.status}</StatusDot></td>
              <td className="px-3 py-2">{r.attempts}</td><td className="px-3 py-2 text-xs text-muted-foreground">{r.detail ?? ''}</td></tr>))}
            {!rows.length && <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">No events yet. They appear after the first confirmed payment.</td></tr>}</tbody>
        </table></div>
      </Panel>
      <p className="text-xs text-muted-foreground">Skipped means the buyer did not allow marketing cookies, or the order was not in a paid state. Failed events are retried automatically up to 5 times.</p>
    </div>
  );
}

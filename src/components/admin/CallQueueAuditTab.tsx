import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Panel } from '@/components/dashboard/DashboardShell';
import { supabase } from '@/integrations/supabase/client';

const db = supabase as any;
const call = async (fn: string, args?: Record<string, unknown>) => { const { data, error } = await db.rpc(fn, args); if (error) throw new Error(error.message); return data; };
const msg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');
const Stat = ({ label, value }: { label: string; value: string }) => <div className="rounded-lg border border-border bg-card px-3 py-2.5"><p className="text-xs text-muted-foreground">{label}</p><p className="text-lg font-semibold tabular-nums">{value}</p></div>;

/** Admin: every failed call with its date, time, caller and callee. */
function CallFailuresPanel() {
  const q = useQuery<any[]>({ queryKey: ['admin-call-failures'], queryFn: () => call('admin_call_failures', { _limit: 100 }), refetchInterval: 30_000 });
  const when = (t: string) => new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'medium' });
  return (
    <Panel title="Failed calls" action={<Button size="sm" variant="ghost" onClick={() => q.refetch()}>Refresh</Button>}>
      {q.error ? <p className="text-sm text-destructive">{msg(q.error)}</p> : !q.data ? <p className="text-sm text-muted-foreground">Loading...</p>
        : !q.data.length ? <p className="text-sm text-muted-foreground">No failed calls recorded.</p> : (
        <div className="overflow-x-auto"><table className="w-full text-left text-xs">
          <thead className="text-muted-foreground"><tr><th className="py-1 pr-3">Date and time</th><th className="pr-3">Caller</th><th className="pr-3">Callee</th><th className="pr-3">Reported by</th><th className="pr-3">Where</th><th>Error</th></tr></thead>
          <tbody>{q.data.map((f) => (
            <tr key={f.id} className="border-t border-border align-top">
              <td className="whitespace-nowrap py-1.5 pr-3">{when(f.failed_at)}</td>
              <td className="pr-3">{f.caller_name || 'Unknown'}<br /><span className="break-all font-mono text-[10px] text-muted-foreground">{f.caller_id ?? '-'}</span></td>
              <td className="pr-3">{f.callee_name || 'Unknown'}<br /><span className="break-all font-mono text-[10px] text-muted-foreground">{f.callee_id ?? '-'}</span></td>
              <td className="pr-3 capitalize">{f.side}</td>
              <td className="pr-3">{f.stage}</td>
              <td className="break-words text-muted-foreground" title={f.device ?? ''}>{f.error || '-'}</td>
            </tr>))}</tbody>
        </table></div>)}
    </Panel>
  );
}

/** Admin: call waiting-list monitoring and settings. */
export function CallQueueTab() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin-call-queue'] });
  const o = useQuery<any>({ queryKey: ['admin-call-queue', 'overview'], queryFn: () => call('admin_call_queue_overview'), refetchInterval: 30_000 });
  const s = useQuery<any>({ queryKey: ['admin-call-queue', 'settings'], queryFn: async () => { const { data, error } = await db.from('call_queue_settings').select('*').eq('id', true).maybeSingle(); if (error) throw error; return data; } });
  const c = useQuery<any[]>({ queryKey: ['admin-call-queue', 'capacity'], queryFn: async () => { const { data, error } = await db.from('call_queue_capacity').select('*').order('plan_slug'); if (error) throw error; return data ?? []; } });
  const save = async (table: string, match: [string, unknown], patch: Record<string, unknown>) => {
    const { error } = await db.from(table).update({ ...patch, updated_at: new Date().toISOString() }).eq(match[0], match[1]);
    if (error) toast.error(error.message); else { toast.success('Saved.'); refresh(); }
  };
  const d = o.data;
  return (
    <div className="space-y-4">
      <CallFailuresPanel />
      <Panel title="Waiting list right now">
        {o.error ? <p className="text-sm text-destructive">{msg(o.error)}</p> : !d ? <p className="text-sm text-muted-foreground">Loading...</p> : (<>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4"><Stat label="Waiting" value={String(d.waiting_now)} /><Stat label="Offered a turn" value={String(d.offered_now)} />
            <Stat label="Completed today" value={String(d.today?.completed ?? 0)} /><Stat label="Missed or expired today" value={String((d.today?.missed ?? 0) + (d.today?.expired ?? 0))} /></div>
          {!!d.busiest?.length && <><h3 className="mt-4 text-sm font-medium">Busiest suppliers</h3><ul className="text-sm">{d.busiest.map((b: any) => <li key={b.store_name}>{b.store_name}: {b.waiting} waiting</li>)}</ul></>}
        </>)}
      </Panel>
      <Panel title="Settings">
        {s.data && <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex items-center justify-between gap-3 text-sm">Waiting list on<Switch checked={!!s.data.queue_enabled} onCheckedChange={(v: boolean) => save('call_queue_settings', ['id', true], { queue_enabled: v })} /></label>
          {([['offer_seconds', 'Seconds to answer when it is a buyer\'s turn (10-300)'], ['entry_ttl_minutes', 'Minutes before a waiting place expires'], ['max_queues_per_buyer', 'Waiting lists one buyer can join at once']] as const).map(([k, label]) => <Num key={k} label={label} value={s.data[k]} onSave={(v) => save('call_queue_settings', ['id', true], { [k]: v })} />)}
        </div>}
        <h3 className="mb-2 mt-4 text-sm font-medium">Waiting places per supplier plan</h3>
        <div className="grid gap-3 sm:grid-cols-3">{c.data?.map((r) => <Num key={r.plan_slug} label={r.plan_slug} value={r.max_waiting} onSave={(v) => save('call_queue_capacity', ['plan_slug', r.plan_slug], { max_waiting: v })} />)}</div>
        <p className="mt-3 text-xs text-muted-foreground">Call allowances (minutes per call, per day, per month) are set in "Voice and video calls".</p>
      </Panel>
    </div>
  );
}
function Num({ label, value, onSave }: { label: string; value: number; onSave: (v: number) => void }) {
  const [v, setV] = useState(String(value ?? ''));
  return <label className="flex items-center justify-between gap-3 text-sm capitalize">{label}<span className="flex gap-1"><Input className="h-8 w-20" type="number" value={v} onChange={(e: any) => setV(e.target.value)} />
    <Button size="sm" variant="ghost" disabled={v === '' || Number(v) === Number(value)} onClick={() => onSave(Number(v))}>Save</Button></span></label>;
}

/** Admin: who changed what (read-only). */
export function AuditLogTab() {
  const [entity, setEntity] = useState('');
  const [before, setBefore] = useState<number | null>(null);
  const q = useQuery<any[]>({ queryKey: ['admin-audit', entity, before], queryFn: () => call('admin_list_audit_logs', { _entity: entity || null, _limit: 50, _before: before }) });
  return (
    <Panel title="Audit log" action={<select className="h-8 rounded-md border border-input bg-background px-2 text-xs" value={entity} onChange={(e: any) => { setBefore(null); setEntity(e.target.value); }} aria-label="Filter">
      <option value="">Everything</option>{['advertising_settings', 'advertising_plan_features', 'vendor_advertising_campaigns', 'vendor_advertising_banners', 'external_ad_campaigns', 'vendor_social_profiles', 'call_queue_settings', 'call_queue_capacity', 'call_plan_quotas', 'buyer_call_quotas', 'supplier_membership_plans'].map((t) => <option key={t}>{t}</option>)}</select>} flush>
      {q.error && <p className="p-3 text-sm text-destructive">{msg(q.error)}</p>}
      <div className="overflow-x-auto"><table className="w-full text-xs"><thead className="text-left text-muted-foreground"><tr><th className="p-2">When</th><th>Admin</th><th>Action</th><th>Record</th><th>Details</th></tr></thead>
        <tbody>{q.data?.map((r) => <tr key={r.id} className="border-t border-border align-top"><td className="whitespace-nowrap p-2">{new Date(r.at).toLocaleString()}</td><td>{r.actor_email ?? r.actor_id}</td><td>{r.action}</td><td>{r.entity_type}<br /><span className="text-muted-foreground">{String(r.entity_id ?? '').slice(0, 8)}</span></td>
          <td className="max-w-md break-words">{r.details?.changes ? Object.entries(r.details.changes).map(([k, v]: any) => <div key={k}><b>{k}</b>: {v.from} → {v.to}</div>) : <span className="text-muted-foreground">{String(r.details?.row ?? '').slice(0, 160)}</span>}</td></tr>)}</tbody></table></div>
      {q.data && !q.data.length && <p className="p-3 text-sm text-muted-foreground">No entries yet. Only changes made by admins are recorded.</p>}
      {!!q.data?.length && <div className="flex gap-2 p-3">{before && <Button size="sm" variant="outline" onClick={() => setBefore(null)}>Newest</Button>}
        {q.data.length === 50 && <Button size="sm" variant="outline" onClick={() => setBefore(q.data![q.data!.length - 1].id)}>Older</Button>}</div>}
    </Panel>
  );
}

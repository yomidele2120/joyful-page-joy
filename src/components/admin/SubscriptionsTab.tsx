import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CalendarClock, CheckCircle2, Phone, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { useSubscriptionOverview } from '@/hooks/useSubscriptions';
import { daysLeftText, stageView, usedPercent, type SubscriptionRow, type Tone } from '@/lib/subscriptions';

const db = supabase as any;
const toneClass: Record<Tone, string> = {
  ok: 'bg-green-500/10 text-green-700 dark:text-green-400',
  warn: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  bad: 'bg-destructive/10 text-destructive',
};
const barClass: Record<Tone, string> = { ok: 'bg-green-500', warn: 'bg-amber-500', bad: 'bg-destructive' };
const longDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '-');
const dateInput = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 10) : '');

export default function SubscriptionsTab() {
  const { data, isLoading, isError } = useSubscriptionOverview();
  const [adding, setAdding] = useState(false);
  if (isLoading) return <p className="text-sm text-muted-foreground">Loading...</p>;
  if (isError) return <p className="rounded-lg bg-card p-5 text-sm text-destructive card-shadow">Could not load subscriptions. Run the latest database update (20261111090000_platform_subscriptions.sql), then reload.</p>;
  return (
    <div className="max-w-3xl space-y-4">
      <p className="text-sm text-muted-foreground">The paid services that keep the website running. You get a notification before a subscription expires, and when the call minutes run low.</p>
      {data?.map(row => row.kind === 'minutes' ? <MinutesCard key={row.id} row={row} /> : <TermCard key={row.id} row={row} />)}
      {adding ? <AddTerm onDone={() => setAdding(false)} /> : (
        <Button variant="outline" size="sm" onClick={() => setAdding(true)}><Plus className="mr-1.5 h-4 w-4" /> Add another subscription</Button>
      )}
    </div>
  );
}

function Header({ row }: { row: SubscriptionRow }) {
  const v = stageView(row.stage, row.kind);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="font-heading text-lg font-semibold">{row.name}</h3>
      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${toneClass[v.tone]}`}>
        {v.tone === 'ok' ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />} {v.label}
      </span>
    </div>
  );
}

function Bar({ percent, tone }: { percent: number; tone: Tone }) {
  return (
    <div className="h-2.5 overflow-hidden rounded-full bg-secondary" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
      <div className={`h-full rounded-full ${barClass[tone]}`} style={{ width: `${Math.max(percent, 1)}%` }} />
    </div>
  );
}

function useSave() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, changes }: { id: string; changes: Record<string, unknown> }) => {
      const { error } = await db.from('platform_subscriptions').update(changes).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Saved'); queryClient.invalidateQueries({ queryKey: ['subscription-overview'] }); },
    onError: (e: Error) => toast.error(e.message),
  });
}

function TermCard({ row }: { row: SubscriptionRow }) {
  const save = useSave();
  const [date, setDate] = useState(dateInput(row.expires_at));
  const v = stageView(row.stage, 'term');
  return (
    <section className="space-y-3 rounded-lg bg-card p-5 card-shadow">
      <Header row={row} />
      <Bar percent={usedPercent(row)} tone={v.tone} />
      <div className="grid gap-2 text-sm sm:grid-cols-3">
        <div><p className="text-xs text-muted-foreground">Started</p><p className="font-medium">{longDate(row.started_at)}</p></div>
        <div><p className="text-xs text-muted-foreground">Expires</p><p className="font-medium">{longDate(row.expires_at)}</p></div>
        <div><p className="text-xs text-muted-foreground">Time left</p><p className={`font-medium ${v.tone === 'bad' ? 'text-destructive' : ''}`}>{daysLeftText(row.days_left)}</p></div>
      </div>
      <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
        <label className="text-xs text-muted-foreground">New expiry date (after you renew)
          <Input type="date" className="mt-1 h-9 w-44" value={date} onChange={e => setDate(e.target.value)} />
        </label>
        <Button size="sm" disabled={!date || save.isPending || date === dateInput(row.expires_at)} onClick={() => save.mutate({ id: row.id, changes: { expires_at: new Date(`${date}T00:00:00Z`).toISOString() } })}>
          <CalendarClock className="mr-1.5 h-4 w-4" /> Save renewal
        </Button>
      </div>
    </section>
  );
}

function MinutesCard({ row }: { row: SubscriptionRow }) {
  const save = useSave();
  const [topUp, setTopUp] = useState('');
  const v = stageView(row.stage, 'minutes');
  const total = row.total_minutes ?? 0;
  return (
    <section className="space-y-3 rounded-lg bg-card p-5 card-shadow">
      <Header row={row} />
      <Bar percent={usedPercent(row)} tone={v.tone} />
      <div className="grid gap-2 text-sm sm:grid-cols-4">
        <div><p className="text-xs text-muted-foreground">Bought</p><p className="font-medium tabular-nums">{total.toLocaleString()} min</p></div>
        <div><p className="text-xs text-muted-foreground">Used</p><p className="font-medium tabular-nums">{row.used_minutes.toLocaleString()} min</p></div>
        <div><p className="text-xs text-muted-foreground">Left</p><p className={`font-medium tabular-nums ${v.tone === 'bad' ? 'text-destructive' : ''}`}>{(row.remaining_minutes ?? 0).toLocaleString()} min</p></div>
        <div><p className="text-xs text-muted-foreground">Calls counted</p><p className="font-medium tabular-nums">{row.calls_counted.toLocaleString()}</p></div>
      </div>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Phone className="h-3.5 w-3.5" /> Counting every connected call since {longDate(row.counts_from)}. Each call is rounded up to a whole minute.</p>

      <div className="space-y-3 border-t border-border pt-3">
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-muted-foreground">Add minutes (after you buy more)
            <Input type="number" min={1} inputMode="numeric" className="mt-1 h-9 w-40" value={topUp} onChange={e => setTopUp(e.target.value)} placeholder="e.g. 5000" />
          </label>
          <Button size="sm" disabled={!(Number(topUp) > 0) || save.isPending} onClick={() => { save.mutate({ id: row.id, changes: { total_minutes: total + Math.floor(Number(topUp)) } }); setTopUp(''); }}>Add minutes</Button>
        </div>
        <label className="flex items-start justify-between gap-3 text-sm">
          <span>Count both people on a call<span className="block text-xs text-muted-foreground">ZEGOCLOUD may bill each person's minutes. A 3 minute call then uses 6. Check your plan on the ZEGOCLOUD console and match it here.</span></span>
          <Switch checked={row.participants_counted === 2} onCheckedChange={on => save.mutate({ id: row.id, changes: { participants_counted: on ? 2 : 1 } })} />
        </label>
        <label className="flex items-start justify-between gap-3 text-sm">
          <span>Pause new calls when the minutes run out<span className="block text-xs text-muted-foreground">Members see "calling is paused". Turn off if you would rather let calls continue.</span></span>
          <Switch checked={row.block_when_exhausted} onCheckedChange={on => save.mutate({ id: row.id, changes: { block_when_exhausted: on } })} />
        </label>
      </div>
    </section>
  );
}

function AddTerm({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [start, setStart] = useState(new Date().toISOString().slice(0, 10));
  const [end, setEnd] = useState('');
  const add = useMutation({
    mutationFn: async () => {
      if (name.trim().length < 2 || !end) throw new Error('Enter a name and an expiry date');
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'service';
      const { error } = await db.from('platform_subscriptions').insert({ slug: `${slug}-${Math.random().toString(36).slice(2, 6)}`, name: name.trim(), kind: 'term', started_at: `${start}T00:00:00Z`, expires_at: `${end}T00:00:00Z` });
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Added'); queryClient.invalidateQueries({ queryKey: ['subscription-overview'] }); onDone(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <form className="flex flex-wrap items-end gap-2 rounded-lg bg-card p-4 card-shadow" onSubmit={e => { e.preventDefault(); add.mutate(); }}>
      <label className="text-xs text-muted-foreground">Service (e.g. domain name)<Input className="mt-1 h-9 w-56" value={name} onChange={e => setName(e.target.value)} maxLength={80} /></label>
      <label className="text-xs text-muted-foreground">Started<Input type="date" className="mt-1 h-9 w-40" value={start} onChange={e => setStart(e.target.value)} /></label>
      <label className="text-xs text-muted-foreground">Expires<Input type="date" className="mt-1 h-9 w-40" value={end} onChange={e => setEnd(e.target.value)} /></label>
      <Button type="submit" size="sm" disabled={add.isPending}>Add</Button>
      <Button type="button" size="sm" variant="ghost" onClick={onDone}>Cancel</Button>
    </form>
  );
}

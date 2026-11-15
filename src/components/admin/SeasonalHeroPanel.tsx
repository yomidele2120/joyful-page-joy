import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';

const rpc = (name: string, args?: Record<string, unknown>) => (supabase as any).rpc(name, args) as Promise<{ data: any; error: { message: string } | null }>;

interface Status {
  settings: { enabled: boolean; auto_publish: boolean };
  runs: { id: string; season_key: string; status: string; failures: number; error: string | null; published: boolean; cost_estimate_usd: number; finished_at: string | null }[];
  live_generated: number;
}

const monthName = (key: string) => { const [y, m] = key.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleString('en', { month: 'long', year: 'numeric' }); };
const RUN_LABEL: Record<string, string> = { succeeded: 'Done', running: 'In progress', failed: 'Failed' };

/** Admin: the monthly AI hero banners. Turn them on or off, choose whether new sets go live by themselves, and make this month's set now. */
export default function SeasonalHeroPanel() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin', 'seasonal-hero'], queryFn: async () => { const { data, error } = await rpc('admin_seasonal_hero_status'); if (error) throw new Error(error.message); return data as Status; } });
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin', 'seasonal-hero'] });

  const save = async (patch: { enabled?: boolean; auto_publish?: boolean }) => {
    const s = q.data?.settings; if (!s) return;
    const { error } = await rpc('admin_set_seasonal_hero_settings', { _enabled: patch.enabled ?? s.enabled, _auto_publish: patch.auto_publish ?? s.auto_publish });
    if (error) toast.error(error.message); else { toast.success('Saved.'); refresh(); }
  };

  // Each call paints one picture (to stay inside the platform's time limit), so keep calling until the set is published.
  const generate = async (force: boolean) => {
    if (force && !window.confirm('Make a new set for this month? The current generated set for this month is replaced.')) return;
    setBusy(true); setProgress('Starting...');
    try {
      for (let i = 0; i < 10; i++) {
        const { data, error } = await supabase.functions.invoke('seasonal-hero-generate', { body: { force: force && i === 0 } });
        if (error) throw new Error(error.message || 'The generator could not be reached. Is it deployed?');
        const r = data as { status: string; done?: number; total?: number; error?: string; last_error?: string };
        if (r.status === 'published') { toast.success(r.error ? r.error : 'This month\'s hero banners are ready.'); break; }
        if (r.status === 'already_done') { toast.message('This month\'s banners were already made. Use "Make a new set" to redo them.'); break; }
        if (r.status === 'disabled') { toast.message('Seasonal banners are switched off.'); break; }
        if (r.status === 'failed') throw new Error(r.error || 'Generation failed.');
        if (r.status === 'busy') { toast.message('Another run is working on this month. Check back in a few minutes.'); break; }
        if (r.status === 'progress') { setProgress(`Painted ${r.done} of ${r.total}...${r.last_error ? ' (retrying after an error)' : ''}`); continue; }
        throw new Error('Unexpected reply from the generator.');
      }
    } catch (e: any) { toast.error(e?.message ?? 'Generation failed.'); }
    finally { setBusy(false); setProgress(''); refresh(); }
  };

  const s = q.data?.settings;
  return (
    <section className="mb-6 rounded-xl border border-border bg-card p-4">
      <h2 className="text-base font-semibold">Seasonal hero banners</h2>
      <p className="mt-1 text-xs text-muted-foreground">Each month the AI paints five new banners for the homepage hero (three slides and two side tiles) to match the season. The words on them come from a fixed list, and the AI only paints the picture. Your own uploaded flyers are never touched.</p>
      {q.isLoading && <p className="mt-3 text-sm text-muted-foreground">Loading...</p>}
      {q.error && <p className="mt-3 text-sm text-destructive">Could not load: {(q.error as Error).message}. Has the seasonal hero migration been run?</p>}
      {s && (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <label className="flex items-center gap-2"><Switch checked={s.enabled} onCheckedChange={(v) => save({ enabled: v })} aria-label="Make seasonal banners each month" /> Make them every month</label>
            <label className="flex items-center gap-2"><Switch checked={s.auto_publish} onCheckedChange={(v) => save({ auto_publish: v })} aria-label="Put new banners live automatically" /> Put new banners live by themselves</label>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{s.auto_publish ? 'A new set replaces last month\'s on the homepage as soon as it is ready.' : 'A new set is saved switched off. Turn it on below in the flyer list when you are happy with it.'} Live generated banners now: {q.data?.live_generated ?? 0}.</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button size="sm" disabled={busy} onClick={() => generate(false)}>{busy ? 'Working...' : 'Make this month\'s banners'}</Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => generate(true)}>Make a new set</Button>
            {progress && <span className="text-xs text-muted-foreground">{progress}</span>}
          </div>
          {!!q.data?.runs.length && (
            <ul className="mt-3 space-y-1 text-xs">
              {q.data.runs.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2">
                  <b>{monthName(r.season_key)}</b> · {RUN_LABEL[r.status] ?? r.status}{r.status === 'succeeded' && !r.published ? ' (waiting to be switched on)' : ''}
                  <span className="text-muted-foreground">cost about ${Number(r.cost_estimate_usd).toFixed(2)} (estimate){r.error && r.status !== 'succeeded' ? ` · ${r.error}` : ''}</span>
                </li>))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

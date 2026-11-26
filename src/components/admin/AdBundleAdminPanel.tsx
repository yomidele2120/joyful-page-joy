import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { formatNaira } from '@/lib/format';

const db = supabase as any;
const k2n = (k: number) => String(Math.round(Number(k) / 100));
const n2k = (v: string) => Math.round(Number(v) * 100);

/** Admin: switch the all-inclusive subscription on or off, and edit its prices. */
export default function AdBundleAdminPanel() {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const { data: sw } = useQuery<any>({ queryKey: ['adm-bundle-switch'], queryFn: async () => (await db.from('ad_bundle_settings').select('enabled').eq('id', true).maybeSingle()).data });
  const { data: rates = [] } = useQuery<any[]>({ queryKey: ['adm-bundle-rates'], queryFn: async () => (await db.from('ad_bundle_platform_rates').select('*').order('platform')).data ?? [] });
  const { data: durations = [] } = useQuery<any[]>({ queryKey: ['adm-bundle-durations'], queryFn: async () => (await db.from('plan_duration_prices').select('*').order('plan_slug').order('months')).data ?? [] });
  const { data: caps = [] } = useQuery<any[]>({ queryKey: ['adm-bundle-caps'], queryFn: async () => (await db.from('ad_bundle_tier_rules').select('*').order('plan_slug').order('platform')).data ?? [] });
  const val = (key: string, fallback: string) => draft[key] ?? fallback;
  const refresh = () => qc.invalidateQueries({ predicate: q => String(q.queryKey[0]).startsWith('adm-bundle') || q.queryKey[0] === 'ad-bundle-options' });

  const toggle = async () => {
    const { error } = await db.from('ad_bundle_settings').update({ enabled: !sw?.enabled, updated_at: new Date().toISOString() }).eq('id', true);
    if (error) return toast.error(error.message);
    toast.success(!sw?.enabled ? 'All-inclusive subscription is ON' : 'All-inclusive subscription is OFF');
    refresh();
  };
  const save = async (table: string, match: Record<string, unknown>, values: Record<string, unknown>) => {
    let q = db.from(table).update({ ...values, updated_at: new Date().toISOString() });
    for (const [c, v] of Object.entries(match)) q = q.eq(c, v);
    const { error } = await q;
    if (error) return toast.error(error.message);
    toast.success('Saved'); refresh();
  };

  return (
    <section className="space-y-5 rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-heading text-base font-bold">All-inclusive subscription (plan + ad days, one payment)</h3>
          <p className="text-xs text-muted-foreground">When ON, suppliers buy a plan, a duration and ad days on one screen. When OFF they see the original membership screen. Payments already made are not affected.</p>
        </div>
        <Button variant={sw?.enabled ? 'destructive' : 'default'} onClick={toggle}>{sw?.enabled ? 'Turn OFF' : 'Turn ON'}</Button>
      </div>

      <div>
        <h4 className="text-sm font-semibold">Ad platform rates</h4>
        <p className="text-xs text-muted-foreground">Vendors see only the price per ad day. Your cost and tax are for you.</p>
        <div className="mt-2 space-y-2">
          {rates.map(r => (
            <div key={r.platform} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="w-40 font-medium">{r.label}</span>
              <label className="text-xs">Our cost (N)<input className="ml-1 h-8 w-24 rounded border px-2" value={val(`c${r.platform}`, k2n(r.internal_cost_per_day_kobo))} onChange={e => setDraft(d => ({ ...d, [`c${r.platform}`]: e.target.value }))} /></label>
              <label className="text-xs">Vendor price per day (N)<input className="ml-1 h-8 w-24 rounded border px-2" value={val(`p${r.platform}`, k2n(r.vendor_price_per_day_kobo))} onChange={e => setDraft(d => ({ ...d, [`p${r.platform}`]: e.target.value }))} /></label>
              <label className="text-xs"><input type="checkbox" checked={r.is_active} onChange={e => save('ad_bundle_platform_rates', { platform: r.platform }, { is_active: e.target.checked })} /> On</label>
              <Button size="sm" variant="outline" onClick={() => save('ad_bundle_platform_rates', { platform: r.platform }, { internal_cost_per_day_kobo: n2k(val(`c${r.platform}`, k2n(r.internal_cost_per_day_kobo))), vendor_price_per_day_kobo: n2k(val(`p${r.platform}`, k2n(r.vendor_price_per_day_kobo))) })}>Save</Button>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h4 className="text-sm font-semibold">Plan price by duration (service only, no ads)</h4>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {durations.map(d => {
            const key = `d${d.plan_slug}${d.months}`;
            return (
              <div key={key} className="flex items-center gap-2 text-sm">
                <span className="w-36">{d.plan_slug} / {d.months} mo</span>
                <input className="h-8 w-28 rounded border px-2" value={val(key, k2n(d.price_kobo))} onChange={e => setDraft(x => ({ ...x, [key]: e.target.value }))} />
                <Button size="sm" variant="outline" onClick={() => save('plan_duration_prices', { plan_slug: d.plan_slug, months: d.months }, { price_kobo: n2k(val(key, k2n(d.price_kobo))) })}>Save</Button>
                <span className="text-xs text-muted-foreground">{formatNaira(d.price_kobo / 100)}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <h4 className="text-sm font-semibold">Most ad days a month, per plan and platform (0 removes it from the plan)</h4>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {caps.map(c => {
            const key = `k${c.plan_slug}${c.platform}`;
            return (
              <div key={key} className="flex items-center gap-2 text-sm">
                <span className="w-36">{c.plan_slug} / {c.platform}</span>
                <input className="h-8 w-16 rounded border px-2" value={val(key, String(c.max_days_per_month))} onChange={e => setDraft(x => ({ ...x, [key]: e.target.value }))} />
                <Button size="sm" variant="outline" onClick={async () => {
                  const { error } = await db.from('ad_bundle_tier_rules').update({ max_days_per_month: Math.min(31, Math.max(0, Number(val(key, String(c.max_days_per_month))) || 0)) }).eq('plan_slug', c.plan_slug).eq('platform', c.platform);
                  if (error) return toast.error(error.message); toast.success('Saved'); refresh();
                }}>Save</Button>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

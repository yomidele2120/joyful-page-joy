import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Panel } from '@/components/dashboard/DashboardShell';
import { supabase } from '@/integrations/supabase/client';
import { call } from '@/lib/ads/adsApi';
import { formatNaira } from '@/lib/format';
import { fmtDate, Stat } from '@/components/ads/adUi';

const db = supabase as any;

/** Admin: boost packages (prices are yours to set; none are preset) and the money that came in. */
export default function AdBoostAdminPanel() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin-boost'] });
  const pk = useQuery<any[]>({ queryKey: ['admin-boost', 'packages'], queryFn: async () => { const { data, error } = await db.from('ad_boost_packages').select('*').order('sort_order').order('price_kobo'); if (error) throw error; return data ?? []; } });
  const sum = useQuery<any>({ queryKey: ['admin-boost', 'summary'], queryFn: () => call('admin_ad_boost_summary') });
  const [f, setF] = useState({ name: '', impressions: '', price: '' });
  const save = async (id: string, patch: Record<string, unknown>) => { const { error } = await db.from('ad_boost_packages').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id); error ? toast.error(error.message) : (toast.success('Saved.'), refresh()); };
  const add = async () => {
    const { error } = await db.from('ad_boost_packages').insert({ name: f.name.trim(), impressions: Number(f.impressions), price_kobo: Math.round(Number(f.price) * 100), is_active: false });
    if (error) toast.error(error.message); else { toast.success('Package added (switched off until you turn it on).'); setF({ name: '', impressions: '', price: '' }); refresh(); }
  };
  const s = sum.data;
  return (
    <Panel title="Ad boosts (paid extra views)">
      {s && <div className="grid grid-cols-2 gap-3 md:grid-cols-3"><Stat label="Boost revenue, last 30 days" value={formatNaira(s.revenue_kobo_30d / 100)} /><Stat label="Boost revenue, all time" value={formatNaira(s.revenue_kobo_all / 100)} /><Stat label="Paid boosts" value={String(s.paid_count)} /></div>}
      {!!s?.needs_review?.length && <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900"><b>Payments needing your attention</b> (money received, views not applied; refund in Paystack or reapply):
        {s.needs_review.map((r: any) => <div key={r.id}>{r.store_name} · {formatNaira(r.amount_kobo / 100)} · {r.reference} · {r.detail}</div>)}</div>}
      <h3 className="mb-2 mt-4 text-sm font-medium">Packages</h3>
      {pk.data?.map((p) => <div key={p.id} className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-sm"><span>{p.name}: {p.impressions.toLocaleString()} views · {formatNaira(p.price_kobo / 100)}</span>
        <span className="flex items-center gap-2">On sale<Switch checked={p.is_active} onCheckedChange={(v: boolean) => save(p.id, { is_active: v })} /></span></div>)}
      <div className="mt-3 grid gap-2 sm:grid-cols-4"><Input placeholder="Name" value={f.name} onChange={(e: any) => setF({ ...f, name: e.target.value })} /><Input type="number" placeholder="Views (100+)" value={f.impressions} onChange={(e: any) => setF({ ...f, impressions: e.target.value })} />
        <Input type="number" placeholder="Price in naira" value={f.price} onChange={(e: any) => setF({ ...f, price: e.target.value })} /><Button disabled={!f.name || !f.impressions || !f.price} onClick={add}>Add package</Button></div>
      {!!s?.recent?.length && <><h3 className="mb-1 mt-4 text-sm font-medium">Recent boost payments</h3><div className="overflow-x-auto"><table className="w-full text-xs"><tbody>{s.recent.map((r: any) => <tr key={r.id} className="border-t border-border"><td className="p-1">{fmtDate(r.created_at)}</td><td>{r.store_name}</td><td>{r.package_name}</td><td>{formatNaira(r.amount_kobo / 100)}</td><td>{r.status}</td></tr>)}</tbody></table></div></>}
    </Panel>
  );
}

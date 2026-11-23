// Admin: minimum daily budget and management fee for each external ad platform.
// Daily cost = the larger of the platform's minimum spend and (people to reach / 1,000 x cost per 1,000 x goal factor), in naira, + ITHUBAFRICA fee (percentage, with a floor per day).
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Panel } from '@/components/dashboard/DashboardShell';
import { supabase } from '@/integrations/supabase/client';
import { PLATFORM_LABEL } from '@/lib/ads/adStatus';

const db = supabase as any;
const naira = (v: number) => `₦${Math.round(Number(v)).toLocaleString()}`;

export default function ExternalPricingPanel() {
  const qc = useQueryClient();
  const { data } = useQuery<any>({
    queryKey: ['external-pricing'],
    queryFn: async () => { const { data, error } = await db.rpc('admin_get_external_pricing'); if (error) throw error; return data; },
  });
  const [rate, setRate] = useState('');
  const [tf, setTf] = useState('');
  const [sf, setSf] = useState('');
  const [tax, setTax] = useState('');
  useEffect(() => { if (data) { setRate(String(data.usd_to_ngn)); setTf(String(data.traffic_factor)); setSf(String(data.sales_factor)); setTax(String(data.tax_percent)); } }, [data?.usd_to_ngn, data?.traffic_factor, data?.sales_factor, data?.tax_percent]);
  if (!data) return null;

  const save = async (p: any, f: { usd: string; cpm: string; pct: string; floor: string }) => {
    const { error } = await db.rpc('admin_set_external_pricing', { _platform: p.platform, _min_usd: Number(f.usd), _cpm_usd: Number(f.cpm), _traffic_factor: Number(tf), _sales_factor: Number(sf), _tax_percent: Number(tax), _fee_percent: Number(f.pct), _min_fee_ngn: Number(f.floor), _usd_to_ngn: Number(rate) });
    if (error) return toast.error(error.message);
    toast.success(`${PLATFORM_LABEL[p.platform]} saved`);
    qc.invalidateQueries({ queryKey: ['external-pricing'] }); qc.invalidateQueries({ queryKey: ['external-min-budget'] });
  };

  return (
    <Panel title="Minimum budget and management fee">
      <p className="mb-3 text-xs text-muted-foreground">The price depends on how many people the vendor wants to reach each day: more people cost more, but never less than the platform's own daily minimum. Vendors cannot submit below it. The fee part of it is ITHUBAFRICA's income and is taken from the vendor's ad balance once, when you mark the campaign as running. Update the dollar rate when the naira moves.</p>
      <label className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">Naira per dollar<Input className="h-9 w-28" type="number" min={1} value={rate} onChange={(e) => setRate(e.target.value)} /></label>
      <div className="mb-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
        <label className="flex items-center gap-2">Visits cost × <Input className="h-9 w-20" type="number" min={1} step="0.5" value={tf} onChange={(e) => setTf(e.target.value)} /></label>
        <label className="flex items-center gap-2">Sales cost × <Input className="h-9 w-20" type="number" min={1} step="0.5" value={sf} onChange={(e) => setSf(e.target.value)} /></label>
        <label className="flex items-center gap-2">Platform tax % <Input className="h-9 w-20" type="number" min={0} step="0.5" value={tax} onChange={(e) => setTax(e.target.value)} /></label>
        <span>(multiplied on the awareness price per 1,000 people)</span>
      </div>
      <div className="space-y-2">{data.platforms.map((p: any) => <Row key={p.platform} p={p} onSave={save} />)}</div>
    </Panel>
  );
}

function Row({ p, onSave }: { p: any; onSave: (p: any, f: { usd: string; cpm: string; pct: string; floor: string }) => void }) {
  const [f, setF] = useState({ usd: String(p.platform_min_daily_usd), cpm: String(p.cpm_usd), pct: String(p.fee_percent), floor: String(p.min_fee_per_day_ngn) });
  const m = p.minimum;
  return (
    <div className="rounded border border-border p-2 text-sm">
      <div className="flex flex-wrap items-end gap-2">
        <span className="w-28 font-medium">{PLATFORM_LABEL[p.platform]}</span>
        <label className="text-xs text-muted-foreground">Platform minimum (USD a day)<Input className="mt-1 h-9 w-24" type="number" min={0} step="0.5" value={f.usd} onChange={(e) => setF({ ...f, usd: e.target.value })} /></label>
        <label className="text-xs text-muted-foreground">Cost per 1,000 people (USD)<Input className="mt-1 h-9 w-24" type="number" min={0} step="0.1" value={f.cpm} onChange={(e) => setF({ ...f, cpm: e.target.value })} /></label>
        <label className="text-xs text-muted-foreground">Fee %<Input className="mt-1 h-9 w-20" type="number" min={0} value={f.pct} onChange={(e) => setF({ ...f, pct: e.target.value })} /></label>
        <label className="text-xs text-muted-foreground">Fee floor (₦ a day)<Input className="mt-1 h-9 w-24" type="number" min={0} value={f.floor} onChange={(e) => setF({ ...f, floor: e.target.value })} /></label>
        <Button size="sm" onClick={() => onSave(p, f)}>Save</Button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">Example: reaching 1,000 people a day costs <b>{naira(p.example_1000.daily_min_ngn)}</b> a day: {naira(p.example_1000.platform_daily_ngn)} to the platform, {naira(p.example_1000.tax_daily_ngn)} tax, <b>{naira(p.example_1000.fee_daily_ngn)}</b> to ITHUBAFRICA. {p.note}</p>
    </div>
  );
}

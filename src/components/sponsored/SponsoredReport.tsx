// One advertising report for admins (all vendors) and for a vendor (their own products only; the database enforces that).
// Two clearly separate groups: numbers copied from TikTok Ads Manager, and what the website itself recorded.
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Panel } from '@/components/dashboard/DashboardShell';
import { supabase } from '@/integrations/supabase/client';
import { Stat } from '@/components/ads/adUi';
import { count, naira, percent, STATUS_LABEL, times, totals, type ReportRow } from '@/lib/sponsored';

const db = supabase as any;
export type Row = ReportRow & {
  campaign_id: string; campaign_name: string; status: string; start_date: string | null; end_date: string | null;
  vendor_id: string; store_name: string; product_id: string; product_name: string; category_name: string | null;
};
export const selectClass = 'h-9 rounded-md border border-input bg-background px-2 text-sm';

export default function SponsoredReport({ mode }: { mode: 'admin' | 'vendor' }) {
  const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const [vendor, setVendor] = useState(''); const [campaign, setCampaign] = useState(''); const [category, setCategory] = useState(''); const [q, setQ] = useState('');
  const { data = [], isLoading, error } = useQuery<Row[]>({
    queryKey: ['sponsored-report', mode, from, to],
    queryFn: async () => {
      const { data, error } = await db.rpc('sponsored_report', { _from: from || null, _to: to || null });
      if (error) throw new Error(error.message);
      return data as Row[];
    },
    staleTime: 30_000,
  });
  const uniq = (key: (r: Row) => [string, string] | null) => [...new Map(data.map(key).filter(Boolean) as [string, string][]).entries()];
  const vendors = useMemo(() => uniq(r => [r.vendor_id, r.store_name]), [data]);
  const campaigns = useMemo(() => uniq(r => [r.campaign_id, r.campaign_name]), [data]);
  const categories = useMemo(() => uniq(r => (r.category_name ? [r.category_name, r.category_name] : null)), [data]);
  const rows = data.filter(r => (!vendor || r.vendor_id === vendor) && (!campaign || r.campaign_id === campaign)
    && (!category || r.category_name === category) && (!q || r.product_name.toLowerCase().includes(q.toLowerCase())));
  const t = totals(rows);
  const mine = mode === 'vendor';

  if (error) return <p className="text-sm text-destructive">The report could not be loaded. {(error as Error).message}</p>;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-muted-foreground">From<Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="h-9 w-36" /></label>
        <label className="text-xs text-muted-foreground">To<Input type="date" value={to} onChange={e => setTo(e.target.value)} className="h-9 w-36" /></label>
        {!mine && <select aria-label="Vendor" className={selectClass} value={vendor} onChange={e => setVendor(e.target.value)}><option value="">All vendors</option>{vendors.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select>}
        <select aria-label="Campaign" className={selectClass} value={campaign} onChange={e => setCampaign(e.target.value)}><option value="">All campaigns</option>{campaigns.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select>
        <select aria-label="Category" className={selectClass} value={category} onChange={e => setCategory(e.target.value)}><option value="">All categories</option>{categories.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select>
        <Input placeholder="Search product" value={q} onChange={e => setQ(e.target.value)} className="h-9 w-44" />
      </div>

      <Panel title="From TikTok Ads Manager (entered by ITHUBAFRICA)">
        <div className="grid grid-cols-2 gap-3 p-3 md:grid-cols-3 lg:grid-cols-6">
          <Stat label={mine ? 'Spend on your products' : 'Advertising spend'} value={naira(t.spend)} />
          <Stat label="Impressions" value={count(t.impressions)} />
          <Stat label="Link clicks" value={count(t.clicks)} />
          <Stat label="Click-through rate" value={percent(t.ctr)} />
          <Stat label="Cost per click" value={naira(t.cpc)} />
          <Stat label="Return on ad spend" value={times(t.roas)} />
        </div>
        {!t.tiktokEntered && !isLoading && <p className="px-3 pb-3 text-xs text-muted-foreground">TikTok figures have not been entered for this selection yet, so they are not shown. Nothing is estimated.</p>}
      </Panel>

      <Panel title="Recorded on the ITHUBAFRICA website">
        <div className="grid grid-cols-2 gap-3 p-3 md:grid-cols-3 lg:grid-cols-5">
          <Stat label="Product views" value={count(t.views)} />
          <Stat label="Added to cart" value={count(t.carts)} />
          <Stat label="Checkouts started" value={count(t.checkouts)} />
          <Stat label="Completed purchases" value={count(t.purchases)} />
          <Stat label="Attributed revenue" value={naira(t.revenue)} />
        </div>
        <p className="px-3 pb-3 text-xs text-muted-foreground">Checkouts started are orders created by shoppers who arrived from the advertisement (paid or not). Purchases and revenue count confirmed payments only. Cost per purchase: {naira(t.costPerPurchase)}.</p>
      </Panel>

      <Panel title={mine ? 'Your advertised products' : 'By product'} flush>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground"><tr>
              <th className="px-3 py-2">Product</th>{!mine && <th className="px-3 py-2">Vendor</th>}<th className="px-3 py-2">Campaign</th><th className="px-3 py-2">Dates</th>
              <th className="px-3 py-2 text-right">Spend</th><th className="px-3 py-2 text-right">Impr.</th><th className="px-3 py-2 text-right">Clicks</th>
              <th className="px-3 py-2 text-right">Views</th><th className="px-3 py-2 text-right">Carts</th><th className="px-3 py-2 text-right">Purchases</th><th className="px-3 py-2 text-right">Revenue</th>
            </tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.campaign_id + r.product_id} className="border-t border-border">
                  <td className="px-3 py-2 font-medium">{r.product_name}</td>{!mine && <td className="px-3 py-2">{r.store_name}</td>}
                  <td className="px-3 py-2">{r.campaign_name}<span className="ml-1 text-xs text-muted-foreground">({STATUS_LABEL[r.status] ?? r.status})</span></td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs">{r.start_date ?? '-'} to {r.end_date ?? '-'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.tiktok_data_entered ? naira(Number(r.spend)) : '-'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.tiktok_data_entered ? count(Number(r.impressions)) : '-'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.tiktok_data_entered ? count(Number(r.clicks)) : '-'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.product_views}</td><td className="px-3 py-2 text-right tabular-nums">{r.add_to_carts}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.purchases}</td><td className="px-3 py-2 text-right tabular-nums">{naira(Number(r.revenue))}</td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={11} className="px-3 py-6 text-center text-muted-foreground">{isLoading ? 'Loading...' : 'No advertised products match.'}</td></tr>}
            </tbody>
          </table>
        </div>
        {rows.length > 0 && <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">When a campaign promotes several products, TikTok spend, impressions and clicks are split between them by the budget share the admin set (equal if none).</p>}
      </Panel>
    </div>
  );
}

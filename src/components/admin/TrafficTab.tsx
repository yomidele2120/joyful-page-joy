import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { supabase } from '@/integrations/supabase/client';
import { formatNaira } from '@/lib/format';
import { Skeleton } from '@/components/ui/skeleton';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';

// Admin > Traffic: who visits the shop and what they do. The numbers come from
// the analytics_summary() database function (admin only). Orders and sales are
// read from the orders table, so they are real sales, not browser reports.

interface Summary {
  days: number;
  active_now: number;
  totals: { visitors: number; sessions: number; pageviews: number; leads: number; registrations: number };
  daily: { day: string; visitors: number; pageviews: number }[];
  funnel: { viewed: number; carted: number; checkout: number; purchased: number };
  top_products: { product_id: string; name: string | null; views: number; carts: number }[];
  top_searches: { term: string; searches: number }[];
  sources: { source: string; sessions: number }[];
  devices: { device: string; sessions: number }[];
  top_pages: { path: string; views: number; visitors: number }[];
  orders: { count: number; value: number };
}

const RANGES = [
  { days: 1, label: 'Today' },
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
];

const chartConfig = {
  visitors: { label: 'Visitors', color: 'hsl(var(--primary))' },
  pageviews: { label: 'Page views', color: 'hsl(var(--accent))' },
} satisfies ChartConfig;

const n = (v: number) => new Intl.NumberFormat('en-NG').format(v);
const pct = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 1000) / 10}%` : '-');

export default function TrafficTab() {
  const [days, setDays] = useState(7);

  const { data, isLoading, error } = useQuery({
    queryKey: ['traffic', days],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('analytics_summary', { _days: days });
      if (error) throw error;
      return data as unknown as Summary;
    },
    refetchInterval: 60_000,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-heading text-lg font-bold">Traffic</h2>
          <p className="text-sm text-muted-foreground">Visits and shopper actions, recorded on this site only. Days are counted in Nigerian time.</p>
        </div>
        <div role="group" aria-label="Date range" className="inline-flex rounded-lg border border-border bg-card p-0.5">
          {RANGES.map(r => (
            <button
              key={r.days}
              type="button"
              onClick={() => setDays(r.days)}
              aria-pressed={days === r.days}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${days === r.days ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
          Traffic numbers could not be loaded: {(error as Error).message}. If this is a new setup, apply the database migration <code>20261019090000_site_analytics.sql</code>.
        </div>
      )}

      {isLoading && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{[0, 1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24" />)}</div>}

      {data && <Report data={data} />}
    </div>
  );
}

function Report({ data }: { data: Summary }) {
  const { totals, funnel, orders } = data;
  const empty = totals.pageviews === 0 && totals.visitors === 0;

  const stages = [
    { label: 'Viewed a product', value: funnel.viewed },
    { label: 'Added to cart', value: funnel.carted },
    { label: 'Started checkout', value: funnel.checkout },
    { label: 'Completed a purchase', value: funnel.purchased },
  ];
  const top = Math.max(...stages.map(s => s.value), 1);

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Visitors" value={n(totals.visitors)} hint={`${n(data.active_now)} on the site now`} />
        <Stat label="Page views" value={n(totals.pageviews)} hint={`${n(totals.sessions)} visits`} />
        <Stat label="Orders" value={n(orders.count)} hint="Paid orders" />
        <Stat label="Order value" value={formatNaira(Number(orders.value))} hint="Paid orders, from the orders table" />
        <Stat label="Orders per visitor" value={pct(orders.count, totals.visitors)} hint={`${n(totals.registrations)} sign-ups, ${n(totals.leads)} inquiries`} />
      </div>

      {empty && (
        <div className="rounded-lg border border-border bg-card p-5 text-sm text-muted-foreground">
          No visits recorded in this period yet. Numbers appear as people browse the live site. Visits from your own admin pages, from robots, and from local development are not counted.
        </div>
      )}

      <section className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-heading font-bold">Visitors and page views per day</h3>
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: 'hsl(var(--primary))' }} />Visitors</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: 'hsl(var(--accent))' }} />Page views</span>
          </div>
        </div>
        <ChartContainer config={chartConfig} className="h-[240px] w-full">
          <AreaChart data={data.daily} margin={{ left: 0, right: 8, top: 8 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} tickFormatter={d => d.slice(5)} />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={36} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Area dataKey="pageviews" type="monotone" stroke="var(--color-pageviews)" fill="var(--color-pageviews)" fillOpacity={0.15} />
            <Area dataKey="visitors" type="monotone" stroke="var(--color-visitors)" fill="var(--color-visitors)" fillOpacity={0.25} />
          </AreaChart>
        </ChartContainer>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-border bg-card p-4">
          <h3 className="font-heading font-bold">Shopping funnel</h3>
          <p className="mb-3 text-xs text-muted-foreground">Different visitors who reached each step. Purchases here are what browsers reported; the Orders card above is the real count.</p>
          <ol className="space-y-3">
            {stages.map((s, i) => (
              <li key={s.label}>
                <div className="mb-1 flex items-baseline justify-between text-sm">
                  <span>{s.label}</span>
                  <span className="font-medium">
                    {n(s.value)}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {i === 0 ? '' : `${pct(s.value, stages[i - 1].value)} of previous`}
                    </span>
                  </span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-secondary">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${(s.value / top) * 100}%` }} />
                </div>
              </li>
            ))}
          </ol>
        </section>

        <Table title="Where visitors come from" head={['Source', 'Visits']} rows={data.sources.map(s => [s.source, n(s.sessions)])} empty="No visits yet." />
        <Table
          title="Most viewed products"
          head={['Product', 'Views', 'Added to cart']}
          rows={data.top_products.map(p => [p.name ?? 'Removed product', n(p.views), n(p.carts)])}
          empty="No product views yet."
        />
        <Table title="What people search for" head={['Search', 'Times']} rows={data.top_searches.map(s => [s.term, n(s.searches)])} empty="No searches yet." />
        <Table title="Most visited pages" head={['Page', 'Views', 'Visitors']} rows={data.top_pages.map(p => [p.path, n(p.views), n(p.visitors)])} empty="No page views yet." />
        <Table title="Devices" head={['Device', 'Visits']} rows={data.devices.map(d => [d.device, n(d.sessions)])} empty="No visits yet." />
      </div>
    </>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 font-heading text-2xl font-bold">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Table({ title, head, rows, empty }: { title: string; head: string[]; rows: string[][]; empty: string }) {
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <h3 className="border-b border-border p-4 font-heading font-bold">{title}</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary">
            <tr>{head.map((h, i) => <th key={h} className={`p-3 font-heading ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.length ? rows.map((r, i) => (
              <tr key={i} className="border-t border-border">
                {r.map((c, j) => <td key={j} className={`p-3 ${j === 0 ? 'max-w-[18rem] truncate font-medium' : 'text-right'}`}>{c}</td>)}
              </tr>
            )) : <tr><td className="p-3 text-muted-foreground" colSpan={head.length}>{empty}</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

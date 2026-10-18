import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { supabase } from '@/integrations/supabase/client';
import { formatNaira } from '@/lib/format';
import { Skeleton } from '@/components/ui/skeleton';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { cn } from '@/lib/utils';
import { DataTable, ExportButton, Kpi, RangePicker, num, pctOf, type Column } from './analyticsUi';

// Admin > Analytics: money, supplier quality and where shoppers drop off.
// Every number comes from an admin-only database function (see
// supabase/migrations/20261020090000_admin_analytics_v2.sql), so totals stay correct as the shop grows.

type Section = 'performance' | 'suppliers' | 'shoppers';

interface Bucket { orders: number; gmv: number; commission: number; refunded: number; new_customers: number; new_suppliers: number; visitors: number; buyers: number; repeat_buyers: number }
interface Overview {
  days: number;
  current: Bucket;
  previous: Bucket;
  all_time: { owed_to_suppliers: number; paid_out: number; commission: number };
  status_mix: { status: string; orders: number }[];
  daily: { day: string; orders: number; gmv: number; commission: number }[];
}
interface Supplier {
  vendor_id: string; store_name: string; orders: number; gmv: number; commission: number; shipments: number;
  on_time_pct: number | null; avg_ship_hours: number | null; overdue: number; disputes: number; dispute_pct: number | null;
  refunds: number; refunded: number; refund_pct: number | null; score: number | null; status: 'healthy' | 'watch' | 'at_risk' | 'new';
}
interface Scorecard { days: number; sla_hours: number; suppliers: Supplier[] }
interface Split { label: string; visits: number; carted: number; checkout: number; purchased: number }
interface Losses {
  totals: { visits: number; carted: number; cart_abandoned: number; checkout_abandoned: number; purchased: number; cart_value_at_risk: number; checkout_value_at_risk: number };
  by_device: Split[]; by_source: Split[];
  abandoned_products: { product_id: string; name: string | null; carts: number; value: number }[];
  unpaid_orders: { count: number; value: number };
}
interface Searches {
  summary: { searches: number; tracked: number; zero_results: number; led_to_cart: number };
  zero_results: { term: string; searches: number; last_seen: string }[];
  no_follow_up: { term: string; searches: number; avg_results: number | null }[];
}

const SETUP_HINT = 'Run supabase/migrations/20261020090000_admin_analytics_v2.sql in the Supabase SQL editor, then refresh.';

type RpcName = 'admin_overview' | 'admin_supplier_scorecard' | 'admin_funnel_losses' | 'admin_search_insights';

function useRpc<T>(name: RpcName, args: { _days: number; _ship_sla_hours?: number }, enabled = true) {
  return useQuery({
    queryKey: ['admin-analytics', name, args],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc(name, args);
      if (error) throw error;
      return data as unknown as T;
    },
  });
}

function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  const msg = (error as { message?: string }).message ?? 'Something went wrong';
  return (
    <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
      <p className="font-medium text-destructive">Could not load these numbers.</p>
      <p className="mt-1 text-muted-foreground">{msg}</p>
      <p className="mt-1 text-muted-foreground">{SETUP_HINT}</p>
    </div>
  );
}

function Card({ title, hint, action, children }: { title: string; hint?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-heading font-bold">{title}</h3>
          {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export default function AnalyticsTab() {
  const [days, setDays] = useState(30);
  const [section, setSection] = useState<Section>('performance');
  const sections: { key: Section; label: string }[] = [
    { key: 'performance', label: 'Performance' },
    { key: 'suppliers', label: 'Supplier scorecard' },
    { key: 'shoppers', label: 'Shoppers & search' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Analytics sections" className="inline-flex flex-wrap gap-1">
          {sections.map(s => (
            <button
              key={s.key} type="button" role="tab" aria-selected={section === s.key}
              onClick={() => setSection(s.key)}
              className={cn('rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                section === s.key ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground')}
            >
              {s.label}
            </button>
          ))}
        </div>
        <RangePicker days={days} onChange={setDays} />
      </div>
      <p className="text-xs text-muted-foreground">Days are counted in Nigerian time. Orders count once they are paid (paid, processing, shipped, delivered).</p>

      {section === 'performance' && <Performance days={days} />}
      {section === 'suppliers' && <Suppliers days={days} />}
      {section === 'shoppers' && <Shoppers days={days} />}
    </div>
  );
}

/* ───────────────────────── Performance ───────────────────────── */

const gmvConfig = { gmv: { label: 'Order value', color: 'hsl(var(--primary))' } } satisfies ChartConfig;
const commConfig = { commission: { label: 'Commission', color: 'hsl(var(--accent))' } } satisfies ChartConfig;

function Performance({ days }: { days: number }) {
  const { data, isLoading, error } = useRpc<Overview>('admin_overview', { _days: days });
  if (error) return <ErrorNote error={error} />;
  const c = data?.current; const p = data?.previous;
  const aov = (b?: Bucket) => (b && b.orders ? b.gmv / b.orders : 0);
  const repeatRate = (b?: Bucket) => (b && b.buyers ? (b.repeat_buyers / b.buyers) * 100 : 0);
  const conv = (b?: Bucket) => (b && b.visitors ? (b.orders / b.visitors) * 100 : 0);
  const take = (b?: Bucket) => (b && b.gmv ? (b.commission / b.gmv) * 100 : 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi loading={isLoading} label="Order value" value={formatNaira(c?.gmv ?? 0)} current={c?.gmv} previous={p?.gmv} />
        <Kpi loading={isLoading} label="Orders" value={num(c?.orders)} current={c?.orders} previous={p?.orders} />
        <Kpi loading={isLoading} label="Average order value" value={formatNaira(aov(c))} current={aov(c)} previous={aov(p)} />
        <Kpi loading={isLoading} label="Commission earned" value={formatNaira(c?.commission ?? 0)} current={c?.commission} previous={p?.commission} hint={`${take(c).toFixed(1)}% of order value`} />
        <Kpi loading={isLoading} label="New customers" value={num(c?.new_customers)} current={c?.new_customers} previous={p?.new_customers} />
        <Kpi loading={isLoading} label="Repeat buyers" value={`${repeatRate(c).toFixed(1)}%`} current={repeatRate(c)} previous={repeatRate(p)} hint={`${num(c?.repeat_buyers)} of ${num(c?.buyers)} buyers`} />
        <Kpi loading={isLoading} label="Visit-to-order rate" value={`${conv(c).toFixed(2)}%`} current={conv(c)} previous={conv(p)} hint={`${num(c?.visitors)} visitors`} />
        <Kpi loading={isLoading} label="Refunds" value={formatNaira(c?.refunded ?? 0)} current={c?.refunded} previous={p?.refunded} goodWhenDown />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi loading={isLoading} label="Owed to suppliers" value={formatNaira(data?.all_time.owed_to_suppliers ?? 0)} hint="held, available or processing" />
        <Kpi loading={isLoading} label="Paid out to suppliers" value={formatNaira(data?.all_time.paid_out ?? 0)} hint="all time" />
        <Kpi loading={isLoading} label="New suppliers" value={num(c?.new_suppliers)} current={c?.new_suppliers} previous={p?.new_suppliers} />
        <Kpi loading={isLoading} label="Commission, all time" value={formatNaira(data?.all_time.commission ?? 0)} hint="from the supplier ledger" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card
          title="Order value per day"
          action={<ExportButton filename="daily-performance" head={['Day', 'Orders', 'Order value', 'Commission']} rows={(data?.daily ?? []).map(d => [d.day, d.orders, d.gmv, d.commission])} disabled={isLoading} />}
        >
          {isLoading ? <Skeleton className="h-[220px] w-full" /> : (
            <ChartContainer config={gmvConfig} className="h-[220px] w-full">
              <AreaChart data={data?.daily ?? []} margin={{ left: 0, right: 8, top: 8 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="day" tickLine={false} axisLine={false} tickFormatter={(d: string) => d.slice(5)} minTickGap={24} />
                <YAxis tickLine={false} axisLine={false} width={48} tickFormatter={(v: number) => (v >= 1e6 ? `${v / 1e6}M` : v >= 1e3 ? `${v / 1e3}k` : String(v))} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area dataKey="gmv" type="monotone" stroke="var(--color-gmv)" fill="var(--color-gmv)" fillOpacity={0.15} />
              </AreaChart>
            </ChartContainer>
          )}
        </Card>
        <Card title="Commission earned per day">
          {isLoading ? <Skeleton className="h-[220px] w-full" /> : (
            <ChartContainer config={commConfig} className="h-[220px] w-full">
              <BarChart data={data?.daily ?? []} margin={{ left: 0, right: 8, top: 8 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="day" tickLine={false} axisLine={false} tickFormatter={(d: string) => d.slice(5)} minTickGap={24} />
                <YAxis tickLine={false} axisLine={false} width={48} tickFormatter={(v: number) => (v >= 1e3 ? `${v / 1e3}k` : String(v))} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="commission" fill="var(--color-commission)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          )}
        </Card>
      </div>

      <DataTable
        title="Orders by status" hint="Every order placed in this period, including unpaid ones."
        filename="orders-by-status" loading={isLoading} rowKey={r => r.status} empty="No orders in this period."
        defaultSort={{ key: 'orders', desc: true }}
        rows={data?.status_mix ?? []}
        columns={[
          { key: 'status', label: 'Status', render: r => <span className="capitalize">{r.status.replace(/_/g, ' ')}</span>, value: r => r.status, sortable: true },
          { key: 'orders', label: 'Orders', align: 'right', render: r => num(r.orders), value: r => r.orders, sortable: true },
        ] satisfies Column<{ status: string; orders: number }>[]}
      />
    </div>
  );
}

/* ───────────────────────── Suppliers ───────────────────────── */

const STATUS_STYLE: Record<Supplier['status'], string> = {
  healthy: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  watch: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  at_risk: 'bg-destructive/10 text-destructive',
  new: 'bg-secondary text-muted-foreground',
};
const STATUS_LABEL: Record<Supplier['status'], string> = { healthy: 'Healthy', watch: 'Watch', at_risk: 'At risk', new: 'Too new to score' };
const dash = (v: number | null, suffix = '') => (v === null || v === undefined ? '-' : `${v}${suffix}`);

function Suppliers({ days }: { days: number }) {
  const [sla, setSla] = useState(48);
  const { data, isLoading, error } = useRpc<Scorecard>('admin_supplier_scorecard', { _days: days, _ship_sla_hours: sla });
  if (error) return <ErrorNote error={error} />;
  const list = data?.suppliers ?? [];
  const count = (s: Supplier['status']) => list.filter(x => x.status === s).length;

  const columns: Column<Supplier>[] = [
    { key: 'store', label: 'Supplier', render: r => r.store_name, value: r => r.store_name, sortable: true },
    { key: 'status', label: 'Health', render: r => (
        <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', STATUS_STYLE[r.status])}>
          {r.score !== null ? `${r.score} · ` : ''}{STATUS_LABEL[r.status]}
        </span>
      ), value: r => r.score, sortable: true },
    { key: 'orders', label: 'Orders', align: 'right', render: r => num(r.orders), value: r => r.orders, sortable: true },
    { key: 'gmv', label: 'Sales', align: 'right', render: r => formatNaira(r.gmv), value: r => r.gmv, sortable: true },
    { key: 'commission', label: 'Commission', align: 'right', render: r => formatNaira(r.commission), value: r => r.commission, sortable: true },
    { key: 'ontime', label: `Shipped in ${sla}h`, align: 'right', render: r => dash(r.on_time_pct, '%'), value: r => r.on_time_pct, sortable: true },
    { key: 'hours', label: 'Avg hours to ship', align: 'right', render: r => dash(r.avg_ship_hours), value: r => r.avg_ship_hours, sortable: true },
    { key: 'overdue', label: 'Overdue now', align: 'right', render: r => (r.overdue > 0 ? <span className="font-medium text-destructive">{r.overdue}</span> : '0'), value: r => r.overdue, sortable: true },
    { key: 'disputes', label: 'Disputes', align: 'right', render: r => `${r.disputes}${r.dispute_pct !== null ? ` (${r.dispute_pct}%)` : ''}`, value: r => r.disputes, sortable: true },
    { key: 'refunds', label: 'Refunds', align: 'right', render: r => `${r.refunds}${r.refunded ? ` · ${formatNaira(r.refunded)}` : ''}`, value: r => r.refunded, sortable: true },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi loading={isLoading} label="Healthy" value={String(count('healthy'))} hint="score 80 or more" />
        <Kpi loading={isLoading} label="Watch" value={String(count('watch'))} hint="score 60 to 79" />
        <Kpi loading={isLoading} label="At risk" value={String(count('at_risk'))} hint="score under 60" />
        <Kpi loading={isLoading} label="Too new to score" value={String(count('new'))} hint="fewer than 3 shipments" />
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label htmlFor="sla" className="text-muted-foreground">Shipping target</label>
        <select id="sla" value={sla} onChange={e => setSla(Number(e.target.value))} className="rounded-md border border-border bg-background px-2 py-1 text-sm">
          {[24, 48, 72, 120].map(h => <option key={h} value={h}>{h} hours from payment</option>)}
        </select>
      </div>
      <DataTable
        title="Supplier scorecard"
        hint="Score = 40% shipped within the target + 40% few disputes + 20% few refunds. Click a column to sort."
        filename="supplier-scorecard" loading={isLoading} rowKey={r => r.vendor_id} empty="No approved suppliers yet."
        defaultSort={{ key: 'gmv', desc: true }} rows={list} columns={columns}
      />
    </div>
  );
}

/* ───────────────────────── Shoppers & search ───────────────────────── */

function splitColumns(label: string): Column<Split>[] {
  return [
    { key: 'label', label, render: r => r.label, value: r => r.label, sortable: true },
    { key: 'visits', label: 'Visits', align: 'right', render: r => num(r.visits), value: r => r.visits, sortable: true },
    { key: 'carted', label: 'Added to cart', align: 'right', render: r => `${num(r.carted)} (${pctOf(r.carted, r.visits)})`, value: r => r.carted, sortable: true },
    { key: 'checkout', label: 'Started checkout', align: 'right', render: r => `${num(r.checkout)} (${pctOf(r.checkout, r.visits)})`, value: r => r.checkout, sortable: true },
    { key: 'purchased', label: 'Purchased', align: 'right', render: r => `${num(r.purchased)} (${pctOf(r.purchased, r.visits)})`, value: r => r.purchased, sortable: true },
  ];
}

function Shoppers({ days }: { days: number }) {
  const losses = useRpc<Losses>('admin_funnel_losses', { _days: days });
  const search = useRpc<Searches>('admin_search_insights', { _days: days });
  const t = losses.data?.totals;
  const s = search.data?.summary;

  return (
    <div className="space-y-4">
      {losses.error ? <ErrorNote error={losses.error} /> : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi loading={losses.isLoading} label="Carts left behind" value={num(t?.cart_abandoned)} hint={`about ${formatNaira(t?.cart_value_at_risk ?? 0)} in carts`} />
            <Kpi loading={losses.isLoading} label="Checkouts not finished" value={num(t?.checkout_abandoned)} hint={`about ${formatNaira(t?.checkout_value_at_risk ?? 0)} at checkout`} />
            <Kpi loading={losses.isLoading} label="Unpaid orders" value={num(losses.data?.unpaid_orders.count)} hint={`${formatNaira(losses.data?.unpaid_orders.value ?? 0)}, older than 1 hour`} />
            <Kpi loading={losses.isLoading} label="Visits that bought" value={pctOf(t?.purchased ?? 0, t?.visits ?? 0)} hint={`${num(t?.purchased)} of ${num(t?.visits)} visits`} />
          </div>
          <p className="text-xs text-muted-foreground">Counted per visit. Someone who adds to cart on Monday and buys on Friday appears once as a left-behind cart and once as a purchase.</p>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <DataTable title="Funnel by device" filename="funnel-by-device" loading={losses.isLoading} rowKey={r => r.label} empty="No visits yet." columns={splitColumns('Device')} rows={losses.data?.by_device ?? []} />
            <DataTable title="Funnel by source" filename="funnel-by-source" loading={losses.isLoading} rowKey={r => r.label} empty="No visits yet." columns={splitColumns('Source')} rows={losses.data?.by_source ?? []} />
          </div>

          <DataTable
            title="Products left in carts" hint="Added to a cart in a visit that did not end in a purchase."
            filename="abandoned-products" loading={losses.isLoading} rowKey={r => r.product_id} empty="No abandoned carts in this period."
            rows={losses.data?.abandoned_products ?? []}
            columns={[
              { key: 'name', label: 'Product', render: r => r.name ?? 'Deleted product', value: r => r.name ?? 'Deleted product' },
              { key: 'carts', label: 'Visits', align: 'right', render: r => num(r.carts), value: r => r.carts, sortable: true },
              { key: 'value', label: 'Cart value', align: 'right', render: r => formatNaira(r.value), value: r => r.value, sortable: true },
            ] satisfies Column<Losses['abandoned_products'][number]>[]}
          />
        </>
      )}

      {search.error ? <ErrorNote error={search.error} /> : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi loading={search.isLoading} label="Searches" value={num(s?.searches)} />
            <Kpi loading={search.isLoading} label="Found nothing" value={s?.tracked ? pctOf(s.zero_results, s.tracked) : '-'} hint={s?.tracked ? `${num(s.zero_results)} of ${num(s.tracked)} counted searches` : 'result counts start recording now'} />
            <Kpi loading={search.isLoading} label="Led to an add-to-cart" value={pctOf(s?.led_to_cart ?? 0, s?.searches ?? 0)} />
            <Kpi loading={search.isLoading} label="Searches with a result count" value={num(s?.tracked)} hint="older searches have none" />
          </div>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <DataTable
              title="Searches that found nothing" hint="People wanted these and you had nothing to show: products to stock, or spellings to support."
              filename="searches-no-results" loading={search.isLoading} rowKey={r => r.term} empty="No empty searches recorded yet."
              rows={search.data?.zero_results ?? []}
              columns={[
                { key: 'term', label: 'Search', render: r => r.term, value: r => r.term },
                { key: 'searches', label: 'Times', align: 'right', render: r => num(r.searches), value: r => r.searches, sortable: true },
                { key: 'last', label: 'Last seen', align: 'right', render: r => new Date(r.last_seen).toLocaleDateString(), value: r => r.last_seen.slice(0, 10), sortable: true },
              ] satisfies Column<Searches['zero_results'][number]>[]}
            />
            <DataTable
              title="Searches nobody followed up" hint="Products were found but nobody added one to a cart. Often a price, photo or title problem."
              filename="searches-no-follow-up" loading={search.isLoading} rowKey={r => r.term} empty="Nothing stands out."
              rows={search.data?.no_follow_up ?? []}
              columns={[
                { key: 'term', label: 'Search', render: r => r.term, value: r => r.term },
                { key: 'searches', label: 'Times', align: 'right', render: r => num(r.searches), value: r => r.searches, sortable: true },
                { key: 'avg', label: 'Avg results', align: 'right', render: r => (r.avg_results === null ? '-' : num(r.avg_results)), value: r => r.avg_results, sortable: true },
              ] satisfies Column<Searches['no_follow_up'][number]>[]}
            />
          </div>
        </>
      )}
    </div>
  );
}

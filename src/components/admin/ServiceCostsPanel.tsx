import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useSubscriptionOverview } from '@/hooks/useSubscriptions';
import { daysLeftText, stageView, usedPercent, type SubscriptionRow, type Tone } from '@/lib/subscriptions';

// Read-only on purpose: no inputs, no edit controls. Every figure is calculated by the database (admin_service_costs_summary,
// admin_ai_ledger); this file only formats them.
const db = supabase as any;
const PAGE = 25;

type Service = { service_key: string; service_name: string; currency: 'NGN' | 'USD'; monthly_allocation: number | null; billing_months: number | null;
  annual_allocation: number | null; payment_status: string; actual_amount_paid: number | null;  funded_balance: number | null; note: string | null };
type Summary = { services: Service[]; openai_allocation_usd: number | null; openai_funded_usd: number | null; actual_spend_usd: number;
  remaining_actual_usd: number; service_charges_usd: number; billed_calls: number; tracking_since: string | null };
type Row = { id: string; created_at: string; service: string; feature: string | null; model: string | null; status: string;
  actual_cost_usd: number; service_charge_usd: number; user_label: string };

const ngn = (n: number | null | undefined) => `₦${Number(n ?? 0).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;
const usd = (n: number | null | undefined, d = 2) => `$${Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}`;
const usdFine = (n: number) => `$${Number(n).toFixed(4)}`;
const money = (cur: string, n: number | null | undefined, empty = '-') => (n === null || n === undefined ? empty : cur === 'USD' ? usd(n) : ngn(n));
const SERVICE_LABEL: Record<string, string> = {
  image_generation: 'Image generation', text_generation: 'Text generation', image_review: 'Image safety review', prompt_moderation: 'Prompt check',
};
const FEATURE_LABEL: Record<string, string> = {
  seasonal_hero: 'Seasonal hero banners', ad_campaign_banner: 'Vendor ad banner', ad_ai_image: 'Vendor AI ad image', auto_product_image: 'Auto product image',
  listing_assist: 'Listing assistant', search_assist: 'Search assistant',
};

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg bg-card p-4 card-shadow">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-heading text-xl font-bold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs text-muted-foreground">{label}</dt><dd className="font-medium tabular-nums">{value}</dd></div>;
}

export default function ServiceCostsPanel() {
  const [page, setPage] = useState(0);
  const summary = useQuery({
    queryKey: ['admin-service-costs'],
    queryFn: async () => { const { data, error } = await db.rpc('admin_service_costs_summary'); if (error) throw error; return data as Summary; },
    refetchInterval: 60_000,
  });
  const ledger = useQuery({
    queryKey: ['admin-ai-ledger', page],
    queryFn: async () => { const { data, error } = await db.rpc('admin_ai_ledger', { _limit: PAGE, _offset: page * PAGE }); if (error) throw error; return data as { total: number; rows: Row[] }; },
    placeholderData: (prev: any) => prev,
  });

  if (summary.isLoading) return <p className="text-sm text-muted-foreground">Loading...</p>;
  if (summary.isError || !summary.data) {
    return <p className="rounded-lg bg-card p-5 text-sm text-destructive card-shadow">Could not load this section. Run the database update 20261117120000_service_costs_ledger.sql, then reload.</p>;
  }
  const s = summary.data;
  const cloud = s.services.find(x => x.service_key === 'cloudinary');
  const resend = s.services.find(x => x.service_key === 'resend');
  const total = ledger.data?.total ?? 0;
  const lastPage = Math.max(0, Math.ceil(total / PAGE) - 1);

  return (
    <div className="max-w-5xl space-y-6">
      
      <section aria-label="Summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Cloudinary, annual allocation" value={ngn(cloud?.annual_allocation)} />
        <Stat label="Resend, annual allocation" value={ngn(resend?.annual_allocation)} />
        <Stat label="OpenAI funded amount" value={usd(s.openai_funded_usd)} />
        <Stat label="Remaining OpenAI balance" value={usd(s.remaining_actual_usd)} />
        <Stat label="Internal AI service charges" value={usd(s.service_charges_usd)} />
      </section>

      <section aria-label="Platform subscriptions" className="space-y-3">
        <h2 className="font-heading text-base font-semibold">Platform subscriptions</h2>
        <div className="overflow-x-auto rounded-lg bg-card card-shadow">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="p-3 font-medium">Platform</th><th className="p-3 text-right font-medium">Monthly</th><th className="p-3 text-right font-medium">Period</th>
                <th className="p-3 text-right font-medium">Annual</th><th className="p-3 text-right font-medium">Paid so far</th>
              </tr>
            </thead>
            <tbody>
              {s.services.filter(sv => !['openai', 'supabase', 'vercel', 'zegocloud'].includes(sv.service_key)).map(sv => (
                <tr key={sv.service_key} className="border-b border-border/60 last:border-0">
                  <td className="p-3 font-medium">{sv.service_name}</td>
                  <td className="p-3 text-right tabular-nums">{money(sv.currency, sv.monthly_allocation)}</td>
                  <td className="p-3 text-right tabular-nums">{sv.billing_months ? `${sv.billing_months} months` : '-'}</td>
                  <td className="p-3 text-right tabular-nums">{money(sv.currency, sv.annual_allocation)}</td>
                  <td className="p-3 text-right tabular-nums">{money(sv.currency, sv.actual_amount_paid)}</td>
                </tr>
              ))}
              {s.services.filter(sv => sv.service_key === 'openai').map(sv => (
                <tr key={sv.service_key} className="border-t border-border bg-secondary/40">
                  <td className="p-3 font-medium">{sv.service_name}</td>
                  <td className="p-3 text-right text-muted-foreground" colSpan={2}>Prepaid credit</td>
                  <td className="p-3 text-right tabular-nums">{usd(sv.funded_balance)} funded</td>
                  <td className="p-3 text-right tabular-nums">{usd(s.remaining_actual_usd)} left</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <SubscriptionStatus />
      </section>

      <section aria-label="AI usage" className="space-y-3">
        <h2 className="font-heading text-base font-semibold">AI usage</h2>
        <div className="overflow-x-auto rounded-lg bg-card card-shadow">
          <table className="w-full min-w-[600px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="p-3 font-medium">Date and time</th><th className="p-3 font-medium">Service</th><th className="p-3 font-medium">User</th>
                <th className="p-3 text-right font-medium">Service charge</th><th className="p-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {ledger.data?.rows.map(r => (
                <tr key={r.id} className="border-b border-border/60 last:border-0">
                  <td className="whitespace-nowrap p-3 tabular-nums">{new Date(r.created_at).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                  <td className="p-3">
                    {SERVICE_LABEL[r.service] ?? r.service}
                    {r.feature && <span className="block text-xs text-muted-foreground">{FEATURE_LABEL[r.feature] ?? r.feature}</span>}
                  </td>
                  <td className="p-3">{r.user_label}</td>
                  <td className="p-3 text-right tabular-nums">{usdFine(r.service_charge_usd)}</td>
                  <td className="p-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${r.status === 'succeeded' ? 'bg-green-500/10 text-green-700 dark:text-green-400' : 'bg-destructive/10 text-destructive'}`}>
                      {r.status === 'succeeded' ? 'Succeeded' : 'Failed'}
                    </span>
                  </td>
                </tr>
              ))}
              {!ledger.isLoading && !ledger.data?.rows.length && (
                <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No AI requests recorded yet. They appear here as soon as an AI feature is used.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {total > PAGE && (
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{page * PAGE + 1}-{Math.min(total, (page + 1) * PAGE)} of {total.toLocaleString()}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))}>Previous</Button>
              <Button variant="outline" size="sm" disabled={page >= lastPage} onClick={() => setPage(p => Math.min(lastPage, p + 1))}>Next</Button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

// Supabase, Vercel and ZegoCloud come from the existing subscription records (same figures as the Subscriptions tab), shown read-only.
const TONE_BAR: Record<Tone, string> = { ok: 'bg-green-500', warn: 'bg-amber-500', bad: 'bg-destructive' };
const TONE_PILL: Record<Tone, string> = {
  ok: 'bg-green-500/10 text-green-700 dark:text-green-400', warn: 'bg-amber-500/15 text-amber-700 dark:text-amber-400', bad: 'bg-destructive/10 text-destructive',
};
const longDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '-');

function SubscriptionStatus() {
  const { data } = useSubscriptionOverview();
  if (!data?.length) return null;
  return (
    <div className="space-y-3">
      {data.map((row: SubscriptionRow) => {
        const isMinutes = row.kind === 'minutes';
        const v = stageView(row.stage, isMinutes ? 'minutes' : 'term');
        const pct = usedPercent(row);
        return (
          <div key={row.id} className="space-y-3 rounded-lg bg-card p-4 card-shadow">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-medium">{row.name}</h3>
              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${TONE_PILL[v.tone]}`}>
                {v.tone === 'ok' ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> : <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />} {v.label}
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-secondary" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
              <div className={`h-full rounded-full ${TONE_BAR[v.tone]}`} style={{ width: `${Math.max(pct, 1)}%` }} />
            </div>
            {isMinutes ? (
              <div className="grid gap-2 text-sm sm:grid-cols-4">
                <Fact label="Bought" value={`${(row.total_minutes ?? 0).toLocaleString()} min`} />
                <Fact label="Used" value={`${row.used_minutes.toLocaleString()} min`} />
                <Fact label="Left" value={`${(row.remaining_minutes ?? 0).toLocaleString()} min`} />
                <Fact label="Calls counted" value={row.calls_counted.toLocaleString()} />
              </div>
            ) : (
              <div className="grid gap-2 text-sm sm:grid-cols-3">
                <Fact label="Started" value={longDate(row.started_at)} />
                <Fact label="Expires" value={longDate(row.expires_at)} />
                <Fact label="Time left" value={daysLeftText(row.days_left)} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

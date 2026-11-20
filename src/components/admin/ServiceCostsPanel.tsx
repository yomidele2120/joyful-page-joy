import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';

// Read-only on purpose: no inputs, no edit controls. Every figure is calculated by the database (admin_service_costs_summary,
// admin_ai_ledger); this file only formats them.
const db = supabase as any;
const PAGE = 25;

type Service = { service_key: string; service_name: string; currency: 'NGN' | 'USD'; monthly_allocation: number | null; billing_months: number | null;
  annual_allocation: number | null; payment_status: string; actual_amount_paid: number; funded_balance: number | null; note: string | null };
type Summary = { services: Service[]; openai_allocation_usd: number | null; openai_funded_usd: number | null; actual_spend_usd: number;
  remaining_actual_usd: number; service_charges_usd: number; billed_calls: number; tracking_since: string | null };
type Row = { id: string; created_at: string; service: string; feature: string | null; model: string | null; status: string;
  actual_cost_usd: number; service_charge_usd: number; user_label: string };

const ngn = (n: number | null | undefined) => `₦${Number(n ?? 0).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;
const usd = (n: number | null | undefined, d = 2) => `$${Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}`;
const usdFine = (n: number) => `$${Number(n).toFixed(4)}`;
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
        <Stat label="Actual API expenditure" value={usd(s.actual_spend_usd)} />
        <Stat label="Remaining OpenAI balance" value={usd(s.remaining_actual_usd)} />
        <Stat label="Internal AI service charges" value={usd(s.service_charges_usd)} />
      </section>

      <section aria-label="Service records" className="space-y-3">
        <h2 className="font-heading text-base font-semibold">Service records</h2>
        {s.services.map(sv => (
          <div key={sv.service_key} className="rounded-lg bg-card p-4 card-shadow">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-medium">{sv.service_name}</h3>
              {sv.currency === 'USD' && <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium">{sv.payment_status}</span>}
            </div>
            {sv.currency === 'NGN' ? (
              <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <Fact label="Monthly allocation" value={ngn(sv.monthly_allocation)} />
                <Fact label="Billing period" value={`${sv.billing_months} months`} />
                <Fact label="Annual allocation" value={ngn(sv.annual_allocation)} />
                <Fact label="Actual amount paid" value={ngn(sv.actual_amount_paid)} />
              </dl>
            ) : (
              <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <Fact label="Funded amount" value={usd(sv.funded_balance)} />
                <Fact label="Remaining balance" value={usd(s.remaining_actual_usd)} />
              </dl>
            )}
          </div>
        ))}
      </section>

      <section aria-label="AI usage" className="space-y-3">
        <h2 className="font-heading text-base font-semibold">AI usage</h2>
        <div className="overflow-x-auto rounded-lg bg-card card-shadow">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="p-3 font-medium">Date and time</th><th className="p-3 font-medium">Service</th><th className="p-3 font-medium">User</th>
                <th className="p-3 text-right font-medium">Actual cost</th><th className="p-3 text-right font-medium">Service charge</th><th className="p-3 font-medium">Status</th>
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
                  <td className="p-3 text-right tabular-nums">{usdFine(r.actual_cost_usd)}</td>
                  <td className="p-3 text-right tabular-nums">{usdFine(r.service_charge_usd)}</td>
                  <td className="p-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${r.status === 'succeeded' ? 'bg-green-500/10 text-green-700 dark:text-green-400' : 'bg-destructive/10 text-destructive'}`}>
                      {r.status === 'succeeded' ? 'Succeeded' : 'Failed'}
                    </span>
                  </td>
                </tr>
              ))}
              {!ledger.isLoading && !ledger.data?.rows.length && (
                <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No AI requests recorded yet. They appear here as soon as an AI feature is used.</td></tr>
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

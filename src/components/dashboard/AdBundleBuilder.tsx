import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { formatNaira } from '@/lib/format';
import type { CatalogPlan } from '@/lib/planFeatures';

type Platform = { platform: string; label: string; price_per_day_kobo: number; min_days: number; est_views_low: number | null; est_views_high: number | null; note: string | null };
type Options = {
  enabled: boolean; platforms: Platform[];
  tier_caps: { plan_slug: string; platform: string; max_days_per_month: number }[];
  durations: { plan_slug: string; months: number; service_kobo: number }[];
};
type Quote = { error?: string; service_kobo?: number; ads_kobo?: number; total_kobo?: number; credit_kobo?: number; payable_kobo?: number; kind?: string; lines?: { platform: string; label: string; days_per_month: number; days: number; price_per_day_kobo: number; line_kobo: number }[] };

const naira = (kobo: number) => formatNaira(kobo / 100);
const MONTHS = [1, 3, 6, 12];

export default function AdBundleBuilder({ vendorId }: { vendorId: string }) {
  const [plan, setPlan] = useState('');
  const [months, setMonths] = useState(3);
  const [sel, setSel] = useState<Record<string, number>>({}); // platform -> ad days per month (absent = not chosen)
  const [paying, setPaying] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: options } = useQuery({
    queryKey: ['ad-bundle-options'],
    queryFn: async () => { const { data, error } = await (supabase as any).rpc('get_ad_bundle_options'); if (error) throw error; return data as Options; },
  });
  const { data: catalog = [] } = useQuery({
    queryKey: ['plan-catalog'],
    queryFn: async () => { const { data, error } = await (supabase as any).rpc('plan_catalog'); if (error) throw error; return (data ?? []) as CatalogPlan[]; },
  });
  const { data: membership } = useQuery({
    queryKey: ['supplier-membership', vendorId],
    queryFn: async () => (await supabase.from('vendor_memberships').select('plan_slug, status, expires_at').eq('vendor_id', vendorId).maybeSingle()).data,
  });
  const { data: allocations = [] } = useQuery({
    queryKey: ['my-ad-allocations', vendorId],
    queryFn: async () => ((await (supabase as any).from('vendor_ad_allocations').select('*').eq('vendor_id', vendorId).order('expires_at', { ascending: false })).data ?? []) as any[],
  });

  // Come back from Paystack: confirm the payment.
  useEffect(() => {
    const reference = searchParams.get('reference') || searchParams.get('trxref');
    if (!reference || verifying) return;
    setVerifying(true);
    supabase.functions.invoke('verify-supplier-subscription', { body: { reference } }).then(({ data, error }) => {
      if (error || !data?.success) { toast.error(data?.error || 'Payment is not confirmed yet. Your plan will update after Paystack confirms it.'); return; }
      toast.success('Subscription activated');
      qc.invalidateQueries({ queryKey: ['supplier-membership', vendorId] });
      qc.invalidateQueries({ queryKey: ['my-ad-allocations', vendorId] });
      qc.invalidateQueries({ queryKey: ['supplier-effective-plan', vendorId] });
    }).finally(() => {
      const next = new URLSearchParams(searchParams); next.delete('reference'); next.delete('trxref');
      navigate({ search: next.toString() }, { replace: true });
    });
  }, [searchParams, verifying, vendorId, navigate, qc]);

  const tiers = useMemo(() => {
    const slugs = Array.from(new Set((options?.durations ?? []).map(d => d.plan_slug)));
    return slugs.map(slug => ({ slug, name: catalog.find(c => c.slug === slug)?.name ?? slug, product_limit: (catalog.find(c => c.slug === slug) as any)?.product_limit ?? null }));
  }, [options, catalog]);
  useEffect(() => { if (!plan && tiers.length) setPlan(tiers[0].slug); }, [tiers, plan]);

  const caps = useMemo(() => Object.fromEntries((options?.tier_caps ?? []).filter(c => c.plan_slug === plan).map(c => [c.platform, c.max_days_per_month])), [options, plan]);
  const offered = (options?.durations ?? []).filter(d => d.plan_slug === plan).map(d => d.months);
  useEffect(() => { if (offered.length && !offered.includes(months)) setMonths(offered[0]); }, [plan, offered.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setSel(prev => Object.fromEntries(Object.entries(prev).filter(([p, d]) => caps[p] && d <= caps[p]))); }, [plan]); // eslint-disable-line react-hooks/exhaustive-deps

  const selections = Object.entries(sel).map(([platform, days_per_month]) => ({ platform, days_per_month }));
  const { data: quote } = useQuery({
    queryKey: ['ad-bundle-quote', plan, months, JSON.stringify(selections)],
    enabled: !!plan,
    queryFn: async () => { const { data, error } = await (supabase as any).rpc('my_ad_bundle_quote', { _plan: plan, _months: months, _selections: selections }); if (error) throw error; return data as Quote; },
  });

  const pay = async () => {
    setPaying(true);
    const { data, error } = await supabase.functions.invoke('initialize-ad-bundle-subscription', { body: { planSlug: plan, months, selections } });
    if (error || !data?.authorization_url) { toast.error(data?.error || 'Could not start the payment'); setPaying(false); return; }
    window.location.assign(data.authorization_url);
  };

  if (!options) return <p className="text-sm text-muted-foreground">Loading plans...</p>;
  const expiry = membership?.expires_at ? new Date(membership.expires_at) : null;
  const active = allocations.filter(a => new Date(a.expires_at) > new Date());

  return (
    <div className="space-y-5">
      <section>
        <h2 className="font-heading text-xl font-bold">Membership</h2>
        <p className="mt-1 text-sm text-muted-foreground">Pay once. Your plan and the advertising you choose run for the whole period. We manage the ads for you.</p>
        {expiry && membership?.plan_slug !== 'free' && <p className="mt-1 text-sm text-muted-foreground">Current plan ends {expiry.toLocaleDateString()}.</p>}
      </section>

      {active.length > 0 && (
        <section className="rounded-2xl border border-border bg-card p-4">
          <h3 className="font-heading text-sm font-semibold">Your advertising</h3>
          <ul className="mt-2 space-y-1 text-sm">
            {active.map(a => (
              <li key={a.id} className="flex flex-wrap justify-between gap-2">
                <span className="capitalize">{a.platform === 'meta' ? 'Facebook and Instagram' : a.platform}: {a.days_per_month} days a month</span>
                <span className="text-muted-foreground">{a.days_used} of {a.days_total} days used, until {new Date(a.expires_at).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-2xl border border-border bg-card p-4">
        <h3 className="font-heading text-sm font-semibold">1. Choose a plan</h3>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {tiers.map(t => (
            <button key={t.slug} type="button" onClick={() => setPlan(t.slug)}
              className={`rounded-xl border p-3 text-left ${plan === t.slug ? 'border-accent ring-1 ring-accent' : 'border-border'}`}>
              <p className="font-semibold">{t.name}</p>
              <p className="text-xs text-muted-foreground">{t.product_limit ? `Up to ${t.product_limit} products` : 'More products'}</p>
            </button>
          ))}
        </div>
        <h3 className="mt-5 font-heading text-sm font-semibold">2. How long?</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          {MONTHS.filter(m => offered.includes(m)).map(m => (
            <Button key={m} type="button" size="sm" variant={months === m ? 'default' : 'outline'} onClick={() => setMonths(m)}>{m} {m === 1 ? 'month' : 'months'}</Button>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-4">
        <h3 className="font-heading text-sm font-semibold">3. Choose where we advertise you</h3>
        <p className="mt-1 text-xs text-muted-foreground">Pick the days each month your ad runs on each platform. Reach figures are estimates, not guarantees.</p>
        <div className="mt-3 space-y-3">
          {options.platforms.map(p => {
            const cap = caps[p.platform] ?? 0;
            const chosen = sel[p.platform] != null;
            return (
              <div key={p.platform} className={`rounded-xl border p-3 ${cap ? 'border-border' : 'border-border opacity-50'}`}>
                <label className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2">
                    <input type="checkbox" disabled={!cap} checked={chosen}
                      onChange={e => setSel(s => { const n = { ...s }; if (e.target.checked) n[p.platform] = Math.max(p.min_days, 1); else delete n[p.platform]; return n; })} />
                    <span className="text-sm font-medium">{p.label}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">{cap ? `${naira(p.price_per_day_kobo)} per ad day` : 'Not in this plan'}</span>
                </label>
                {cap > 0 && p.est_views_low != null && p.est_views_high != null && (
                  <p className="mt-1 text-xs text-muted-foreground">About {p.est_views_low} to {p.est_views_high} views per ad day (estimate)</p>
                )}
                {chosen && (
                  <div className="mt-2 flex items-center gap-2 text-sm">
                    <input type="number" min={p.min_days} max={cap} value={sel[p.platform]}
                      onChange={e => { const v = Math.min(cap, Math.max(p.min_days, Number(e.target.value) || p.min_days)); setSel(s => ({ ...s, [p.platform]: v })); }}
                      className="h-9 w-20 rounded-lg border border-input bg-background px-2" />
                    <span>days a month (up to {cap}), {sel[p.platform] * months} days in total</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-4">
        <h3 className="font-heading text-sm font-semibold">Your plan cost</h3>
        {quote && !quote.error ? (
          <>
            <ul className="mt-2 space-y-1 text-sm">
              <li className="flex justify-between"><span>{tiers.find(t => t.slug === plan)?.name} plan, {months} {months === 1 ? 'month' : 'months'}</span><span>{naira(quote.service_kobo ?? 0)}</span></li>
              {quote.lines?.map(l => (
                <li key={l.platform} className="flex justify-between"><span>{l.label}: {l.days} ad days ({l.days_per_month} a month x {naira(l.price_per_day_kobo)})</span><span>{naira(l.line_kobo)}</span></li>
              ))}
              {(quote.credit_kobo ?? 0) > 0 && (
                <li className="flex justify-between text-green-600"><span>Credit for the unused time on your current plan</span><span>-{naira(quote.credit_kobo ?? 0)}</span></li>
              )}
              <li className="flex justify-between border-t border-border pt-2 font-heading text-base font-bold"><span>Total, paid once</span><span>{naira(quote.payable_kobo ?? quote.total_kobo ?? 0)}</span></li>
            </ul>
            <Button className="mt-4 w-full" disabled={paying} onClick={pay}>{paying ? <Loader2 className="h-4 w-4 animate-spin" /> : `Pay ${naira(quote.payable_kobo ?? quote.total_kobo ?? 0)}`}</Button>
          </>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">{quote?.error === 'downgrade_not_allowed' ? 'You cannot move to a lower plan while your current plan is active. You can choose it after it ends.' : quote?.error === 'days_out_of_range' ? 'Check the ad days you chose.' : 'Choose a plan and duration to see the cost.'}</p>
        )}
      </section>
    </div>
  );
}

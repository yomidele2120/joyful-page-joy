import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { planFeatureGroups, type CatalogPlan } from '@/lib/planFeatures';

// Seller plans for the public pages (landing, marketplace home, /sell). Everything is read live from the database, so the page can
// never show a price or a plan the admin did not set: plans from supplier_membership_plans, prices from plan_prices.
// Prices can differ by category. The "all categories" price is shown when there is one; otherwise the lowest price, marked "from".

const SIGN = { fontFamily: '"Big Shoulders Display", "Space Grotesk", system-ui, sans-serif' } as const;
const db = supabase as any;

type Period = 'monthly' | 'annual';
interface PlanRow { slug: string; name: string; price_kobo: number | null; period_days: number | null; visibility_boost: number; purchase_enabled: boolean; ad_credit_kobo?: number | null; sort_order?: number | null }
interface PriceRow { plan_slug: string; billing_period: Period; category_id: string | null; price_kobo: number }

const naira = (kobo: number) => `₦${Math.round(kobo / 100).toLocaleString('en-NG')}`;

function usePublicPlans() {
  return useQuery({
    queryKey: ['public-plans-and-prices'], staleTime: 5 * 60_000,
    queryFn: async () => {
      const [p, pr, cat] = await Promise.all([
        db.from('supplier_membership_plans').select('slug, name, price_kobo, period_days, visibility_boost, purchase_enabled, ad_credit_kobo, sort_order').eq('is_active', true),
        db.from('plan_prices').select('plan_slug, billing_period, category_id, price_kobo').eq('is_active', true),
        db.rpc('plan_catalog'),   // the same full list of limits the seller dashboard shows
      ]);
      if (p.error) throw p.error;
      const order = ['free', 'silver', 'premium', 'gold', 'diamond'];
      const plans = ((p.data ?? []) as PlanRow[]).sort((a, b) =>
        a.slug === 'free' ? -1 : b.slug === 'free' ? 1 : (a.sort_order ?? 0) - (b.sort_order ?? 0) || order.indexOf(a.slug) - order.indexOf(b.slug));
      const catalog: Record<string, CatalogPlan> = {};
      for (const c of ((cat.error ? [] : (cat.data ?? [])) as CatalogPlan[])) catalog[c.slug] = c;
      return { plans, prices: (pr.error ? [] : (pr.data ?? [])) as PriceRow[], catalog };
    },
  });
}

function priceFor(plan: PlanRow, prices: PriceRow[], period: Period): { big: string; small: string } | null {
  if (plan.slug === 'free') return { big: 'Free', small: 'to open a shop' };
  const rows = prices.filter(r => r.plan_slug === plan.slug && r.billing_period === period);
  const unit = period === 'annual' ? 'per year' : 'per month';
  const all = rows.find(r => r.category_id === null);
  if (all) return { big: naira(all.price_kobo), small: unit };
  if (rows.length) return { big: `from ${naira(Math.min(...rows.map(r => r.price_kobo)))}`, small: `${unit}, depends on your category` };
  // Older single price on the plan itself (monthly style), used only when no plan_prices row exists at all for this plan.
  if (!prices.some(r => r.plan_slug === plan.slug) && plan.price_kobo && plan.purchase_enabled && period === 'monthly')
    return { big: naira(plan.price_kobo), small: plan.period_days ? `every ${plan.period_days} days` : '' };
  return null;
}

export default function PlansSection({ id, heading = 'Plans for sellers', intro, dark = false }: { id?: string; heading?: string; intro?: string; dark?: boolean }) {
  const { isVendor } = useAuth();
  const { data } = usePublicPlans();
  const [period, setPeriod] = useState<Period>('monthly');
  const hasPeriod = useMemo(() => ({
    monthly: !!data?.prices.some(r => r.billing_period === 'monthly'),
    annual: !!data?.prices.some(r => r.billing_period === 'annual'),
  }), [data]);
  const shown: Period = hasPeriod[period] ? period : hasPeriod.monthly ? 'monthly' : hasPeriod.annual ? 'annual' : period;

  if (!data || data.plans.length === 0) return null;
  const cta = isVendor ? { to: '/supplier-dashboard', label: 'Go to my shop' } : { to: '/supplier-signup', label: 'Open your shop' };
  const cols = data.plans.length >= 4 ? 'lg:grid-cols-4' : data.plans.length === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-2';

  return (
    <section id={id} className="container max-w-[1200px] py-14 sm:py-20">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 style={SIGN} className="text-4xl font-extrabold uppercase leading-[0.95] sm:text-5xl">{heading}</h2>
          <p className="mt-3 max-w-xl text-muted-foreground">{intro ?? 'Start free. Paid plans rank your products higher in search and listings and include homepage advertising. Prices are set by IT Hub Africa and shown as they are today.'}</p>
        </div>
        {hasPeriod.monthly && hasPeriod.annual && (
          <div role="group" aria-label="Billing period" className="inline-flex shrink-0 rounded-full border border-border p-1 text-sm font-semibold">
            {(['monthly', 'annual'] as Period[]).map(p => (
              <button key={p} type="button" onClick={() => setPeriod(p)} aria-pressed={shown === p}
                className={`rounded-full px-4 py-1.5 transition-colors ${shown === p ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'}`}>
                {p === 'monthly' ? 'Monthly' : 'Yearly'}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className={`mt-8 grid gap-4 sm:grid-cols-2 ${cols}`}>
        {data.plans.map(p => {
          const price = priceFor(p, data.prices, shown);
          const perks: string[] = p.slug === 'free'
            ? ['Shop page and product listings', 'Orders, chat and calls']
            : [
                'Everything in Free',
                ...(p.visibility_boost > 0 ? ['Ranking boost in search and listings'] : []),
                'Homepage advertising',
                ...((p.ad_credit_kobo ?? 0) > 0 ? [`${naira(p.ad_credit_kobo!)} advertising credit with each payment`] : []),
              ];
          return (
            <div key={p.slug} className={`flex flex-col rounded-2xl border p-6 ${dark ? 'border-white/15 bg-white/5' : 'border-border bg-card'}`}>
              <h3 className="font-heading text-lg font-semibold">{p.name}</h3>
              <p style={SIGN} className="mt-2 text-4xl font-extrabold leading-none sm:text-5xl">{price ? price.big : 'Soon'}</p>
              <p className="mt-1 min-h-[1.25rem] text-sm text-muted-foreground">{price ? price.small : 'price not announced yet'}</p>
              {data.catalog[p.slug] ? (
                <div className="mt-4 space-y-4 text-sm leading-relaxed">
                  {planFeatureGroups(data.catalog[p.slug]).map(g => (
                    <div key={g.title}>
                      <p className="text-xs font-semibold text-muted-foreground">{g.title}</p>
                      <ul className="mt-1 space-y-1">
                        {g.items.map(t => <li key={t} className="flex gap-2"><span aria-hidden className="mt-0.5 text-[#f26a1b]">✓</span><span>{t}</span></li>)}
                      </ul>
                    </div>
                  ))}
                </div>
              ) : (
                <ul className="mt-4 space-y-1.5 text-sm leading-relaxed">
                  {perks.map(t => <li key={t} className="flex gap-2"><span aria-hidden className="mt-0.5 text-[#f26a1b]">✓</span><span>{t}</span></li>)}
                </ul>
              )}
              <div className="flex-1" />
              <Link to={cta.to} className="mt-6 block rounded-md border border-foreground/30 px-4 py-2 text-center text-sm font-semibold transition-colors hover:bg-foreground hover:text-background">{cta.label}</Link>
            </div>
          );
        })}
      </div>
    </section>
  );
}

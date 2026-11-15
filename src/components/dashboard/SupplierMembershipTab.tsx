import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Crown, Gem, Loader2, Medal, Star, BadgeCheck } from 'lucide-react';
import { usePlanUsage } from '@/hooks/usePlanUsage';
import { planFeatureGroups, hoursText, type CatalogPlan } from '@/lib/planFeatures';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { formatNaira } from '@/lib/format';

type MembershipPlan = {
  slug: 'free' | 'silver' | 'premium' | 'gold' | 'diamond';
  name: string;
  product_limit: number | null;
  pinned_limit: number;
  renew_hours: number | null;
  price_kobo: number | null;
  period_days: number | null;
  visibility_boost: number;
  features: Record<string, boolean>;
  purchase_enabled: boolean;
};

type Quote = {
  kind: 'new' | 'renewal' | 'upgrade'; plan_slug: string; billing_period: 'annual' | 'monthly';
  list_price_kobo: number; credit_kobo: number; payable_kobo: number; period_days: number;
};

type Membership = {
  plan_slug: string;
  status: 'active' | 'suspended';
  expires_at: string | null;
};

export default function SupplierMembershipTab({ vendorId }: { vendorId: string }) {
  const [busyPlan, setBusyPlan] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: usage } = usePlanUsage();
  const [period, setPeriod] = useState<'annual' | 'monthly'>('annual');
  const [pickCat, setPickCat] = useState('');

  const { data: quotes = [] } = useQuery({
    queryKey: ['my-subscription-quotes', vendorId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('my_subscription_quotes');
      if (error) throw error;
      return (data ?? []) as Quote[];
    },
  });
  const { data: pricingCat } = useQuery({
    queryKey: ['vendor-pricing-category', vendorId],
    queryFn: async () => {
      const { data } = await (supabase as any).from('vendors').select('pricing_category_id').eq('id', vendorId).maybeSingle();
      return (data?.pricing_category_id ?? null) as string | null;
    },
  });
  const { data: categories = [] } = useQuery({
    queryKey: ['main-categories'],
    queryFn: async () => {
      const { data } = await supabase.from('categories').select('id, name').is('parent_id', null).order('name');
      return (data ?? []) as { id: string; name: string }[];
    },
  });
  const { data: history = [] } = useQuery({
    queryKey: ['my-subscription-payments', vendorId],
    queryFn: async () => {
      const { data } = await (supabase as any).from('supplier_membership_payments')
        .select('id, plan_slug, amount_kobo, status, kind, billing_period, created_at')
        .eq('vendor_id', vendorId).order('created_at', { ascending: false }).limit(20);
      return (data ?? []) as any[];
    },
  });
  const { data: wallet } = useQuery<any>({
    queryKey: ['my-ad-wallet'],
    queryFn: async () => { const { data } = await (supabase as any).rpc('my_ad_wallet'); return data; },
  });
  const saveCategory = async () => {
    const { error } = await (supabase as any).rpc('set_my_pricing_category', { _category: pickCat });
    if (error) { toast.error(error.message); return; }
    toast.success('Category saved');
    queryClient.invalidateQueries({ queryKey: ['vendor-pricing-category', vendorId] });
    queryClient.invalidateQueries({ queryKey: ['my-subscription-quotes', vendorId] });
  };

  const { data: plans = [], isLoading: plansLoading } = useQuery({
    queryKey: ['plan-catalog'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('plan_catalog');
      if (error) throw error;
      return (data ?? []) as CatalogPlan[];
    },
  });
  const { data: membership } = useQuery({
    queryKey: ['supplier-membership', vendorId],
    queryFn: async () => {
      const { data, error } = await supabase.from('vendor_memberships')
        .select('plan_slug, status, expires_at').eq('vendor_id', vendorId).maybeSingle();
      if (error) throw error;
      return data as Membership | null;
    },
  });
  const { data: effectivePlan } = useQuery({
    queryKey: ['supplier-effective-plan', vendorId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('effective_supplier_plan', { _vendor_id: vendorId });
      if (error) throw error;
      return data as string;
    },
  });

  useEffect(() => {
    const reference = searchParams.get('reference') || searchParams.get('trxref');
    if (!reference || verifying) return;
    setVerifying(true);
    supabase.functions.invoke('verify-supplier-subscription', { body: { reference } }).then(({ data, error }) => {
      if (error || !data?.success) {
        toast.error(data?.error || 'Payment is not confirmed yet. Your membership will update after Paystack confirms it.');
        return;
      }
      toast.success('Membership activated');
      queryClient.invalidateQueries({ queryKey: ['supplier-membership', vendorId] });
      queryClient.invalidateQueries({ queryKey: ['supplier-effective-plan', vendorId] });
    }).finally(() => {
      const next = new URLSearchParams(searchParams);
      next.delete('reference');
      next.delete('trxref');
      navigate({ search: next.toString() }, { replace: true });
    });
  }, [searchParams, verifying, vendorId, navigate, queryClient]);

  const beginCheckout = async (plan: CatalogPlan) => {
    setBusyPlan(plan.slug);
    const { data, error } = await supabase.functions.invoke('initialize-supplier-subscription', {
      body: { planSlug: plan.slug, billingPeriod: period },
    });
    if (error || !data?.authorization_url) {
      toast.error(data?.error || 'Could not start membership checkout');
      setBusyPlan(null);
      return;
    }
    window.location.assign(data.authorization_url);
  };

  if (plansLoading) return <p className="text-sm text-muted-foreground">Loading membership plans...</p>;

  const currentPlan = effectivePlan ?? 'free';
  const expiry = membership?.expires_at ? new Date(membership.expires_at) : null;
  const ICONS = { free: BadgeCheck, silver: Medal, premium: Crown, gold: Star, diamond: Gem } as const;
  const pct = (used: number, limit: number | null) => (limit ? Math.min(100, Math.round((used / limit) * 100)) : 0);

  return (
    <div className="space-y-5">
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-heading text-xl font-bold">Membership</h2>
          <p className="mt-1 text-sm text-muted-foreground">Your current plan is {currentPlan[0]?.toUpperCase()}{currentPlan.slice(1)}.</p>
        </div>
        {expiry && currentPlan !== 'free' && (
          <p className="text-sm text-muted-foreground">Renews or expires {expiry.toLocaleDateString()}</p>
        )}
      </section>

      {usage && (
        <section className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">Products</p>
            <p className="font-heading text-lg font-bold">{usage.product_count}{usage.product_limit != null ? ` / ${usage.product_limit}` : ''}</p>
            {usage.product_limit != null
              ? <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary"><div className={`h-full rounded-full ${pct(usage.product_count, usage.product_limit) >= 100 ? 'bg-destructive' : 'bg-accent'}`} style={{ width: `${pct(usage.product_count, usage.product_limit)}%` }} /></div>
              : <p className="text-xs text-muted-foreground">No limit</p>}
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Pinned to the top</p>
            <p className="font-heading text-lg font-bold">{usage.pinned_count} / {usage.pinned_limit}</p>
            <p className="text-xs text-muted-foreground">{usage.pinned_limit ? 'Pin products from your product list' : 'Not on this plan'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Listings moved to the top</p>
            <p className="font-heading text-lg font-bold">{usage.renew_hours ? `Every ${hoursText(usage.renew_hours)}` : 'Not on this plan'}</p>
          </div>
        </section>
      )}

      {wallet && (
        <p className="text-sm text-muted-foreground">Ad credit balance: <span className="font-semibold text-foreground">{formatNaira(Number(wallet.balance_kobo ?? wallet.balance ?? 0) / (wallet.balance_kobo != null ? 100 : 1))}</span></p>
      )}

      {!pricingCat && categories.length > 0 && (
        <section className="rounded-2xl border border-border bg-card p-4">
          <h3 className="font-heading text-sm font-semibold">What do you mainly sell?</h3>
          <p className="mt-1 text-xs text-muted-foreground">Plan prices can depend on your main category. You can set this once; contact support to change it later.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <select value={pickCat} onChange={e => setPickCat(e.target.value)} className="h-10 rounded-xl border border-input bg-background px-3 text-sm">
              <option value="">Choose a category</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <Button className="rounded-xl" disabled={!pickCat} onClick={saveCategory}>Save category</Button>
          </div>
        </section>
      )}

      <div className="inline-flex rounded-xl border border-border bg-card p-1 text-sm" role="group" aria-label="Billing period">
        {(['annual', 'monthly'] as const).map(p => (
          <button key={p} type="button" aria-pressed={period === p} onClick={() => setPeriod(p)}
            className={`rounded-lg px-4 py-1.5 font-medium ${period === p ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>
            {p === 'annual' ? 'Yearly' : 'Monthly'}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {plans.map(plan => {
          const isCurrent = currentPlan === plan.slug;
          const quote = quotes.find(q => q.plan_slug === plan.slug && q.billing_period === period);
          const isPurchasable = plan.slug !== 'free' && !!quote;
          const Icon = (ICONS as Record<string, typeof BadgeCheck>)[plan.slug] ?? BadgeCheck;
          return (
            <section key={plan.slug} className={`flex flex-col rounded-2xl border bg-card p-4 ${isCurrent ? 'border-accent ring-1 ring-accent/40' : 'border-border'}`}>
              <div className="flex items-center justify-between gap-3">
                <h3 className="flex items-center gap-2 font-heading text-lg font-semibold"><Icon className="h-4 w-4 text-accent" aria-hidden="true" />{plan.name}</h3>
                {isCurrent && <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-semibold text-accent">Your plan</span>}
              </div>
              <p className="mt-2 text-2xl font-bold">
                {plan.slug === 'free' ? 'Free' : quote ? formatNaira(quote.list_price_kobo / 100) : 'Not available'}
                {quote && <span className="ml-1 text-sm font-normal text-muted-foreground">/{period === 'annual' ? 'year' : 'month'}</span>}
              </p>
              {quote && quote.credit_kobo > 0 && (
                <p className="text-xs text-emerald-700">Upgrade credit {formatNaira(quote.credit_kobo / 100)} for your unused time. You pay {formatNaira(quote.payable_kobo / 100)}.</p>
              )}
              <div className="my-4 flex-1 space-y-3">
                {planFeatureGroups(plan).map(g => (
                  <div key={g.title}>
                    <p className="text-xs font-semibold text-muted-foreground">{g.title}</p>
                    <ul className="mt-1 space-y-1 text-sm">
                      {g.items.map(t => (
                        <li key={t} className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" /><span>{t}</span></li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              <Button
                className="w-full rounded-xl"
                variant={isCurrent && !isPurchasable ? 'outline' : 'cta'}
                disabled={!isPurchasable || busyPlan !== null}
                onClick={() => beginCheckout(plan)}
              >
                {busyPlan === plan.slug ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {isCurrent ? (quote ? 'Renew plan' : 'Current plan') : isPurchasable ? (quote?.kind === 'upgrade' ? 'Upgrade' : 'Choose plan') : 'Unavailable'}
              </Button>
            </section>
          );
        })}
      </div>
      {history.length > 0 && (
        <section className="rounded-2xl border border-border bg-card p-4">
          <h3 className="font-heading text-sm font-semibold">Payment history</h3>
          <ul className="mt-2 divide-y divide-border text-sm">
            {history.map(h => (
              <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="capitalize">{h.plan_slug} {h.kind ?? ''} {h.billing_period ? `(${h.billing_period})` : ''}</span>
                <span className="text-muted-foreground">{new Date(h.created_at).toLocaleDateString()}</span>
                <span className="font-medium">{formatNaira(Number(h.amount_kobo ?? 0) / 100)} · {h.status}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {verifying && <p role="status" className="text-sm text-muted-foreground">Confirming your payment...</p>}
      {membership?.status === 'suspended' && <p className="text-sm text-destructive">Membership benefits are paused. Contact marketplace support.</p>}
    </div>
  );
}

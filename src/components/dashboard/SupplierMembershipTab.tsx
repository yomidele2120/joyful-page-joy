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
      body: { planSlug: plan.slug },
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

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {plans.map(plan => {
          const isCurrent = currentPlan === plan.slug;
          const isPurchasable = plan.slug !== 'free' && plan.purchase_enabled && Number(plan.price_kobo) > 0;
          const Icon = (ICONS as Record<string, typeof BadgeCheck>)[plan.slug] ?? BadgeCheck;
          return (
            <section key={plan.slug} className={`flex flex-col rounded-2xl border bg-card p-4 ${isCurrent ? 'border-accent ring-1 ring-accent/40' : 'border-border'}`}>
              <div className="flex items-center justify-between gap-3">
                <h3 className="flex items-center gap-2 font-heading text-lg font-semibold"><Icon className="h-4 w-4 text-accent" aria-hidden="true" />{plan.name}</h3>
                {isCurrent && <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-semibold text-accent">Your plan</span>}
              </div>
              <p className="mt-2 text-2xl font-bold">
                {plan.price_kobo === null ? 'Price pending' : plan.price_kobo === 0 ? 'Free' : formatNaira(plan.price_kobo / 100)}
                {plan.period_days && <span className="ml-1 text-sm font-normal text-muted-foreground">/{plan.period_days} days</span>}
              </p>
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
                variant={isCurrent ? 'outline' : 'cta'}
                disabled={isCurrent || !isPurchasable || busyPlan !== null}
                onClick={() => beginCheckout(plan)}
              >
                {busyPlan === plan.slug ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {isCurrent ? 'Current plan' : isPurchasable ? 'Choose plan' : 'Unavailable'}
              </Button>
            </section>
          );
        })}
      </div>
      {verifying && <p role="status" className="text-sm text-muted-foreground">Confirming your payment...</p>}
      {membership?.status === 'suspended' && <p className="text-sm text-destructive">Membership benefits are paused. Contact marketplace support.</p>}
    </div>
  );
}

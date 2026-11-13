import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Crown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { formatNaira } from '@/lib/format';

type MembershipPlan = {
  slug: 'free' | 'silver' | 'premium';
  name: string;
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

  const { data: plans = [], isLoading: plansLoading } = useQuery({
    queryKey: ['supplier-membership-plans'],
    queryFn: async () => {
      const { data, error } = await supabase.from('supplier_membership_plans')
        .select('slug, name, price_kobo, period_days, visibility_boost, features, purchase_enabled')
        .eq('is_active', true)
        .order('visibility_boost');
      if (error) throw error;
      return (data ?? []) as MembershipPlan[];
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

  const beginCheckout = async (plan: MembershipPlan) => {
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

  return (
    <div className="space-y-5">
      <section className="flex flex-wrap items-start justify-between gap-4 border-b pb-5">
        <div>
          <h2 className="font-heading text-xl font-bold">Supplier membership</h2>
          <p className="mt-1 text-sm text-muted-foreground">Your current tier is {currentPlan[0]?.toUpperCase()}{currentPlan.slice(1)}.</p>
        </div>
        {expiry && currentPlan !== 'free' && (
          <p className="text-sm text-muted-foreground">Renews or expires {expiry.toLocaleDateString()}</p>
        )}
      </section>

      <div className="grid gap-3 md:grid-cols-3">
        {plans.map(plan => {
          const isCurrent = currentPlan === plan.slug;
          const isPurchasable = plan.slug !== 'free' && plan.purchase_enabled && Number(plan.price_kobo) > 0;
          return (
            <section key={plan.slug} className={`flex min-h-64 flex-col border p-4 ${isCurrent ? 'border-primary' : 'border-border'}`}>
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-heading text-lg font-semibold">{plan.name}</h3>
                {plan.slug === 'premium' && <Crown className="h-4 w-4 text-primary" aria-label="Premium" />}
              </div>
              <p className="mt-2 text-2xl font-bold">
                {plan.price_kobo === null ? 'Price pending' : plan.price_kobo === 0 ? 'Free' : formatNaira(plan.price_kobo / 100)}
                {plan.period_days && <span className="ml-1 text-sm font-normal text-muted-foreground">/{plan.period_days} days</span>}
              </p>
              <div className="my-4 flex-1" />
              <Button
                className="w-full"
                variant={isCurrent ? 'outline' : 'default'}
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
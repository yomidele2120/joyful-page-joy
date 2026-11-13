import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { formatNaira } from '@/lib/format';

type Plan = {
  slug: string;
  name: string;
  price_kobo: number | null;
  period_days: number | null;
  visibility_boost: number;
  is_active: boolean;
  purchase_enabled: boolean;
};

type Membership = {
  vendor_id: string;
  plan_slug: string;
  status: 'active' | 'suspended';
  expires_at: string | null;
  vendors: { store_name: string } | null;
};

type RankingWeights = {
  id: boolean;
  ranking_enabled: boolean;
  subscription_boost: number;
  availability_boost: number;
  recency_boost: number;
  popularity_boost: number;
  review_boost: number;
};

export default function SupplierPlansTab() {
  const queryClient = useQueryClient();
  const { data: plans = [], isLoading: plansLoading, isError: plansError } = useQuery({
    queryKey: ['admin-supplier-plans'],
    queryFn: async () => {
      const { data, error } = await supabase.from('supplier_membership_plans').select('*').order('visibility_boost');
      if (error) throw error;
      return data as Plan[];
    },
  });
  const { data: memberships = [], isLoading: membershipsLoading, isError: membershipsError } = useQuery({
    queryKey: ['admin-vendor-memberships'],
    queryFn: async () => {
      const { data, error } = await supabase.from('vendor_memberships')
        .select('vendor_id, plan_slug, status, expires_at, vendors(store_name)')
        .order('updated_at', { ascending: false }).limit(100);
      if (error) throw error;
      return data as Membership[];
    },
  });
  const { data: rankingWeights, isLoading: rankingWeightsLoading } = useQuery({
    queryKey: ['marketplace-ranking-weights'],
    queryFn: async () => {
      const { data, error } = await supabase.from('marketplace_ranking_weights').select('*').maybeSingle();
      if (error) throw error;
      return (data ?? {
        id: true,
        ranking_enabled: false,
        subscription_boost: 10,
        availability_boost: 5,
        recency_boost: 5,
        popularity_boost: 5,
        review_boost: 5,
      }) as RankingWeights;
    },
  });

  const updateWeights = async (changes: Partial<RankingWeights>) => {
    const payload = { ...changes, updated_at: new Date().toISOString() };
    const { error } = await supabase.from('marketplace_ranking_weights').upsert(payload, { onConflict: 'id' });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Ranking weights saved');
    queryClient.invalidateQueries({ queryKey: ['marketplace-ranking-weights'] });
  };

  const updatePlan = async (slug: string, changes: Partial<Plan>) => {
    if (changes.purchase_enabled && slug !== 'free') {
      const plan = plans.find(item => item.slug === slug);
      const price = changes.price_kobo ?? plan?.price_kobo;
      const days = changes.period_days ?? plan?.period_days;
      if (!(Number(price) > 0) || !(Number(days) > 0)) {
        toast.error('Set a price and billing period before enabling checkout');
        return;
      }
    }
    const { error } = await supabase.from('supplier_membership_plans').update(changes).eq('slug', slug);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Plan saved');
    queryClient.invalidateQueries({ queryKey: ['admin-supplier-plans'] });
    queryClient.invalidateQueries({ queryKey: ['supplier-membership-plans'] });
  };

  const setMembershipStatus = async (vendorId: string, status: Membership['status']) => {
    const { error } = await supabase.from('vendor_memberships').update({ status }).eq('vendor_id', vendorId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(status === 'active' ? 'Membership restored' : 'Membership suspended');
    queryClient.invalidateQueries({ queryKey: ['admin-vendor-memberships'] });
    queryClient.invalidateQueries({ queryKey: ['supplier-membership', vendorId] });
    queryClient.invalidateQueries({ queryKey: ['supplier-effective-plan', vendorId] });
  };

  if (plansLoading || membershipsLoading || rankingWeightsLoading) return <p className="text-sm text-muted-foreground">Loading supplier plans...</p>;
  if (plansError || membershipsError) return (
    <p className="text-sm text-destructive">Could not load supplier memberships. Apply migration 20261112090000_supplier_memberships.sql and reload.</p>
  );

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div>
          <h2 className="font-heading text-lg font-semibold">Ranking and visibility controls</h2>
          <p className="text-sm text-muted-foreground">These weights are applied server-side and are intended to be reviewed before live ranking is enabled.</p>
        </div>
        {rankingWeights && (
          <RankingWeightPanel weights={rankingWeights} onSave={updateWeights} />
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="font-heading text-lg font-semibold">Supplier plan catalog</h2>
          <p className="text-sm text-muted-foreground">Paid checkout remains off until configured. Ranking weights are staged and do not affect search until ranking is deployed.</p>
        </div>
        <div className="divide-y border-y">
          {plans.map(plan => <PlanRow key={plan.slug} plan={plan} onSave={updatePlan} />)}
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="font-heading text-lg font-semibold">Active supplier memberships</h2>
          <p className="text-sm text-muted-foreground">Showing the 100 most recently changed memberships.</p>
        </div>
        {memberships.length === 0 ? <p className="text-sm text-muted-foreground">No paid memberships yet.</p> : (
          <div className="divide-y border-y">
            {memberships.map(item => (
              <div key={item.vendor_id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-medium">{item.vendors?.store_name ?? 'Supplier'}</p>
                  <p className="text-sm text-muted-foreground">
                    {item.plan_slug} · {item.expires_at ? `expires ${new Date(item.expires_at).toLocaleDateString()}` : 'no expiry'}
                  </p>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <span>{item.status === 'active' ? 'Active' : 'Suspended'}</span>
                  <Switch checked={item.status === 'active'} onCheckedChange={active => setMembershipStatus(item.vendor_id, active ? 'active' : 'suspended')} />
                </label>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function RankingWeightPanel({ weights, onSave }: { weights: RankingWeights; onSave: (changes: Partial<RankingWeights>) => Promise<void> }) {
  const [values, setValues] = useState(weights);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    await onSave({
      id: true,
      ranking_enabled: values.ranking_enabled,
      subscription_boost: Number(values.subscription_boost),
      availability_boost: Number(values.availability_boost),
      recency_boost: Number(values.recency_boost),
      popularity_boost: Number(values.popularity_boost),
      review_boost: Number(values.review_boost),
    });
    setSaving(false);
  };

  return (
    <div className="space-y-4 rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-medium">Marketplace ranking policy</p>
          <p className="text-xs text-muted-foreground">These values are staged, not a hard override of relevance.</p>
        </div>
        <label className="flex items-center gap-2 text-xs">
          <span>Ranking enabled</span>
          <Switch checked={values.ranking_enabled} onCheckedChange={(checked) => setValues({ ...values, ranking_enabled: checked })} />
        </label>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {[
          ['subscription_boost', 'Subscription boost'],
          ['availability_boost', 'Stock availability'],
          ['recency_boost', 'Freshness'],
          ['popularity_boost', 'Popularity'],
          ['review_boost', 'Review quality'],
        ].map(([key, label]) => (
          <label key={key} className="text-xs text-muted-foreground">
            {label}
            <Input
              type="number"
              min="0"
              max="100"
              step="0.25"
              className="mt-1"
              value={String(values[key as keyof RankingWeights] ?? 0)}
              onChange={(event) => setValues({ ...values, [key]: Number(event.target.value) })}
            />
          </label>
        ))}
      </div>
      <div className="flex justify-end">
        <Button size="sm" disabled={saving} onClick={save}>{saving ? 'Saving...' : 'Save ranking settings'}</Button>
      </div>
    </div>
  );
}

function PlanRow({ plan, onSave }: { plan: Plan; onSave: (slug: string, changes: Partial<Plan>) => Promise<void> }) {
  const [price, setPrice] = useState(plan.price_kobo == null ? '' : String(plan.price_kobo / 100));
  const [days, setDays] = useState(plan.period_days == null ? '' : String(plan.period_days));
  const [boost, setBoost] = useState(String(plan.visibility_boost));
  const [active, setActive] = useState(plan.is_active);
  const [purchaseEnabled, setPurchaseEnabled] = useState(plan.purchase_enabled);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const parsedPrice = price === '' ? null : Math.round(Number(price) * 100);
    const parsedDays = days === '' ? null : Math.floor(Number(days));
    const parsedBoost = Math.floor(Number(boost));
    if ((parsedPrice !== null && (!Number.isSafeInteger(parsedPrice) || parsedPrice < 0))
      || (parsedDays !== null && (parsedDays < 1 || parsedDays > 366))
      || (!Number.isInteger(parsedBoost) || parsedBoost < 0 || parsedBoost > 100)) {
      toast.error('Check the price, billing period, and visibility boost');
      return;
    }
    setSaving(true);
    await onSave(plan.slug, {
      price_kobo: parsedPrice,
      period_days: parsedDays,
      visibility_boost: parsedBoost,
      is_active: active,
      purchase_enabled: purchaseEnabled,
    });
    setSaving(false);
  };

  return (
    <div className="grid gap-3 py-4 md:grid-cols-[minmax(100px,1fr)_repeat(3,minmax(110px,150px))_auto_auto_auto] md:items-end">
      <div>
        <p className="font-medium">{plan.name}</p>
        <p className="text-xs text-muted-foreground">{plan.price_kobo ? formatNaira(plan.price_kobo / 100) : 'No price'}</p>
      </div>
      <label className="text-xs text-muted-foreground">Price (NGN)<Input type="number" min="0" step="0.01" className="mt-1" value={price} onChange={event => setPrice(event.target.value)} /></label>
      <label className="text-xs text-muted-foreground">Period (days)<Input type="number" min="1" max="366" className="mt-1" value={days} onChange={event => setDays(event.target.value)} disabled={plan.slug === 'free'} /></label>
      <label className="text-xs text-muted-foreground">Staged ranking weight<Input type="number" min="0" max="100" className="mt-1" value={boost} onChange={event => setBoost(event.target.value)} /></label>
      <label className="flex items-center gap-2 text-xs">Live<Switch checked={active} onCheckedChange={setActive} /></label>
      <label className="flex items-center gap-2 text-xs">Checkout<Switch checked={purchaseEnabled} onCheckedChange={setPurchaseEnabled} disabled={plan.slug === 'free'} /></label>
      <Button size="sm" disabled={saving} onClick={save}>{saving ? 'Saving...' : 'Save'}</Button>
    </div>
  );
}
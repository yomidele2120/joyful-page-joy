import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { formatNaira } from '@/lib/format';

type PlanQuota = { plan_slug: 'free' | 'silver' | 'premium'; daily_minutes: number; monthly_minutes: number; max_concurrent_calls: number };
type BuyerQuota = { daily_minutes: number; monthly_minutes: number; max_concurrent_calls: number };
type Usage = { calls_30d: number; conversation_minutes_30d: number; participant_minutes_30d: number; estimated_cost_ngn_30d: number };

const planNames: Record<PlanQuota['plan_slug'], string> = { free: 'Free', silver: 'Silver', premium: 'Premium' };

export default function CallQuotasTab() {
  const queryClient = useQueryClient();
  const { data: plans = [], isLoading: plansLoading, isError: plansError } = useQuery({
    queryKey: ['admin-call-plan-quotas'],
    queryFn: async () => {
      const { data, error } = await supabase.from('call_plan_quotas').select('*').order('plan_slug');
      if (error) throw error;
      return data as PlanQuota[];
    },
  });
  const { data: buyers, isError: buyersError } = useQuery({
    queryKey: ['admin-buyer-call-quotas'],
    queryFn: async () => {
      const { data, error } = await supabase.from('buyer_call_quotas').select('*').eq('id', true).single();
      if (error) throw error;
      return data as BuyerQuota;
    },
  });
  const { data: costSettings, isError: costError } = useQuery({
    queryKey: ['admin-call-cost-settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('call_platform_cost_settings').select('*').eq('id', true).single();
      if (error) throw error;
      return data as { cost_per_participant_minute_ngn: number | null };
    },
  });
  const { data: usage } = useQuery({
    queryKey: ['admin-call-usage'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('call_usage_overview');
      if (error) throw error;
      return data as Usage;
    },
  });
  const savePlan = useMutation({
    mutationFn: async (quota: PlanQuota) => {
      const { error } = await supabase.from('call_plan_quotas').update({
        daily_minutes: quota.daily_minutes,
        monthly_minutes: quota.monthly_minutes,
        max_concurrent_calls: quota.max_concurrent_calls,
        updated_at: new Date().toISOString(),
      }).eq('plan_slug', quota.plan_slug);
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Call allowance saved'); queryClient.invalidateQueries({ queryKey: ['admin-call-plan-quotas'] }); },
    onError: (error: Error) => toast.error(error.message),
  });
  const saveBuyer = useMutation({
    mutationFn: async (quota: BuyerQuota) => {
      const { error } = await supabase.from('buyer_call_quotas').update({ ...quota, updated_at: new Date().toISOString() }).eq('id', true);
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Buyer call allowance saved'); queryClient.invalidateQueries({ queryKey: ['admin-buyer-call-quotas'] }); },
    onError: (error: Error) => toast.error(error.message),
  });
  const saveCost = useMutation({
    mutationFn: async (value: number | null) => {
      const { error } = await supabase.from('call_platform_cost_settings')
        .update({ cost_per_participant_minute_ngn: value, updated_at: new Date().toISOString() }).eq('id', true);
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Usage rate saved'); queryClient.invalidateQueries({ queryKey: ['admin-call-cost-settings'] }); },
    onError: (error: Error) => toast.error(error.message),
  });

  if (plansLoading) return <p className="text-sm text-muted-foreground">Loading call allowances...</p>;
  if (plansError || buyersError || costError) return (
    <p className="text-sm text-destructive">Could not load call settings. Apply 20261112100000_call_usage_quotas.sql, then reload.</p>
  );

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 text-sm">
        <p className="flex items-start gap-2 font-medium"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />Daily, monthly and concurrent call limits are checked by the database before a call starts.</p>
        <p className="mt-1 text-muted-foreground">The current Call Kit flow does not yet provide verified server-side call termination or queue dispatch. These controls do not forcibly end an active call or start queued invitations.</p>
      </section>

      <section className="rounded-lg border bg-card p-4">
        <h2 className="font-heading text-base font-semibold">Vendor allowances</h2>
        <p className="mt-1 text-xs text-muted-foreground">Usage resets by Africa/Lagos calendar day and month. Every answered call rounds up to whole conversation minutes for allowance accounting.</p>
        <div className="mt-3 divide-y">
          {plans.map(plan => <QuotaEditor key={plan.plan_slug} title={planNames[plan.plan_slug]} quota={plan} saving={savePlan.isPending} onSave={value => savePlan.mutateAsync({ ...value, plan_slug: plan.plan_slug })} />)}
        </div>
      </section>

      {buyers && (
        <section className="rounded-lg border bg-card p-4">
          <h2 className="font-heading text-base font-semibold">Buyer allowances</h2>
          <p className="mt-1 text-xs text-muted-foreground">Configured independently from supplier plan limits.</p>
          <QuotaEditor title="All buyers" quota={buyers} saving={saveBuyer.isPending} onSave={value => saveBuyer.mutateAsync(value)} />
        </section>
      )}

      {costSettings && <CostEditor initialValue={costSettings.cost_per_participant_minute_ngn} saving={saveCost.isPending} onSave={value => saveCost.mutateAsync(value)} />}

      <section className="rounded-lg border bg-card p-4">
        <h2 className="font-heading text-base font-semibold">Measured usage, last 30 days</h2>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
          <Metric label="Calls" value={usage?.calls_30d ?? 0} />
          <Metric label="Conversation minutes" value={usage?.conversation_minutes_30d ?? 0} />
          <Metric label="Participant minutes" value={usage?.participant_minutes_30d ?? 0} />
          <Metric label="Estimated cost" value={usage?.estimated_cost_ngn_30d == null ? 'Not configured' : formatNaira(usage.estimated_cost_ngn_30d)} />
        </dl>
      </section>
    </div>
  );
}

function QuotaEditor({ title, quota, saving, onSave }: {
  title: string;
  quota: Pick<PlanQuota, 'daily_minutes' | 'monthly_minutes' | 'max_concurrent_calls'>;
  saving: boolean;
  onSave: (value: BuyerQuota) => Promise<unknown>;
}) {
  const [daily, setDaily] = useState(String(quota.daily_minutes));
  const [monthly, setMonthly] = useState(String(quota.monthly_minutes));
  const [concurrent, setConcurrent] = useState(String(quota.max_concurrent_calls));
  useEffect(() => {
    setDaily(String(quota.daily_minutes));
    setMonthly(String(quota.monthly_minutes));
    setConcurrent(String(quota.max_concurrent_calls));
  }, [quota.daily_minutes, quota.monthly_minutes, quota.max_concurrent_calls]);

  const save = () => {
    const values = [Number(daily), Number(monthly), Number(concurrent)];
    if (values.some(value => !Number.isInteger(value) || value < 0)) {
      toast.error('Enter non-negative whole-number call limits');
      return;
    }
    void onSave({ daily_minutes: values[0], monthly_minutes: values[1], max_concurrent_calls: values[2] });
  };

  return (
    <div className="grid gap-3 py-3 md:grid-cols-[minmax(100px,1fr)_repeat(3,minmax(100px,0.8fr))_auto] md:items-end">
      <p className="pb-2 text-sm font-medium">{title}</p>
      <NumberField id={`${title}-daily`} label="Daily minutes" value={daily} onChange={setDaily} max={100000} />
      <NumberField id={`${title}-monthly`} label="Monthly minutes" value={monthly} onChange={setMonthly} max={1000000} />
      <NumberField id={`${title}-concurrent`} label="Concurrent calls" value={concurrent} onChange={setConcurrent} max={10} />
      <Button size="sm" variant="outline" disabled={saving} onClick={save}>Save</Button>
    </div>
  );
}

function NumberField({ id, label, value, onChange, max }: { id: string; label: string; value: string; onChange: (value: string) => void; max: number }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs text-muted-foreground">{label}</Label>
      <Input id={id} type="number" min="0" max={max} step="1" value={value} onChange={event => onChange(event.target.value)} />
    </div>
  );
}

function CostEditor({ initialValue, saving, onSave }: { initialValue: number | null; saving: boolean; onSave: (value: number | null) => Promise<unknown> }) {
  const [value, setValue] = useState(initialValue == null ? '' : String(initialValue));
  useEffect(() => setValue(initialValue == null ? '' : String(initialValue)), [initialValue]);
  const save = () => {
    const parsed = value === '' ? null : Number(value);
    if (parsed !== null && (!Number.isFinite(parsed) || parsed < 0)) { toast.error('Enter a non-negative NGN rate'); return; }
    void onSave(parsed);
  };
  return (
    <section className="rounded-lg border bg-card p-4">
      <h2 className="font-heading text-base font-semibold">ZEGOCLOUD usage estimate</h2>
      <p className="mt-1 text-xs text-muted-foreground">Optional NGN cost per participant-minute, kept separate from conversation duration.</p>
      <div className="mt-3 flex max-w-sm items-end gap-3">
        <div className="flex-1 space-y-1"><Label htmlFor="call-cost-rate">NGN per participant-minute</Label><Input id="call-cost-rate" type="number" min="0" step="0.0001" value={value} onChange={event => setValue(event.target.value)} /></div>
        <Button variant="outline" disabled={saving} onClick={save}>Save</Button>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="border-l pl-3 first:border-0 first:pl-0"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 font-semibold tabular-nums">{value}</dd></div>;
}
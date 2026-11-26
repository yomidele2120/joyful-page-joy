import { useState } from 'react';
import AdBundleAdminPanel from '@/components/admin/AdBundleAdminPanel';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Panel } from '@/components/dashboard/DashboardShell';
import { supabase } from '@/integrations/supabase/client';
import { formatNaira } from '@/lib/format';

const db = supabase as any;
const naira = (k: unknown) => formatNaira(Number(k ?? 0) / 100);
const sel = 'h-10 rounded-md border border-input bg-background px-3 text-sm';

export default function SubscriptionPricingAdmin() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');
  const [np, setNp] = useState({ plan: 'silver', period: 'annual', category: '', naira: '' });
  const [grant, setGrant] = useState({ search: '', vendor: '', plan: 'silver', days: '365' });

  const { data: plans = [] } = useQuery<any[]>({ queryKey: ['adm-sub-plans'], queryFn: async () => (await db.from('supplier_membership_plans').select('slug,name,ad_credit_kobo,sort_order').neq('slug', 'free').order('sort_order')).data ?? [] });
  const { data: cats = [] } = useQuery<any[]>({ queryKey: ['adm-main-cats'], queryFn: async () => (await db.from('categories').select('id,name').is('parent_id', null).order('name')).data ?? [] });
  const { data: prices = [] } = useQuery<any[]>({ queryKey: ['adm-plan-prices'], queryFn: async () => (await db.from('plan_prices').select('*').order('plan_slug').order('billing_period')).data ?? [] });
  const { data: subs = [] } = useQuery<any[]>({ queryKey: ['adm-vendor-subs'], queryFn: async () => { const { data, error } = await db.rpc('admin_vendor_subscriptions'); if (error) throw error; return data ?? []; } });
  const { data: payments = [] } = useQuery<any[]>({
    queryKey: ['adm-sub-payments'],
    queryFn: async () => (await db.from('supplier_membership_payments').select('id,vendor_id,plan_slug,amount_kobo,status,kind,paid_at,created_at,paystack_reference,vendors(store_name)').in('status', ['success', 'refunded', 'chargeback']).order('created_at', { ascending: false }).limit(50)).data ?? [],
  });
  const { data: found = [] } = useQuery<any[]>({
    queryKey: ['adm-vendor-search', grant.search],
    enabled: grant.search.trim().length >= 2,
    queryFn: async () => (await db.from('vendors').select('id,store_name').ilike('store_name', `%${grant.search.trim()}%`).limit(8)).data ?? [],
  });

  const refresh = () => ['adm-sub-plans', 'adm-plan-prices', 'adm-vendor-subs', 'adm-sub-payments'].forEach(k => qc.invalidateQueries({ queryKey: [k] }));
  const guard = async (fn: () => Promise<{ error?: { message: string } | null }>, ok: string) => {
    setBusy(true);
    try { const { error } = await fn(); if (error) { toast.error(error.message); return; } toast.success(ok); refresh(); }
    catch (e: any) { toast.error(e?.message ?? 'Something went wrong'); }
    finally { setBusy(false); }
  };
  const needReason = () => { if (reason.trim().length < 3) { toast.error('Write a reason first'); return false; } return true; };

  const addPrice = () => {
    const kobo = Math.round(Number(np.naira) * 100);
    if (!kobo || kobo < 10000) { toast.error('Enter a price of at least ₦100'); return; }
    const existing = prices.find(p => p.plan_slug === np.plan && p.billing_period === np.period && (p.category_id ?? '') === np.category);
    const row = { price_kobo: kobo, period_days: np.period === 'annual' ? 365 : 30, is_active: true, updated_at: new Date().toISOString() };
    guard(() => existing
      ? db.from('plan_prices').update(row).eq('id', existing.id)
      : db.from('plan_prices').insert({ ...row, plan_slug: np.plan, billing_period: np.period, category_id: np.category || null }), 'Price saved');
  };

  const catName = (id: string | null) => (id ? cats.find(c => c.id === id)?.name ?? 'Category' : 'All categories');

  return (
    <div className="space-y-4">
      <AdBundleAdminPanel />
      <Panel title="Plan prices">
        <p className="mb-3 text-sm text-muted-foreground">A price for "All categories" applies to every supplier. A category price overrides it for suppliers who chose that category. Turn a category price off to hide the plan there. Checkout also needs "Purchase enabled" switched on above.</p>
        <div className="grid gap-2 sm:grid-cols-5">
          <select className={sel} value={np.plan} onChange={e => setNp({ ...np, plan: e.target.value })} aria-label="Plan">{plans.map(p => <option key={p.slug} value={p.slug}>{p.name}</option>)}</select>
          <select className={sel} value={np.period} onChange={e => setNp({ ...np, period: e.target.value })} aria-label="Billing period"><option value="annual">Yearly</option><option value="monthly">Monthly</option></select>
          <select className={sel} value={np.category} onChange={e => setNp({ ...np, category: e.target.value })} aria-label="Category"><option value="">All categories</option>{cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <Input inputMode="numeric" placeholder="Price in naira" value={np.naira} onChange={e => setNp({ ...np, naira: e.target.value.replace(/[^\d.]/g, '') })} aria-label="Price in naira" />
          <Button type="button" disabled={busy} onClick={addPrice}>Save price</Button>
        </div>
        <ul className="mt-4 divide-y divide-border text-sm">
          {prices.map(p => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="capitalize">{p.plan_slug} · {p.billing_period} · {catName(p.category_id)}</span>
              <span className="font-medium">{naira(p.price_kobo)}</span>
              <span className="flex gap-2">
                <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => guard(() => db.from('plan_prices').update({ is_active: !p.is_active, updated_at: new Date().toISOString() }).eq('id', p.id), p.is_active ? 'Turned off' : 'Turned on')}>{p.is_active ? 'Turn off' : 'Turn on'}</Button>
                <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => guard(() => db.from('plan_prices').delete().eq('id', p.id), 'Price removed')}>Remove</Button>
              </span>
            </li>
          ))}
          {prices.length === 0 && <li className="py-2 text-muted-foreground">No prices yet.</li>}
        </ul>
      </Panel>

      <Panel title="Advertising credit included with each plan">
        <p className="mb-3 text-sm text-muted-foreground">Added to the supplier's ad balance once per successful payment. It is taken back (if unspent) when the payment is refunded.</p>
        <ul className="space-y-2 text-sm">
          {plans.map(p => <AdCreditRow key={p.slug} plan={p} busy={busy} onSave={(kobo: number) => guard(() => db.from('supplier_membership_plans').update({ ad_credit_kobo: kobo }).eq('slug', p.slug), 'Saved')} />)}
        </ul>
      </Panel>

      <Panel title="Refund, reverse or manage subscriptions">
        <Input value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason (required for every action below, saved in the audit log)" aria-label="Reason" />
        <h3 className="mt-4 font-heading text-sm">Recent payments</h3>
        <ul className="mt-1 divide-y divide-border text-sm">
          {payments.map(p => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>{p.vendors?.store_name ?? 'Supplier'} · <span className="capitalize">{p.plan_slug}</span></span>
              <span>{naira(p.amount_kobo)} · {p.status}</span>
              {p.status === 'success' && (
                <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => { if (!needReason()) return; guard(async () => { const { data, error } = await supabase.functions.invoke('refund-subscription-payment', { body: { payment_id: p.id, reason: reason.trim() } }); return { error: error ? { message: data?.error ?? error.message } : data?.error ? { message: data.error } : null }; }, 'Refund sent to Paystack and the subscription reversed'); }}>Refund</Button>
              )}
            </li>
          ))}
          {payments.length === 0 && <li className="py-2 text-muted-foreground">No payments yet.</li>}
        </ul>

        <h3 className="mt-5 font-heading text-sm">Supplier subscriptions</h3>
        <ul className="mt-1 divide-y divide-border text-sm">
          {subs.map(s => (
            <li key={s.vendor_id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="font-medium">{s.store_name}</span>
              <span>{s.plan_name}{s.category ? ` · ${s.category}` : ''}</span>
              <span className="text-muted-foreground">{s.is_current ? `Until ${new Date(s.expires_at).toLocaleDateString()}` : 'Expired'} · paid {naira(s.paid_kobo)}</span>
              {s.is_current && <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => { if (!needReason()) return; guard(() => db.rpc('admin_revoke_subscription', { _vendor: s.vendor_id, _reason: reason.trim() }), 'Subscription revoked'); }}>Revoke</Button>}
            </li>
          ))}
          {subs.length === 0 && <li className="py-2 text-muted-foreground">No paid or granted subscriptions yet.</li>}
        </ul>

        <h3 className="mt-5 font-heading text-sm">Give a supplier a plan (no payment, no commission)</h3>
        <div className="mt-2 grid gap-2 sm:grid-cols-4">
          <div className="sm:col-span-2">
            <Input value={grant.search} onChange={e => setGrant({ ...grant, search: e.target.value, vendor: '' })} placeholder="Search supplier by shop name" aria-label="Search supplier" />
            {found.length > 0 && !grant.vendor && (
              <ul className="mt-1 rounded-md border border-border text-sm">{found.map(v => <li key={v.id}><button type="button" className="w-full px-3 py-1.5 text-left hover:bg-secondary" onClick={() => setGrant({ ...grant, vendor: v.id, search: v.store_name })}>{v.store_name}</button></li>)}</ul>
            )}
          </div>
          <select className={sel} value={grant.plan} onChange={e => setGrant({ ...grant, plan: e.target.value })} aria-label="Plan to give">{plans.map(p => <option key={p.slug} value={p.slug}>{p.name}</option>)}</select>
          <Input inputMode="numeric" value={grant.days} onChange={e => setGrant({ ...grant, days: e.target.value.replace(/\D/g, '') })} placeholder="Days" aria-label="Days" />
        </div>
        <Button type="button" className="mt-2" disabled={busy || !grant.vendor} onClick={() => { if (!needReason()) return; guard(() => db.rpc('admin_grant_subscription', { _vendor: grant.vendor, _plan: grant.plan, _days: Number(grant.days), _reason: reason.trim() }), 'Plan given'); }}>Give plan</Button>
      </Panel>
    </div>
  );
}

function AdCreditRow({ plan, busy, onSave }: { plan: any; busy: boolean; onSave: (kobo: number) => void }) {
  const [v, setV] = useState(String(Math.round(Number(plan.ad_credit_kobo ?? 0) / 100)));
  return (
    <li className="flex flex-wrap items-center gap-2">
      <span className="w-28 font-medium">{plan.name}</span>
      <Input className="w-40" inputMode="numeric" value={v} onChange={e => setV(e.target.value.replace(/\D/g, ''))} aria-label={`${plan.name} ad credit in naira`} />
      <span className="text-muted-foreground">naira</span>
      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => onSave(Number(v || 0) * 100)}>Save</Button>
    </li>
  );
}

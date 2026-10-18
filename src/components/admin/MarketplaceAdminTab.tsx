import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { formatNaira } from '@/lib/format';
import { formatLongDate } from '@/hooks/useMarketplace';

const card = 'rounded-lg bg-card p-5 card-shadow';

export default function MarketplaceAdminTab() {
  return (
    <Tabs defaultValue="settings" className="space-y-4">
      <TabsList className="flex h-auto flex-wrap justify-start">
        <TabsTrigger value="settings">Sections and rules</TabsTrigger>
        <TabsTrigger value="listings">Listings</TabsTrigger>
        <TabsTrigger value="support">Support</TabsTrigger>
        <TabsTrigger value="disputes">Disputes</TabsTrigger>
        <TabsTrigger value="requests">Cancellations and refunds</TabsTrigger>
      </TabsList>
      <TabsContent value="settings"><SettingsPanel /></TabsContent>
      <TabsContent value="listings"><ListingsPanel /></TabsContent>
      <TabsContent value="support"><SupportPanel /></TabsContent>
      <TabsContent value="disputes"><DisputesPanel /></TabsContent>
      <TabsContent value="requests"><RequestsPanel /></TabsContent>
    </Tabs>
  );
}

// ------------------------------------------------------------ settings + category visibility
function SettingsPanel() {
  const queryClient = useQueryClient();
  const { data: settings } = useQuery({
    queryKey: ['admin-marketplace-settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('marketplace_settings').select('*').eq('id', true).single();
      if (error) throw error;
      return data;
    },
  });
  const [days, setDays] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async (changes: Record<string, boolean | number>) => {
      const { error } = await supabase.from('marketplace_settings').update(changes).eq('id', true);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Saved');
      queryClient.invalidateQueries({ queryKey: ['admin-marketplace-settings'] });
      queryClient.invalidateQueries({ queryKey: ['marketplace-settings'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const { data: categories } = useQuery({
    queryKey: ['admin-categories-visibility'],
    queryFn: async () => {
      const { data, error } = await supabase.from('categories').select('id, name, is_visible').order('sort_order');
      if (error) throw error;
      return data ?? [];
    },
  });
  const setVisible = useMutation({
    mutationFn: async ({ id, visible }: { id: string; visible: boolean }) => {
      const { error } = await supabase.from('categories').update({ is_visible: visible }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-categories-visibility'] });
      queryClient.invalidateQueries({ queryKey: ['categories'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!settings) return <p className="text-sm text-muted-foreground">Loading...</p>;
  const row = (id: string, label: string, text: string, checked: boolean, field: string) => (
    <div className="flex items-start justify-between gap-4 border-b border-border py-3 last:border-0">
      <div><Label htmlFor={id} className="font-medium">{label}</Label><p className="mt-0.5 text-xs text-muted-foreground">{text}</p></div>
      <Switch id={id} checked={checked} onCheckedChange={v => save.mutate({ [field]: v })} />
    </div>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className={card}>
        <h2 className="font-heading text-lg font-bold">Pay later and preorders</h2>
        {row('s-bnpl', 'Show the Pay later section', 'Shows the Pay later page, menu links and product labels. Pay later also needs to be switched on, with its limits, under Finance.', settings.bnpl_section_visible, 'bnpl_section_visible')}
        {row('s-pre', 'Allow preorders', 'Shows the Preorders page and lets buyers order preorder products. Switching it off stops new preorders only.', settings.preorder_enabled, 'preorder_enabled')}
        {row('s-appr', 'Review preorder listings before they go live', 'Sellers can switch preorder on, but buyers only see the listing after you approve it under Listings.', settings.preorder_requires_approval, 'preorder_requires_approval')}
        <div className="py-3">
          <Label htmlFor="s-days" className="font-medium">Days a delay is allowed before buyers can cancel for a full refund</Label>
          <p className="mt-0.5 text-xs text-muted-foreground">Shown to buyers on the Preorders page, at checkout and in the Preorder Policy.</p>
          <div className="mt-2 flex gap-2">
            <Input id="s-days" type="number" min={0} className="w-28" value={days ?? String(settings.preorder_delay_cancel_days)} onChange={e => setDays(e.target.value)} />
            <Button variant="outline" disabled={days === null || save.isPending} onClick={() => { const n = Math.floor(Number(days)); if (n >= 0) save.mutate({ preorder_delay_cancel_days: n }); else toast.error('Enter a number of days'); }}>Save</Button>
          </div>
        </div>
      </section>

      <section className={card}>
        <h2 className="font-heading text-lg font-bold">Category visibility</h2>
        <p className="text-xs text-muted-foreground">Hidden categories disappear from menus, filters and the footer. Their products are not deleted.</p>
        <ul className="mt-3 divide-y divide-border">
          {(categories ?? []).map(c => (
            <li key={c.id} className="flex items-center justify-between py-2.5 text-sm">
              <span>{c.name}</span>
              <Switch checked={c.is_visible !== false} aria-label={`Show ${c.name}`} onCheckedChange={v => setVisible.mutate({ id: c.id, visible: v })} />
            </li>
          ))}
          {!categories?.length && <li className="py-3 text-sm text-muted-foreground">No categories yet.</li>}
        </ul>
      </section>
    </div>
  );
}

// ------------------------------------------------------------ listings: eligibility + preorder approval
function ListingsPanel() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [pendingOnly, setPendingOnly] = useState(true);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-listings', search, pendingOnly],
    queryFn: async () => {
      let q = supabase.from('products')
        .select('id, name, price, bnpl_eligible, is_preorder, preorder_approved, preorder_status, preorder_release_date, preorder_quantity_limit, vendors(store_name)')
        .order('created_at', { ascending: false }).limit(60);
      if (search.trim()) q = q.ilike('name', `%${search.trim()}%`);
      if (pendingOnly) q = q.eq('is_preorder', true).eq('preorder_approved', false);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as {
        id: string; name: string; price: number; bnpl_eligible: boolean | null; is_preorder: boolean; preorder_approved: boolean;
        preorder_status: string; preorder_release_date: string | null; preorder_quantity_limit: number | null; vendors: { store_name: string } | null;
      }[];
    },
  });

  const update = useMutation({
    mutationFn: async ({ id, changes }: { id: string; changes: Record<string, boolean> }) => {
      const { error } = await supabase.from('products').update(changes).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin-listings'] }); queryClient.invalidateQueries({ queryKey: ['products'] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section className={card}>
      <h2 className="font-heading text-lg font-bold">Listings: Pay later and preorders</h2>
      <p className="text-xs text-muted-foreground">Approve preorder listings and decide which products can use Pay later. Sellers cannot approve their own preorders.</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Input className="max-w-xs" placeholder="Search products" aria-label="Search products" value={search} onChange={e => setSearch(e.target.value)} />
        <label className="flex items-center gap-2 text-sm"><Switch checked={pendingOnly} onCheckedChange={setPendingOnly} /> Only preorders waiting for approval</label>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-secondary"><tr><th className="p-2">Product</th><th className="p-2">Seller</th><th className="p-2">Price</th><th className="p-2">Pay later</th><th className="p-2">Preorder</th></tr></thead>
          <tbody>
            {isLoading ? <tr><td colSpan={5} className="p-4 text-muted-foreground">Loading...</td></tr>
              : !data?.length ? <tr><td colSpan={5} className="p-4 text-muted-foreground">{pendingOnly ? 'No preorder listings are waiting for approval.' : 'No products found.'}</td></tr>
              : data.map(p => (
                <tr key={p.id} className="border-t border-border align-top">
                  <td className="p-2 font-medium">{p.name}</td>
                  <td className="p-2 text-muted-foreground">{p.vendors?.store_name ?? '-'}</td>
                  <td className="p-2">{formatNaira(p.price)}</td>
                  <td className="p-2"><Switch checked={!!p.bnpl_eligible} disabled={p.is_preorder} aria-label={`Pay later for ${p.name}`} onCheckedChange={v => update.mutate({ id: p.id, changes: { bnpl_eligible: v } })} /></td>
                  <td className="p-2">
                    {p.is_preorder ? (
                      <div className="space-y-1">
                        <Badge variant="secondary">{p.preorder_approved ? `Approved (${p.preorder_status})` : 'Waiting for approval'}</Badge>
                        <p className="text-xs text-muted-foreground">Expected {formatLongDate(p.preorder_release_date) || 'TBC'}{p.preorder_quantity_limit ? `, ${p.preorder_quantity_limit} places` : ''}</p>
                        <div className="flex gap-2">
                          {!p.preorder_approved
                            ? <Button size="sm" onClick={() => update.mutate({ id: p.id, changes: { preorder_approved: true } })}>Approve</Button>
                            : <Button size="sm" variant="outline" onClick={() => update.mutate({ id: p.id, changes: { preorder_approved: false } })}>Unapprove</Button>}
                          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => update.mutate({ id: p.id, changes: { is_preorder: false, preorder_approved: false } })}>Reject</Button>
                        </div>
                      </div>
                    ) : <span className="text-xs text-muted-foreground">Not a preorder</span>}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ------------------------------------------------------------ support tickets
const TICKET_STATUS = ['open', 'in_progress', 'resolved', 'closed'];
function SupportPanel() {
  const queryClient = useQueryClient();
  const [replies, setReplies] = useState<Record<string, string>>({});
  const { data, isLoading } = useQuery({
    queryKey: ['admin-tickets'],
    queryFn: async () => {
      const { data, error } = await supabase.from('support_tickets').select('*').order('created_at', { ascending: false }).limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });
  const update = useMutation({
    mutationFn: async ({ id, changes }: { id: string; changes: { status?: string; admin_reply?: string } }) => {
      const { error } = await supabase.from('support_tickets').update(changes).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Updated'); queryClient.invalidateQueries({ queryKey: ['admin-tickets'] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading...</p>;
  return (
    <section className="space-y-3">
      <p className="text-xs text-muted-foreground">Contact requests, complaints and reports. Replies are saved here and shown to signed-in users; for visitors without an account, also email them at the address shown.</p>
      {!data?.length && <p className={`${card} text-sm text-muted-foreground`}>No requests yet.</p>}
      {data?.map(t => (
        <article key={t.id} className={card}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium">{t.subject}</p>
            <Select value={t.status} onValueChange={v => update.mutate({ id: t.id, changes: { status: v } })}>
              <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
              <SelectContent>{TICKET_STATUS.map(s => <SelectItem key={s} value={s}>{s.replace('_', ' ')}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {t.name} ({t.email}) - {t.category.replace('_', ' ')} - {new Date(t.created_at).toLocaleString()}
            {t.order_id ? ` - order #${t.order_id.slice(0, 8).toUpperCase()}` : ''}{t.vendor_id ? ` - seller ${t.vendor_id.slice(0, 8)}` : ''}{t.product_id ? ` - product ${t.product_id.slice(0, 8)}` : ''}
          </p>
          <p className="mt-2 whitespace-pre-wrap text-sm">{t.message}</p>
          <Textarea className="mt-3" rows={2} placeholder="Reply" aria-label="Reply" value={replies[t.id] ?? t.admin_reply ?? ''} onChange={e => setReplies(r => ({ ...r, [t.id]: e.target.value }))} />
          <Button size="sm" className="mt-2" disabled={!(replies[t.id] ?? '').trim()} onClick={() => update.mutate({ id: t.id, changes: { admin_reply: (replies[t.id] ?? '').trim(), status: t.status === 'open' ? 'in_progress' : t.status } })}>Save reply</Button>
        </article>
      ))}
    </section>
  );
}

// ------------------------------------------------------------ disputes
const DISPUTE_STATUS = ['open', 'seller_responded', 'under_review', 'resolved', 'closed'];
function DisputesPanel() {
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const { data, isLoading } = useQuery({
    queryKey: ['admin-disputes'],
    queryFn: async () => {
      const { data, error } = await supabase.from('disputes').select('*, vendors(store_name)').order('created_at', { ascending: false }).limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as (Record<string, any> & { vendors: { store_name: string } | null })[];
    },
  });
  const update = useMutation({
    mutationFn: async ({ id, changes }: { id: string; changes: Record<string, string> }) => {
      const { error } = await supabase.from('disputes').update(changes).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Updated'); queryClient.invalidateQueries({ queryKey: ['admin-disputes'] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading...</p>;
  return (
    <section className="space-y-3">
      <p className="text-xs text-muted-foreground">Read both sides, then set the status and write your decision. Refunds are sent from the Paystack or Klump dashboard; record them under Cancellations and refunds.</p>
      {!data?.length && <p className={`${card} text-sm text-muted-foreground`}>No disputes.</p>}
      {data?.map(d => (
        <article key={d.id} className={card}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium">Order #{String(d.order_id).slice(0, 8).toUpperCase()} - {String(d.reason).replace(/_/g, ' ')}</p>
            <Select value={d.status} onValueChange={v => update.mutate({ id: d.id, changes: { status: v } })}>
              <SelectTrigger className="h-8 w-44"><SelectValue /></SelectTrigger>
              <SelectContent>{DISPUTE_STATUS.map(s => <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Seller: {d.vendors?.store_name ?? '-'} - wants: {String(d.desired_outcome)} - {new Date(d.created_at).toLocaleString()}</p>
          <p className="mt-2 whitespace-pre-wrap text-sm"><strong>Buyer:</strong> {d.details}</p>
          {d.seller_response && <p className="mt-2 whitespace-pre-wrap text-sm"><strong>Seller:</strong> {d.seller_response}</p>}
          <Textarea className="mt-3" rows={2} placeholder="Your decision (shown to buyer and seller)" aria-label="Decision" value={notes[d.id] ?? d.resolution ?? ''} onChange={e => setNotes(n => ({ ...n, [d.id]: e.target.value }))} />
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="outline" disabled={!(notes[d.id] ?? '').trim()} onClick={() => update.mutate({ id: d.id, changes: { resolution: (notes[d.id] ?? '').trim() } })}>Save decision</Button>
            <Button size="sm" disabled={!(notes[d.id] ?? d.resolution ?? '').trim()} onClick={() => update.mutate({ id: d.id, changes: { resolution: (notes[d.id] ?? d.resolution ?? '').trim(), status: 'resolved' } })}>Save and resolve</Button>
          </div>
        </article>
      ))}
    </section>
  );
}

// ------------------------------------------------------------ cancellation / refund requests
function RequestsPanel() {
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const { data, isLoading } = useQuery({
    queryKey: ['admin-order-requests'],
    queryFn: async () => {
      const { data, error } = await supabase.from('order_requests').select('*, orders(total, status, payment_method, is_preorder)').order('created_at', { ascending: false }).limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as (Record<string, any> & { orders: { total: number; status: string; payment_method: string; is_preorder: boolean } | null })[];
    },
  });
  const update = useMutation({
    mutationFn: async ({ id, status, note }: { id: string; status: string; note: string }) => {
      const { error } = await supabase.from('order_requests').update({ status, admin_note: note || null }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Updated');
      queryClient.invalidateQueries({ queryKey: ['admin-order-requests'] });
      queryClient.invalidateQueries({ queryKey: ['admin-orders'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading...</p>;
  return (
    <section className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Approving a request cancels the order and reverses the seller's earnings. The money itself is returned by you in the Paystack dashboard (or with Klump for Pay later orders): after that, mark the request as refunded so the buyer is told.
      </p>
      {!data?.length && <p className={`${card} text-sm text-muted-foreground`}>No requests.</p>}
      {data?.map(r => (
        <article key={r.id} className={card}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium">{r.kind === 'cancel' ? 'Cancellation' : 'Refund'} - order #{String(r.order_id).slice(0, 8).toUpperCase()}</p>
            <Badge variant="secondary">{r.status}</Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {r.orders ? `${formatNaira(r.orders.total)} - order is ${r.orders.status} - paid with ${r.orders.payment_method}${r.orders.is_preorder ? ' - preorder' : ''}` : ''} - {new Date(r.created_at).toLocaleString()}
          </p>
          <p className="mt-2 whitespace-pre-wrap text-sm">{r.reason}</p>
          {r.status === 'requested' || r.status === 'approved' ? (
            <>
              <Textarea className="mt-3" rows={2} placeholder="Note to the buyer (optional)" aria-label="Note" value={notes[r.id] ?? r.admin_note ?? ''} onChange={e => setNotes(n => ({ ...n, [r.id]: e.target.value }))} />
              <div className="mt-2 flex flex-wrap gap-2">
                {r.status === 'requested' && <Button size="sm" disabled={update.isPending} onClick={() => update.mutate({ id: r.id, status: 'approved', note: notes[r.id] ?? '' })}>{update.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}Approve</Button>}
                {r.status === 'requested' && <Button size="sm" variant="outline" onClick={() => update.mutate({ id: r.id, status: 'rejected', note: notes[r.id] ?? '' })}>Decline</Button>}
                {r.status === 'approved' && <Button size="sm" onClick={() => update.mutate({ id: r.id, status: 'refunded', note: notes[r.id] ?? '' })}>Mark refund as sent</Button>}
              </div>
            </>
          ) : r.admin_note ? <p className="mt-2 text-sm text-muted-foreground">Note: {r.admin_note}</p> : null}
        </article>
      ))}
    </section>
  );
}

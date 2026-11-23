// Admin: sponsored products on the central ITHUBAFRICA TikTok Ads account.
// Ads themselves are made in TikTok Ads Manager; this screen holds the requests, campaign records, budgets and the numbers copied back.
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Panel, StatusDot } from '@/components/dashboard/DashboardShell';
import { supabase } from '@/integrations/supabase/client';
import { buildLandingUrl, CAMPAIGN_STATUSES, FUNDING_LABEL, naira, NEXT_STATUSES, remainingBudget, STATUS_LABEL } from '@/lib/sponsored';
import SponsoredReport, { selectClass } from './SponsoredReport';
import TikTokEventsLog from './TikTokEventsLog';

const db = supabase as any;
const TABS = [['requests', 'Requests'], ['campaigns', 'Campaigns'], ['products', 'Vendor products'], ['report', 'Analytics'], ['events', 'Events API log']] as const;
type Tab = (typeof TABS)[number][0];
const TONE: Record<string, 'good' | 'warn' | 'bad' | 'idle'> = { active: 'good', approved: 'good', pending_approval: 'warn', draft: 'idle', paused: 'warn', completed: 'idle', rejected: 'bad', pending: 'warn' };
const fail = (e: { message?: string } | null) => { if (e) toast.error(e.message ?? 'Something went wrong'); return !!e; };

function useCampaigns() {
  return useQuery<any[]>({
    queryKey: ['sponsored-campaigns'],
    queryFn: async () => { const { data, error } = await db.from('sponsored_campaigns').select('*, vendors(store_name), sponsored_metrics(id, metric_date, spend, impressions, clicks), sponsored_campaign_products(product_id, vendor_id, budget_share, products(name, slug), vendors(store_name))').order('created_at', { ascending: false }); if (error) throw error; return data; },
  });
}

export default function SponsoredAdminPanel() {
  const [tab, setTab] = useState<Tab>('requests');
  const [pickCampaign, setPickCampaign] = useState('');
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">All sponsored advertising runs from the one ITHUBAFRICA TikTok Ads account. Create the ads in TikTok Ads Manager, using the links from each campaign here. Budgets here are records only; nobody is charged automatically.</p>
      <div className="flex flex-wrap gap-1 border-b border-border">{TABS.map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={`px-3 py-2 text-sm ${tab === k ? 'border-b-2 border-primary font-medium' : 'text-muted-foreground'}`}>{l}</button>)}</div>
      {tab === 'requests' && <Requests />}
      {tab === 'campaigns' && <Campaigns onPick={id => { setPickCampaign(id); setTab('products'); }} />}
      {tab === 'products' && <Catalog campaignId={pickCampaign} setCampaignId={setPickCampaign} />}
      {tab === 'report' && <SponsoredReport mode="admin" />}
      {tab === 'events' && <div className="space-y-8"><TikTokEventsLog /><TikTokEventsLog platform="meta" /></div>}
    </div>
  );
}

function Requests() {
  const qc = useQueryClient(); const { data: campaigns = [] } = useCampaigns();
  const [filter, setFilter] = useState('pending'); const [camp, setCamp] = useState<Record<string, string>>({}); const [note, setNote] = useState<Record<string, string>>({});
  const { data: rows = [] } = useQuery<any[]>({
    queryKey: ['sponsored-requests-admin'],
    queryFn: async () => { const { data, error } = await db.from('sponsored_requests').select('*, products(name), vendors(store_name)').order('created_at', { ascending: false }).limit(200); if (error) throw error; return data; },
  });
  const decide = async (id: string, approve: boolean) => {
    const { error } = await db.rpc('decide_sponsored_request', { _id: id, _approve: approve, _note: note[id] ?? '', _campaign_id: approve ? (camp[id] || null) : null });
    if (fail(error)) return;
    toast.success(approve ? 'Request approved' : 'Request rejected');
    ['sponsored-requests-admin', 'sponsored-campaigns'].forEach(k => qc.invalidateQueries({ queryKey: [k] }));
  };
  const shown = rows.filter(r => filter === 'all' || r.status === filter);
  return (
    <Panel title="Vendor advertising requests" action={<select className={selectClass} value={filter} onChange={e => setFilter(e.target.value)} aria-label="Filter"><option value="pending">Waiting</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="withdrawn">Withdrawn</option><option value="all">All (history)</option></select>} flush>
      <ul className="divide-y divide-border">{shown.map(r => (
        <li key={r.id} className="space-y-2 px-4 py-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-medium">{r.products?.name}</p><p className="text-xs text-muted-foreground">{r.vendors?.store_name} · {new Date(r.created_at).toLocaleDateString()} · Preferred budget {r.preferred_budget == null ? 'not given' : naira(Number(r.preferred_budget))}</p></div><StatusDot tone={TONE[r.status] ?? 'idle'}>{r.status}</StatusDot></div>
          {r.note && <p className="text-xs">Vendor note: {r.note}</p>}
          {r.status === 'pending' && (
            <div className="flex flex-wrap items-center gap-2">
              <select className={selectClass} aria-label="Campaign" value={camp[r.id] ?? ''} onChange={e => setCamp({ ...camp, [r.id]: e.target.value })}><option value="">Approve without a campaign yet</option>{campaigns.filter(c => !['completed', 'rejected'].includes(c.status)).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
              <Input className="h-9 w-56" placeholder="Note to vendor (optional)" value={note[r.id] ?? ''} onChange={e => setNote({ ...note, [r.id]: e.target.value })} />
              <Button size="sm" onClick={() => decide(r.id, true)}>Approve</Button><Button size="sm" variant="outline" onClick={() => decide(r.id, false)}>Reject</Button>
            </div>)}
        </li>))}
        {!shown.length && <li className="px-4 py-6 text-center text-sm text-muted-foreground">Nothing here.</li>}</ul>
    </Panel>
  );
}

function Campaigns({ onPick }: { onPick: (id: string) => void }) {
  const qc = useQueryClient(); const { data: campaigns = [] } = useCampaigns();
  const [open, setOpen] = useState(''); const [status, setStatus] = useState('all');
  const refresh = () => qc.invalidateQueries({ queryKey: ['sponsored-campaigns'] });
  const { data: vendors = [] } = useQuery<any[]>({ queryKey: ['sponsored-vendors'], queryFn: async () => (await db.from('vendors').select('id, store_name').order('store_name')).data ?? [] });
  const { data: cats = [] } = useQuery<any[]>({ queryKey: ['sponsored-cats'], queryFn: async () => (await db.from('categories').select('id, name').order('name')).data ?? [] });
  const [f, setF] = useState({ name: '', scope: 'product', vendor_id: '', category_id: '', objective: 'sales', funding_source: 'ithubafrica', vendor_contribution: '', budget_allocated: '', start_date: '', end_date: '', tiktok_campaign_id: '' });
  const create = async () => {
    if (f.name.trim().length < 2) return toast.error('Give the campaign a name');
    if (f.scope === 'vendor' && !f.vendor_id) return toast.error('Choose the vendor for this campaign');
    if (f.scope === 'category' && !f.category_id) return toast.error('Choose the category for this campaign');
    const { error } = await db.from('sponsored_campaigns').insert({
      name: f.name.trim(), scope: f.scope, vendor_id: f.scope === 'vendor' ? f.vendor_id : null, category_id: f.scope === 'category' ? f.category_id : null,
      objective: f.objective, funding_source: f.funding_source, vendor_contribution: Number(f.vendor_contribution || 0), budget_allocated: Number(f.budget_allocated || 0),
      start_date: f.start_date || null, end_date: f.end_date || null, tiktok_campaign_id: f.tiktok_campaign_id.trim() || null,
    });
    if (fail(error)) return;
    toast.success('Campaign created as a draft'); setF({ ...f, name: '', budget_allocated: '', vendor_contribution: '', tiktok_campaign_id: '' }); refresh();
  };
  const setCampaignStatus = async (id: string, s: string) => { const { error } = await db.from('sponsored_campaigns').update({ status: s }).eq('id', id); if (!fail(error)) refresh(); };
  const shown = campaigns.filter(c => status === 'all' || c.status === status);
  const inp = (k: keyof typeof f, label: string, type = 'text') => <label className="text-xs text-muted-foreground">{label}<Input type={type} value={f[k]} onChange={e => setF({ ...f, [k]: e.target.value })} className="mt-1 h-9" /></label>;
  return (
    <div className="space-y-4">
      <Panel title="New campaign"><div className="grid gap-3 p-4 md:grid-cols-3">
        {inp('name', 'Campaign name')}
        <label className="text-xs text-muted-foreground">Organised by<select className={`${selectClass} mt-1 w-full`} value={f.scope} onChange={e => setF({ ...f, scope: e.target.value })}><option value="product">Individual products</option><option value="vendor">One vendor</option><option value="category">Product category</option><option value="marketplace">General ITHUBAFRICA promotion</option></select></label>
        {f.scope === 'vendor' && <label className="text-xs text-muted-foreground">Vendor<select className={`${selectClass} mt-1 w-full`} value={f.vendor_id} onChange={e => setF({ ...f, vendor_id: e.target.value })}><option value="">Choose</option>{vendors.map(v => <option key={v.id} value={v.id}>{v.store_name}</option>)}</select></label>}
        {f.scope === 'category' && <label className="text-xs text-muted-foreground">Category<select className={`${selectClass} mt-1 w-full`} value={f.category_id} onChange={e => setF({ ...f, category_id: e.target.value })}><option value="">Choose</option>{cats.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select></label>}
        <label className="text-xs text-muted-foreground">Objective<select className={`${selectClass} mt-1 w-full`} value={f.objective} onChange={e => setF({ ...f, objective: e.target.value })}><option value="sales">Sales</option><option value="traffic">Traffic</option><option value="awareness">Awareness</option></select></label>
        <label className="text-xs text-muted-foreground">Funded by<select className={`${selectClass} mt-1 w-full`} value={f.funding_source} onChange={e => setF({ ...f, funding_source: e.target.value })}>{Object.entries(FUNDING_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        {inp('budget_allocated', 'Total budget (naira)', 'number')}
        {f.funding_source !== 'ithubafrica' && inp('vendor_contribution', 'Vendor share of the budget (naira)', 'number')}
        {inp('start_date', 'Start date', 'date')}{inp('end_date', 'End date', 'date')}{inp('tiktok_campaign_id', 'TikTok campaign ID (add after creating the ad)')}
        <div className="flex items-end"><Button onClick={create}>Create campaign</Button></div>
      </div></Panel>

      <Panel title="Campaigns and history" action={<select className={selectClass} value={status} onChange={e => setStatus(e.target.value)} aria-label="Status"><option value="all">All statuses</option>{CAMPAIGN_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</select>} flush>
        <ul className="divide-y divide-border">{shown.map(c => <CampaignRow key={c.id} c={c} open={open === c.id} toggle={() => setOpen(open === c.id ? '' : c.id)} setStatus={setCampaignStatus} refresh={refresh} onPick={onPick} />)}
          {!shown.length && <li className="px-4 py-6 text-center text-sm text-muted-foreground">No campaigns yet.</li>}</ul>
      </Panel>
    </div>
  );
}

function CampaignRow({ c, open, toggle, setStatus, refresh, onPick }: { c: any; open: boolean; toggle: () => void; setStatus: (id: string, s: string) => void; refresh: () => void; onPick: (id: string) => void }) {
  const metrics: any[] = c.sponsored_metrics ?? []; const prods: any[] = c.sponsored_campaign_products ?? [];
  const spent = metrics.length ? metrics.reduce((s, m) => s + Number(m.spend), 0) : null;
  const remaining = remainingBudget(Number(c.budget_allocated), spent);
  const [m, setM] = useState({ metric_date: new Date().toISOString().slice(0, 10), spend: '', impressions: '', clicks: '' });
  const [tid, setTid] = useState(c.tiktok_campaign_id ?? '');
  const saveMetric = async () => {
    if (m.spend === '' || m.impressions === '' || m.clicks === '') return toast.error('Fill in spend, impressions and clicks as shown in TikTok');
    const { error } = await db.from('sponsored_metrics').upsert({ campaign_id: c.id, metric_date: m.metric_date, spend: Number(m.spend), impressions: Number(m.impressions), clicks: Number(m.clicks) }, { onConflict: 'campaign_id,metric_date' });
    if (!fail(error)) { toast.success('Saved'); setM({ ...m, spend: '', impressions: '', clicks: '' }); refresh(); }
  };
  const del = async (id: string) => { const { error } = await db.from('sponsored_metrics').delete().eq('id', id); if (!fail(error)) refresh(); };
  const removeProduct = async (pid: string) => { const { error } = await db.from('sponsored_campaign_products').delete().eq('campaign_id', c.id).eq('product_id', pid); if (!fail(error)) refresh(); };
  const saveShare = async (pid: string, v: string) => { const { error } = await db.from('sponsored_campaign_products').update({ budget_share: v === '' ? null : Number(v) }).eq('campaign_id', c.id).eq('product_id', pid); if (!fail(error)) refresh(); };
  const saveTid = async () => { const { error } = await db.from('sponsored_campaigns').update({ tiktok_campaign_id: tid.trim() || null }).eq('id', c.id); if (!fail(error)) toast.success('Saved'); };
  const links = prods.map(p => ({ name: p.products?.name, url: buildLandingUrl(window.location.origin, { slug: p.products?.slug ?? '', productId: p.product_id, vendorId: p.vendor_id ?? '', campaignId: c.id, campaignCode: c.code }) }));
  return (
    <li className="px-4 py-3 text-sm">
      <button className="flex w-full flex-wrap items-center justify-between gap-2 text-left" onClick={toggle}>
        <span><span className="font-medium">{c.name}</span><span className="ml-2 text-xs text-muted-foreground">{c.scope} · {c.vendors?.store_name ?? 'all vendors'} · {FUNDING_LABEL[c.funding_source]}</span></span>
        <span className="flex items-center gap-3 text-xs"><span>Budget {naira(Number(c.budget_allocated))} · Spent {naira(spent)} · Left {naira(remaining)}</span><StatusDot tone={TONE[c.status] ?? 'idle'}>{STATUS_LABEL[c.status]}</StatusDot></span>
      </button>
      {open && (
        <div className="mt-3 space-y-4 rounded-md border border-border bg-muted/20 p-3">
          <div className="flex flex-wrap items-center gap-2">{(NEXT_STATUSES[c.status] ?? []).map(s => <Button key={s} size="sm" variant={s === 'rejected' ? 'outline' : 'default'} onClick={() => setStatus(c.id, s)}>{s === 'active' && c.status === 'paused' ? 'Resume' : `Mark ${STATUS_LABEL[s].toLowerCase()}`}</Button>)}
            <Button size="sm" variant="outline" onClick={() => onPick(c.id)}>Add products</Button>
            <span className="text-xs text-muted-foreground">{c.start_date ?? 'no start'} to {c.end_date ?? 'no end'} · objective {c.objective}{c.funding_source !== 'ithubafrica' ? ` · vendor share ${naira(Number(c.vendor_contribution))}` : ''}</span></div>
          <div className="flex items-end gap-2"><label className="text-xs text-muted-foreground">TikTok campaign ID<Input className="mt-1 h-9 w-56" value={tid} onChange={e => setTid(e.target.value)} /></label><Button size="sm" variant="outline" onClick={saveTid}>Save</Button></div>

          <div><p className="mb-1 font-medium">Products and ad links</p>
            {prods.map((p, i) => (<div key={p.product_id} className="mb-2 rounded border border-border bg-background p-2">
              <div className="flex flex-wrap items-center justify-between gap-2"><span>{p.products?.name} <span className="text-xs text-muted-foreground">by {p.vendors?.store_name}</span></span>
                <span className="flex items-center gap-2"><label className="text-xs text-muted-foreground">Share<Input className="ml-1 inline-block h-8 w-16" type="number" min={0} step="0.1" defaultValue={p.budget_share ?? ''} placeholder="equal" onBlur={e => saveShare(p.product_id, e.target.value)} /></label><Button size="sm" variant="outline" onClick={() => removeProduct(p.product_id)}>Remove</Button></span></div>
              <div className="mt-1 flex items-center gap-2"><input readOnly className="h-8 flex-1 rounded border border-input bg-muted/30 px-2 text-xs" value={links[i].url} onFocus={e => e.target.select()} />
                <Button size="sm" variant="outline" onClick={() => { navigator.clipboard?.writeText(links[i].url); toast.success('Link copied'); }}>Copy</Button></div></div>))}
            {!prods.length && <p className="text-xs text-muted-foreground">No products yet. Use "Add products" to pick from the vendor catalogue.</p>}</div>

          <div><p className="mb-1 font-medium">Numbers from TikTok Ads Manager</p>
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-xs text-muted-foreground">Date<Input type="date" className="mt-1 h-9 w-36" value={m.metric_date} onChange={e => setM({ ...m, metric_date: e.target.value })} /></label>
              <label className="text-xs text-muted-foreground">Spend (naira)<Input type="number" min={0} className="mt-1 h-9 w-28" value={m.spend} onChange={e => setM({ ...m, spend: e.target.value })} /></label>
              <label className="text-xs text-muted-foreground">Impressions<Input type="number" min={0} className="mt-1 h-9 w-28" value={m.impressions} onChange={e => setM({ ...m, impressions: e.target.value })} /></label>
              <label className="text-xs text-muted-foreground">Link clicks<Input type="number" min={0} className="mt-1 h-9 w-28" value={m.clicks} onChange={e => setM({ ...m, clicks: e.target.value })} /></label>
              <Button size="sm" onClick={saveMetric}>Save day</Button></div>
            <ul className="mt-2 space-y-1 text-xs">{[...metrics].sort((a, b) => b.metric_date.localeCompare(a.metric_date)).map(x => <li key={x.id} className="flex items-center justify-between gap-2"><span>{x.metric_date}: spend {naira(Number(x.spend))}, {Number(x.impressions).toLocaleString()} impressions, {Number(x.clicks).toLocaleString()} clicks</span><button className="text-destructive" onClick={() => del(x.id)}>Delete</button></li>)}</ul>
            <p className="mt-1 text-xs text-muted-foreground">Saving a date again replaces that day. Copy the figures exactly as TikTok shows them; this screen does not estimate anything.</p></div>
        </div>)}
    </li>
  );
}

function Catalog({ campaignId, setCampaignId }: { campaignId: string; setCampaignId: (v: string) => void }) {
  const qc = useQueryClient(); const { data: campaigns = [] } = useCampaigns(); const [q, setQ] = useState(''); const [vendor, setVendor] = useState('');
  const { data: products = [], isLoading } = useQuery<any[]>({
    queryKey: ['sponsored-catalogue'],
    queryFn: async () => { const { data, error } = await db.from('products').select('id, name, slug, price, image_url, vendor_id, vendors(store_name), categories(name)').order('created_at', { ascending: false }).limit(1000); if (error) throw error; return data; },
  });
  const inCampaign = new Set((campaigns.find(c => c.id === campaignId)?.sponsored_campaign_products ?? []).map((p: any) => p.product_id));
  const vendorList = [...new Map(products.map(p => [p.vendor_id, p.vendors?.store_name]).filter(([id]) => id) as [string, string][])];
  const shown = products.filter(p => (!vendor || p.vendor_id === vendor) && (!q || p.name.toLowerCase().includes(q.toLowerCase()))).slice(0, 100);
  const add = async (pid: string) => {
    if (!campaignId) return toast.error('Choose a campaign first');
    const { error } = await db.from('sponsored_campaign_products').insert({ campaign_id: campaignId, product_id: pid });
    if (!fail(error)) { toast.success('Added to the campaign'); qc.invalidateQueries({ queryKey: ['sponsored-campaigns'] }); }
  };
  return (
    <Panel title="Products uploaded by vendors" flush action={<div className="flex flex-wrap gap-2">
      <select className={selectClass} value={campaignId} onChange={e => setCampaignId(e.target.value)} aria-label="Campaign"><option value="">Choose campaign</option>{campaigns.filter(c => !['completed', 'rejected'].includes(c.status)).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      <select className={selectClass} value={vendor} onChange={e => setVendor(e.target.value)} aria-label="Vendor"><option value="">All vendors</option>{vendorList.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select>
      <Input className="h-9 w-44" placeholder="Search product" value={q} onChange={e => setQ(e.target.value)} /></div>}>
      <ul className="divide-y divide-border">{shown.map(p => (
        <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
          <span className="flex min-w-0 items-center gap-3">{p.image_url && <img src={p.image_url} alt="" className="h-10 w-10 rounded object-cover" loading="lazy" />}<span className="min-w-0"><span className="block truncate font-medium">{p.name}</span><span className="text-xs text-muted-foreground">{p.vendors?.store_name} · {p.categories?.name ?? 'No category'} · {naira(Number(p.price))}</span></span></span>
          <Button size="sm" variant="outline" disabled={inCampaign.has(p.id)} onClick={() => add(p.id)}>{inCampaign.has(p.id) ? 'In campaign' : 'Add'}</Button>
        </li>))}
        {!shown.length && <li className="px-4 py-6 text-center text-sm text-muted-foreground">{isLoading ? 'Loading...' : 'No products found.'}</li>}</ul>
    </Panel>
  );
}

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Panel } from '@/components/dashboard/DashboardShell';
import { supabase } from '@/integrations/supabase/client';
import { call } from '@/lib/ads/adsApi';
import { bannerUrl } from '@/lib/ads/adMedia';
import { normalizeSocial, SOCIAL_PLATFORMS } from '@/lib/ads/socialValidation';
import { campaignStatus, checkMessage, daysLeft, externalStatus, pct, PLATFORM_LABEL } from '@/lib/ads/adStatus';
import { errText, fmtDate, n, Stat, Status } from '@/components/ads/adUi';
import AdBoostSection from '@/components/dashboard/AdBoostSection';

type Overview = any;

export default function VendorAdvertisingTab({ vendorId }: { vendorId: string }) {
  const qc = useQueryClient();
  const refresh = () => { qc.invalidateQueries({ queryKey: ['ad-overview'] }); qc.invalidateQueries({ queryKey: ['ad-analytics'] }); };
  const { data: o, isLoading, error } = useQuery<Overview>({ queryKey: ['ad-overview', vendorId], queryFn: () => call('my_advertising_overview'), staleTime: 15_000 });
  const { data: stats } = useQuery<any>({ queryKey: ['ad-analytics', vendorId], queryFn: () => call('vendor_ad_analytics', { _days: 30 }), staleTime: 60_000 });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading advertising...</p>;
  if (error || !o) return <p className="text-sm text-destructive">Advertising could not be loaded. {errText(error)}</p>;
  const ent = o.entitlement, f = ent.features ?? {};

  return (
    <div className="space-y-5">
      <Panel title="Your advertising plan" action={<Link to="?tab=membership" className="text-sm font-medium text-primary hover:underline">{ent.active ? 'Manage plan' : 'Get a plan'}</Link>}>
        {ent.active ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Plan" value={String(ent.plan_slug).replace(/^./, (c: string) => c.toUpperCase())} />
            <Stat label={ent.renewal_status === 'expiring_soon' ? 'Expires soon' : 'Expires'} value={fmtDate(ent.expires_at)} />
            <Stat label="Banner creations used" value={`${ent.generations_used} / ${ent.generations_allowed}`} />
            <Stat label="Products per promotion" value={String(f.max_advertised_products ?? 0)} />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Homepage promotion, AI banners and social banners are included with a Silver or Premium plan. Your products stay listed and visible as normal on the free plan.</p>
        )}
        {ent.renewal_status === 'expired' && <p className="mt-3 text-sm text-amber-600">Your plan has expired. Renew it to bring your promotions back.</p>}
        {!o.settings.ads_enabled && <p className="mt-3 text-sm text-amber-600">Advertising is switched off for the marketplace right now.</p>}
      </Panel>

      <Campaigns o={o} vendorId={vendorId} onChange={refresh} />
      {ent.active && <Analytics stats={stats} />}
      <Social o={o} onChange={refresh} />
      <External o={o} vendorId={vendorId} onChange={refresh} />
    </div>
  );
}

function Campaigns({ o, vendorId, onChange }: { o: Overview; vendorId: string; onChange: () => void }) {
  const ent = o.entitlement;
  const [picking, setPicking] = useState(false);
  const campaigns: any[] = o.campaigns ?? [];
  return (
    <Panel title="Promotions" action={ent.active && (ent.features?.max_advertised_products ?? 0) > 0 && <Button size="sm" variant="outline" onClick={() => setPicking(true)}>Promote products</Button>}>
      {picking && <ProductPicker vendorId={vendorId} max={ent.features?.max_advertised_products ?? 0} onClose={() => setPicking(false)}
        onSave={async (ids) => { try { await call('vendor_create_product_campaign', { _product_ids: ids }); toast.success('Promotion created. Your banner is being made.'); setPicking(false); onChange(); } catch (e) { toast.error(errText(e)); } }} />}
      {!campaigns.length && <p className="text-sm text-muted-foreground">{ent.active ? 'Your shop promotion is created automatically after payment. It will appear here.' : 'No promotions yet.'}</p>}
      <div className="space-y-4">{campaigns.map((c) => <CampaignCard key={c.id} c={c} o={o} vendorId={vendorId} onChange={onChange} />)}</div>
    </Panel>
  );
}

function CampaignCard({ c, o, vendorId, onChange }: { c: any; o: Overview; vendorId: string; onChange: () => void }) {
  const info = campaignStatus(c.status);
  const banner = (o.banners ?? []).find((b: any) => b.campaign_id === c.id && b.image_url);
  const products = (o.campaign_products ?? []).filter((p: any) => p.campaign_id === c.id);
  const [h, setH] = useState(c.custom_headline ?? '');
  const [d, setD] = useState(c.custom_description ?? '');
  const [busy, setBusy] = useState(false);
  const [editProducts, setEditProducts] = useState(false);
  const ended = ['expired', 'cancelled', 'rejected'].includes(c.status);
  const wrap = async (fn: () => Promise<unknown>, ok: string) => { setBusy(true); try { await fn(); toast.success(ok); onChange(); } catch (e) { toast.error(errText(e)); } finally { setBusy(false); } };
  const problem = checkMessage(h, d);
  const url = c.banner_image_url ?? banner?.image_url;
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">{c.campaign_type === 'shop_promotion' ? 'Shop promotion' : 'Product promotion'}</p>
        <Status info={info} />
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">{info.hint} {c.status === 'active' && daysLeft(c.end_date)} · {fmtDate(c.start_date)} to {fmtDate(c.end_date)}</p>
      {c.admin_note && ['rejected', 'paused', 'pending_review'].includes(c.status) && <p className="mt-1 text-xs">Note from ITHUBAFRICA: {c.admin_note}</p>}
      {c.message_review === 'pending' && <p className="mt-1 text-xs text-amber-600">Your new wording is waiting for approval. The previous wording stays live until then.</p>}

      {url && (
        <div className="relative mt-3 aspect-[2/1] overflow-hidden rounded-xl bg-muted sm:aspect-[16/5]">
          <img src={bannerUrl(url, 'tablet', 800)} alt="Banner preview" className="h-full w-full object-cover" loading="lazy" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/70 to-transparent" />
          <div className="absolute inset-0 flex flex-col justify-center gap-1 p-4 text-white">
            <p className="text-xs font-semibold">{o.store_name ?? 'Your shop'}</p>
            <p className="font-heading text-lg font-bold sm:text-2xl">{c.headline}</p>
            {c.description && <p className="line-clamp-2 max-w-md text-xs text-white/85">{c.description}</p>}
          </div>
          <span className="absolute right-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-semibold uppercase text-white">Sponsored</span>
        </div>
      )}
      {!url && !ended && <p className="mt-2 text-xs text-muted-foreground">No banner yet.</p>}

      {c.campaign_type === 'product_promotion' && (
        <div className="mt-3">
          <p className="text-xs font-medium">Products ({products.length})</p>
          <div className="mt-1 flex flex-wrap gap-2">{products.map((p: any) => <span key={p.product_id} className="flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-xs">{p.thumb_url && <img src={p.thumb_url} alt="" className="h-5 w-5 rounded-full object-cover" />}{p.name}</span>)}</div>
          {!ended && <Button size="sm" variant="ghost" className="mt-1" onClick={() => setEditProducts(true)}>Change products</Button>}
          {editProducts && <ProductPicker vendorId={vendorId} max={o.entitlement.features?.max_advertised_products ?? 0} initial={products.map((p: any) => p.product_id)} onClose={() => setEditProducts(false)}
            onSave={async (ids) => { await wrap(() => call('vendor_set_campaign_products', { _campaign: c.id, _product_ids: ids }), 'Products updated.'); setEditProducts(false); }} />}
        </div>
      )}

      {!ended && <AdBoostSection campaignId={c.id} running={['active', 'paused', 'pending_review'].includes(c.status)} />}
      {!ended && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <div><Label className="text-xs">Headline (optional)</Label><Input value={h} maxLength={60} onChange={(e) => setH(e.target.value)} placeholder="Leave empty for the suggested headline" /></div>
          <div><Label className="text-xs">Description (optional)</Label><Textarea value={d} maxLength={160} rows={2} onChange={(e) => setD(e.target.value)} /></div>
          <p className="text-xs text-muted-foreground sm:col-span-2">{problem ?? 'Wording cannot include numbers, prices or claims such as free, guaranteed or discount. Your shop name and logo are added automatically.'}</p>
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        {!ended && <Button size="sm" disabled={busy || !!problem} onClick={() => wrap(async () => { const r = await call<string>('vendor_update_campaign_message', { _campaign: c.id, _headline: h, _description: d }); if (r === 'pending_review') toast.info('Sent for approval.'); }, 'Wording saved.')}>Save wording</Button>}
        {['active', 'paused', 'pending_review', 'failed'].includes(c.status) && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => { if (window.confirm('Create a new banner? This uses one of your banner creations.')) wrap(() => call('vendor_request_banner_regeneration', { _campaign: c.id }), 'A new banner is being created.'); }}>New banner</Button>)}
        {['active', 'paused'].includes(c.status) && <Button size="sm" variant="outline" disabled={busy} onClick={() => wrap(() => call('vendor_set_campaign_paused', { _campaign: c.id, _paused: c.status === 'active' }), c.status === 'active' ? 'Paused.' : 'Resumed.')}>{c.status === 'active' ? 'Pause' : 'Resume'}</Button>}
      </div>
    </div>
  );
}

function ProductPicker({ vendorId, max, initial = [], onSave, onClose }: { vendorId: string; max: number; initial?: string[]; onSave: (ids: string[]) => Promise<void>; onClose: () => void }) {
  const [sel, setSel] = useState<string[]>(initial);
  const [saving, setSaving] = useState(false);
  const { data: products = [], isLoading } = useQuery({
    queryKey: ['ad-products', vendorId],
    queryFn: async () => {
      const { data, error } = await supabase.from('products').select('id, name, image_url, thumb_url').eq('vendor_id', vendorId).eq('is_active', true).order('created_at', { ascending: false }).limit(200);
      if (error) throw error; return (data ?? []) as { id: string; name: string; image_url: string | null; thumb_url: string | null }[];
    },
  });
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= max ? s : [...s, id]));
  return (
    <div className="my-3 rounded-lg border border-border bg-muted/30 p-3">
      <p className="text-sm font-medium">Choose up to {max} products ({sel.length} selected)</p>
      {isLoading ? <p className="text-xs text-muted-foreground">Loading...</p> : !products.length ? <p className="text-xs text-muted-foreground">You have no active products yet.</p> : (
        <div className="mt-2 grid max-h-64 gap-1.5 overflow-auto sm:grid-cols-2">
          {products.map((p) => (
            <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded border border-border bg-background p-1.5 text-xs">
              <Checkbox checked={sel.includes(p.id)} onCheckedChange={() => toggle(p.id)} />
              {(p.thumb_url || p.image_url) && <img src={p.thumb_url || p.image_url!} alt="" className="h-8 w-8 rounded object-cover" loading="lazy" />}
              <span className="truncate">{p.name}</span>
            </label>))}
        </div>)}
      <div className="mt-2 flex gap-2">
        <Button size="sm" disabled={!sel.length || saving} onClick={async () => { setSaving(true); try { await onSave(sel); } finally { setSaving(false); } }}>Save</Button>
        <Button size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
      </div>
    </div>
  );
}

function Analytics({ stats }: { stats: any }) {
  if (!stats) return null;
  const rows: any[] = stats.campaigns ?? [];
  const tot = rows.reduce((a, r) => ({ i: a.i + r.impressions, c: a.c + r.clicks, s: a.s + r.shop_visits, p: a.p + r.product_visits }), { i: 0, c: 0, s: 0, p: 0 });
  const max = Math.max(1, ...(stats.daily ?? []).map((d: any) => d.impressions));
  return (
    <Panel title="Performance (real, measured events)">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Impressions" value={n(tot.i)} /><Stat label="Clicks" value={n(tot.c)} /><Stat label="Click rate" value={pct(tot.i ? (tot.c * 100) / tot.i : 0)} />
        <Stat label="Shop visits" value={n(tot.s)} /><Stat label="Product views" value={n(tot.p)} />
      </div>
      {!!stats.daily?.length && (
        <div className="mt-4 flex h-24 items-end gap-0.5" aria-label="Impressions per day">
          {stats.daily.map((d: any) => <div key={d.day} title={`${d.day}: ${d.impressions} impressions, ${d.clicks} clicks`} className="flex-1 rounded-t bg-primary/70" style={{ height: `${Math.max(2, (d.impressions / max) * 100)}%` }} />)}
        </div>)}
      <p className="mt-2 text-xs text-muted-foreground">Last {stats.days} days. Repeat views from the same visitor within 30 minutes are counted once. Sales are not attributed to promotions.</p>
      <p className="text-xs text-muted-foreground">Social banner: {n(stats.social?.impressions)} views, {n(stats.social?.clicks)} clicks.</p>
    </Panel>
  );
}

function Social({ o, onChange }: { o: Overview; onChange: () => void }) {
  const f = o.entitlement.features ?? {};
  const allowed = o.entitlement.active && f.social_banner_enabled;
  const profiles: any[] = o.social_profiles ?? [];
  const [platform, setPlatform] = useState<string>('instagram');
  const [url, setUrl] = useState(''); const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const check = url ? normalizeSocial(platform, url) : null;
  return (
    <Panel title="Social media links">
      <p className="mb-3 text-xs text-muted-foreground">Add links to your public profiles. Visitors to your shop see a small invitation to follow you. We never ask for a password and never connect to your account. {allowed ? `Your plan allows ${f.max_social_profiles} link(s).` : 'Social banners are included with a Silver or Premium plan; your saved links are kept.'}</p>
      {profiles.map((p) => (
        <div key={p.id} className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded border border-border p-2 text-sm">
          <span className="min-w-0 truncate"><b>{PLATFORM_LABEL[p.platform + '_ads'] ? p.platform : p.platform}</b> · @{p.handle} · <span className="text-xs text-muted-foreground">{p.verification_status}</span></span>
          <span className="flex items-center gap-2"><Switch checked={p.promo_enabled} disabled={busy || !allowed} onCheckedChange={async (v) => { try { await call('vendor_upsert_social_profile', { _platform: p.platform, _url: p.profile_url, _handle: p.handle, _display_name: p.display_name, _enabled: v }); onChange(); } catch (e) { toast.error(errText(e)); } }} aria-label="Show on my shop" />
            <Button size="sm" variant="ghost" onClick={async () => { if (!window.confirm('Remove this link?')) return; try { await call('vendor_delete_social_profile', { _id: p.id }); onChange(); } catch (e) { toast.error(errText(e)); } }}>Remove</Button></span>
        </div>))}
      <div className="grid gap-2 sm:grid-cols-4">
        <select className="h-10 rounded-md border border-input bg-background px-2 text-sm" value={platform} onChange={(e) => setPlatform(e.target.value)} aria-label="Platform">{SOCIAL_PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}</select>
        <Input className="sm:col-span-2" placeholder="https://www.instagram.com/yourshop" value={url} onChange={(e) => setUrl(e.target.value)} />
        <Input placeholder="Display name" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      {check && !check.ok && <p className="mt-1 text-xs text-destructive">{check.error}</p>}
      <Button size="sm" className="mt-2" disabled={busy || !allowed || !url || !name || (check ? !check.ok : true)}
        onClick={async () => { setBusy(true); try { await call('vendor_upsert_social_profile', { _platform: platform, _url: url, _handle: null, _display_name: name, _enabled: true }); toast.success('Saved.'); setUrl(''); setName(''); onChange(); } catch (e) { toast.error(errText(e)); } finally { setBusy(false); } }}>Add link</Button>
    </Panel>
  );
}

function External({ o, vendorId, onChange }: { o: Overview; vendorId: string; onChange: () => void }) {
  const f = o.entitlement.features ?? {};
  const allowed = o.entitlement.active && f.external_ads_enabled;
  const rows: any[] = o.external_campaigns ?? [];
  const [form, setForm] = useState({ platform: 'google_ads', scope: 'shop', objective: 'traffic', budget: '', days: '14', authorize: false });
  const [products, setProducts] = useState<string[]>([]);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <Panel title="Ads on Google, Facebook, Instagram and TikTok">
      <p className="mb-3 rounded-md bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">These are requests only. ITHUBAFRICA has not connected these ad platforms, so nothing is published automatically and no money is spent. A request shows as running only after the platform confirms it. Platform ad spend is separate from your ITHUBAFRICA plan.</p>
      {!allowed && <p className="mb-3 text-xs text-muted-foreground">External ad requests are included with the Premium plan.</p>}
      {rows.map((r) => { const s = externalStatus(r.status); return (
        <div key={r.id} className="mb-2 rounded border border-border p-2 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2"><span>{PLATFORM_LABEL[r.platform] ?? r.platform} · {r.scope === 'shop' ? 'whole shop' : `${(r.product_ids ?? []).length} product(s)`} · {r.duration_days} days</span><Status info={s} /></div>
          <p className="text-xs text-muted-foreground">{r.status_detail || s.hint}</p>
          {['draft', 'pending_integration', 'pending_review'].includes(r.status) && <Button size="sm" variant="ghost" onClick={async () => { if (!window.confirm('Cancel this request?')) return; try { await call('vendor_cancel_external_campaign', { _id: r.id }); onChange(); } catch (e) { toast.error(errText(e)); } }}>Cancel request</Button>}
        </div>); })}
      {allowed && (
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <select className="h-10 rounded-md border border-input bg-background px-2 text-sm" value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })} aria-label="Platform">{Object.entries(PLATFORM_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <select className="h-10 rounded-md border border-input bg-background px-2 text-sm" value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })} aria-label="Promote"><option value="shop">Whole shop</option><option value="products">Selected products</option></select>
          <select className="h-10 rounded-md border border-input bg-background px-2 text-sm" value={form.objective} onChange={(e) => setForm({ ...form, objective: e.target.value })} aria-label="Goal"><option value="traffic">Visits</option><option value="awareness">Awareness</option><option value="sales">Sales</option></select>
          <Input type="number" min={0} placeholder="Budget you want to spend (NGN)" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} />
          <Input type="number" min={1} max={90} placeholder="Days" value={form.days} onChange={(e) => setForm({ ...form, days: e.target.value })} />
          {form.scope === 'products' && <Button variant="outline" onClick={() => setPicking(true)}>{products.length} product(s) selected</Button>}
          <label className="flex items-center gap-2 text-xs sm:col-span-3"><Checkbox checked={form.authorize} onCheckedChange={(v) => setForm({ ...form, authorize: v === true })} /> I authorise this budget. It is paid to the ad platform, not to ITHUBAFRICA, and nothing is spent until the campaign is actually published.</label>
          <Button className="sm:col-span-3" disabled={busy} onClick={async () => { setBusy(true); try { await call('vendor_request_external_campaign', { _platform: form.platform, _scope: form.scope, _product_ids: form.scope === 'products' ? products : [], _objective: form.objective, _budget: form.budget ? Number(form.budget) : null, _duration_days: Number(form.days), _authorize_spend: form.authorize }); toast.success(form.authorize ? 'Request submitted.' : 'Draft saved.'); onChange(); } catch (e) { toast.error(errText(e)); } finally { setBusy(false); } }}>{form.authorize ? 'Submit request' : 'Save draft'}</Button>
        </div>)}
      {picking && <ProductPicker vendorId={vendorId} max={f.max_advertised_products ?? 0} initial={products} onClose={() => setPicking(false)} onSave={async (ids) => { setProducts(ids); setPicking(false); }} />}
    </Panel>
  );
}

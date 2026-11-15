import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Panel } from '@/components/dashboard/DashboardShell';
import { supabase } from '@/integrations/supabase/client';
import { call } from '@/lib/ads/adsApi';
import { bannerUrl } from '@/lib/ads/adMedia';
import { campaignStatus, externalStatus, pct, PLATFORM_LABEL } from '@/lib/ads/adStatus';
import { errText, fmtDate, n, Stat, Status } from '@/components/ads/adUi';
import ExternalExportPanel from '@/components/admin/ExternalExportPanel';
import AdBoostAdminPanel from '@/components/admin/AdBoostAdminPanel';
import GoogleAdsConnectionPanel from '@/components/admin/GoogleAdsConnectionPanel';

const TABS = ['campaigns', 'vendors', 'ai', 'social', 'external', 'analytics', 'settings'] as const;
type TabKey = typeof TABS[number];
const LABEL: Record<TabKey, string> = { campaigns: 'Campaigns', vendors: 'Vendors', ai: 'AI usage & jobs', social: 'Social links', external: 'External requests', analytics: 'Analytics', settings: 'Settings & plans' };

export default function AdminAdvertisingTab() {
  const [tab, setTab] = useState<TabKey>('campaigns');
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5" role="tablist">
        {TABS.map((t) => <Button key={t} size="sm" role="tab" aria-selected={tab === t} variant={tab === t ? 'default' : 'outline'} onClick={() => setTab(t)}>{LABEL[t]}</Button>)}
      </div>
      {tab === 'campaigns' && <CampaignsView />}
      {tab === 'vendors' && <VendorsView />}
      {tab === 'ai' && <AiView />}
      {tab === 'social' && <SocialView />}
      {tab === 'external' && <ExternalView />}
      {tab === 'analytics' && <AnalyticsView />}
      {tab === 'settings' && <SettingsView />}
    </div>
  );
}

function useAdmin<T = any>(key: string, fn: string, args?: Record<string, unknown>) {
  const qc = useQueryClient();
  const q = useQuery<T>({ queryKey: ['admin-ads', key, args], queryFn: () => call<T>(fn, args), staleTime: 10_000 });
  return { ...q, refresh: () => qc.invalidateQueries({ queryKey: ['admin-ads'] }) };
}
async function run(fn: () => Promise<unknown>, ok: string, refresh: () => void) {
  try { await fn(); toast.success(ok); refresh(); } catch (e) { toast.error(errText(e)); }
}
const Loading = ({ q }: { q: { isLoading: boolean; error: unknown } }) =>
  q.isLoading ? <p className="text-sm text-muted-foreground">Loading...</p> : q.error ? <p className="text-sm text-destructive">{errText(q.error)}</p> : null;

function CampaignsView() {
  const [status, setStatus] = useState('');
  const q = useAdmin<any[]>('campaigns', 'admin_list_ad_campaigns', { _status: status || null, _limit: 100 });
  return (
    <Panel title="Campaigns" action={<select className="h-8 rounded-md border border-input bg-background px-2 text-xs" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
      <option value="">All</option>{['pending_review', 'active', 'paused', 'pending_generation', 'generating', 'failed', 'rejected', 'expired', 'cancelled'].map((s) => <option key={s} value={s}>{campaignStatus(s).label}</option>)}</select>}>
      <Loading q={q} />
      {q.data && !q.data.length && <p className="text-sm text-muted-foreground">No campaigns.</p>}
      <div className="space-y-3">{q.data?.map((c) => <CampaignRow key={c.id} c={c} refresh={q.refresh} />)}</div>
    </Panel>
  );
}

function CampaignRow({ c, refresh }: { c: any; refresh: () => void }) {
  const [note, setNote] = useState('');
  const [prio, setPrio] = useState(String(c.priority ?? 0));
  const s = campaignStatus(c.status);
  const b = c.pending_banner;
  const img = b?.image_url ?? c.banner_image_url;
  return (
    <div className="rounded-lg border border-border p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">{c.store_name} <span className="text-xs font-normal text-muted-foreground">· {c.plan_slug} · {c.campaign_type === 'shop_promotion' ? 'shop' : 'products'}</span></p><Status info={s} />
      </div>
      <p className="text-xs text-muted-foreground">{fmtDate(c.start_date)} to {fmtDate(c.end_date)} · {n(c.impressions_count)} views · {n(c.clicks_count)} clicks · CTR {pct(c.ctr)} · placements: {(c.placements ?? []).join(', ')}</p>
      {img && <img src={bannerUrl(img, 'tablet', 600)} alt="Banner artwork" className="mt-2 aspect-[2/1] w-full max-w-md rounded-lg object-cover" loading="lazy" />}
      {(b || c.headline) && <p className="mt-1"><b>{b?.headline ?? c.headline}</b> {b?.description ?? c.description}</p>}
      {c.message_review === 'pending' && (
        <p className="mt-1 text-xs">Vendor wording awaiting review: <b>{c.pending_headline}</b> {c.pending_description}
          <Button size="sm" variant="outline" className="ml-2" onClick={() => run(() => call('admin_review_message', { _campaign: c.id, _approve: true }), 'Wording approved.', refresh)}>Approve</Button>
          <Button size="sm" variant="ghost" onClick={() => run(() => call('admin_review_message', { _campaign: c.id, _approve: false }), 'Wording rejected.', refresh)}>Reject</Button></p>)}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {b && <><Button size="sm" onClick={() => run(() => call('admin_review_banner', { _banner: b.id, _approve: true, _note: note || null }), 'Banner approved.', refresh)}>Approve banner</Button>
          <Button size="sm" variant="outline" onClick={() => run(() => call('admin_review_banner', { _banner: b.id, _approve: false, _note: note || null }), 'Banner rejected.', refresh)}>Reject banner</Button></>}
        {c.status === 'active' && <Button size="sm" variant="outline" onClick={() => run(() => call('admin_set_campaign_status', { _campaign: c.id, _status: 'paused', _note: note || null }), 'Paused.', refresh)}>Pause</Button>}
        {['paused', 'pending_review'].includes(c.status) && !b && <Button size="sm" variant="outline" onClick={() => run(() => call('admin_set_campaign_status', { _campaign: c.id, _status: 'active', _note: note || null }), 'Activated.', refresh)}>Activate</Button>}
        {!['rejected', 'cancelled', 'expired'].includes(c.status) && <Button size="sm" variant="ghost" onClick={() => { if (window.confirm('Reject this campaign?')) run(() => call('admin_set_campaign_status', { _campaign: c.id, _status: 'rejected', _note: note || null }), 'Rejected.', refresh); }}>Reject</Button>}
        {!['rejected', 'cancelled', 'expired'].includes(c.status) && <Button size="sm" variant="ghost" onClick={() => run(() => call('admin_request_banner_revision', { _campaign: c.id, _note: note || null }), 'New banner requested (does not use the vendor quota).', refresh)}>Request new banner</Button>}
        <Input className="h-8 w-48" placeholder="Note to vendor (optional)" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
        <span className="flex items-center gap-1 text-xs">Priority <Input className="h-8 w-16" type="number" min={0} max={100} value={prio} onChange={(e) => setPrio(e.target.value)} />
          <Button size="sm" variant="ghost" onClick={() => run(() => call('admin_set_campaign_priority', { _campaign: c.id, _priority: Number(prio) }), 'Priority saved.', refresh)}>Save</Button></span>
      </div>
    </div>
  );
}

function VendorsView() {
  const q = useAdmin<any[]>('vendors', 'admin_list_ad_vendors');
  return (
    <Panel title="Vendors with a paid plan" flush>
      <Loading q={q} />
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-left text-xs text-muted-foreground"><tr><th className="p-2">Shop</th><th>Plan</th><th>Status</th><th>Expires</th><th>Promotion</th><th>Latest campaign</th></tr></thead>
        <tbody>{q.data?.map((v) => <tr key={v.vendor_id} className="border-t border-border"><td className="p-2">{v.store_name}</td><td>{v.plan_slug}</td><td>{v.currently_active ? 'Active' : 'Not active'}</td><td>{fmtDate(v.expires_at)}</td><td>{v.homepage_promotion ? 'Included' : 'No'}</td><td>{v.latest_campaign_status ? campaignStatus(v.latest_campaign_status).label : '-'}</td></tr>)}</tbody></table></div>
    </Panel>
  );
}

function AiView() {
  const u = useAdmin<any>('usage', 'admin_ai_usage_summary');
  const [st, setSt] = useState('');
  const j = useAdmin<any[]>('jobs', 'admin_list_generation_jobs', { _status: st || null, _limit: 100 });
  const d = u.data;
  return (
    <div className="space-y-4">
      <Panel title="AI usage">
        <Loading q={u} />
        {d && <><div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Attempts today" value={`${n(d.attempts_today)} / ${n(d.daily_limit)}`} /><Stat label="Est. cost this month" value={`$${Number(d.estimated_cost_month_usd).toFixed(2)} / $${Number(d.monthly_budget_usd).toFixed(0)}`} />
          <Stat label="Queued / running" value={`${n(d.queued)} / ${n(d.running)}`} /><Stat label="Failed / succeeded (30d)" value={`${n(d.failed_30d)} / ${n(d.succeeded_30d)}`} /></div>
          <p className="mt-2 text-xs text-muted-foreground">Costs are estimates from the per-image price you set in Settings. Check your OpenAI billing page for the real figure.</p></>}
      </Panel>
      <Panel title="Generation jobs" action={<select className="h-8 rounded-md border border-input bg-background px-2 text-xs" value={st} onChange={(e) => setSt(e.target.value)} aria-label="Filter"><option value="">All</option>{['queued', 'running', 'succeeded', 'failed', 'cancelled'].map((s) => <option key={s}>{s}</option>)}</select>} flush>
        <Loading q={j} />
        <div className="overflow-x-auto"><table className="w-full text-xs"><thead className="text-left text-muted-foreground"><tr><th className="p-2">Shop</th><th>Kind</th><th>Status</th><th>Attempts</th><th>Error</th><th>Created</th></tr></thead>
          <tbody>{j.data?.map((x) => <tr key={x.id} className="border-t border-border"><td className="p-2">{x.store_name}</td><td>{x.kind}</td><td>{x.status}</td><td>{x.attempts}/{x.max_attempts}</td><td className="max-w-xs truncate" title={x.error ?? ''}>{x.error_code ?? ''} {x.error ?? ''}</td><td>{fmtDate(x.created_at)}</td></tr>)}</tbody></table></div>
      </Panel>
    </div>
  );
}

function SocialView() {
  const q = useAdmin<any[]>('social', 'admin_list_social_profiles');
  return (
    <Panel title="Vendor social links" flush>
      <Loading q={q} />
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-left text-xs text-muted-foreground"><tr><th className="p-2">Shop</th><th>Platform</th><th>Link</th><th>Shown</th><th>Verification</th></tr></thead>
        <tbody>{q.data?.map((p) => <tr key={p.id} className="border-t border-border"><td className="p-2">{p.store_name}</td><td>{p.platform}</td>
          <td><a className="text-primary hover:underline" href={p.profile_url} target="_blank" rel="noopener noreferrer nofollow">@{p.handle}</a></td><td>{p.promo_enabled ? 'Yes' : 'No'}</td>
          <td><select className="h-8 rounded-md border border-input bg-background px-1 text-xs" value={p.verification_status} aria-label="Verification" onChange={(e) => run(() => call('admin_set_social_verification', { _profile: p.id, _status: e.target.value }), 'Saved.', q.refresh)}>
            {['unverified', 'verified', 'rejected'].map((s) => <option key={s}>{s}</option>)}</select></td></tr>)}</tbody></table></div>
      <p className="p-3 text-xs text-muted-foreground">Links are accepted automatically when a vendor saves a valid username, so they show straight away. That only checks the link is well formed, not who owns the account. Open a link to check it, and set it to rejected if it is not the vendor's real page: it stops showing and stays rejected.</p>
    </Panel>
  );
}

function ExternalView() {
  const q = useAdmin<any[]>('external', 'admin_list_external_campaigns');
  return (
    <div className="space-y-4">
    <GoogleAdsConnectionPanel />
    <Panel title="External ad requests">
      <p className="mb-3 rounded-md bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">Campaigns are not created in Google or the other platforms from here yet, so a request can never be marked running here. The connection test above only checks your Google Ads keys. Review it, then run the campaign yourself in the platform's own ads manager if you choose to, and keep the status truthful.</p>
      <Loading q={q} />
      <div className="space-y-2">{q.data?.map((r) => { const s = externalStatus(r.status); return (
        <div key={r.id} className="rounded border border-border p-2 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2"><span>{r.store_name} · {PLATFORM_LABEL[r.platform] ?? r.platform} · {r.scope} · {r.objective} · {r.duration_days} days · budget {r.budget_amount ?? '-'} {r.spend_authorized ? '(authorised)' : '(not authorised)'}</span><Status info={s} /></div>
          <ExternalExportPanel request={r} />
          <div className="mt-1 flex flex-wrap gap-1.5">{['pending_review', 'rejected', 'paused', 'ended', 'cancelled', 'failed'].filter((x) => x !== r.status).map((x) =>
            <Button key={x} size="sm" variant="outline" onClick={() => run(() => call('admin_set_external_status', { _id: r.id, _status: x, _note: null }), 'Updated.', q.refresh)}>{externalStatus(x).label}</Button>)}</div>
        </div>); })}</div>
    </Panel>
    </div>
  );
}

function AnalyticsView() {
  const q = useAdmin<any>('analytics', 'admin_ad_analytics', { _days: 30 });
  const d = q.data;
  return (
    <Panel title="Advertising analytics (last 30 days, measured events)">
      <Loading q={q} />
      {d && <>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-6"><Stat label="Impressions" value={n(d.totals.impressions)} /><Stat label="Clicks" value={n(d.totals.clicks)} /><Stat label="Click rate" value={pct(d.totals.ctr)} /><Stat label="Shop visits" value={n(d.totals.shop_visits)} /><Stat label="Product visits" value={n(d.totals.product_visits)} /><Stat label="Social clicks" value={n(d.totals.social_clicks)} /></div>
        <h3 className="mt-4 text-sm font-medium">By placement</h3>
        <ul className="text-sm">{d.by_placement.map((p: any) => <li key={p.placement}>{p.placement}: {n(p.impressions)} views, {n(p.clicks)} clicks</li>)}</ul>
        <h3 className="mt-4 text-sm font-medium">Most viewed campaigns</h3>
        <div className="overflow-x-auto"><table className="w-full text-xs"><thead className="text-left text-muted-foreground"><tr><th className="p-1">Shop</th><th>Status</th><th>Views</th><th>Clicks</th><th>CTR</th><th>Shop visits</th></tr></thead>
          <tbody>{d.top_campaigns.map((c: any) => <tr key={c.id} className="border-t border-border"><td className="p-1">{c.store_name}</td><td>{campaignStatus(c.status).label}</td><td>{n(c.impressions)}</td><td>{n(c.clicks)}</td><td>{pct(c.ctr)}</td><td>{n(c.shop_visits)}</td></tr>)}</tbody></table></div>
        <div className="mt-3"><Button size="sm" variant="outline" onClick={() => { if (window.confirm('Delete detailed ad events older than 180 days? Campaign totals are kept.')) run(() => call('admin_purge_ad_events', { _older_than_days: 180 }), 'Old events removed.', q.refresh); }}>Remove events older than 180 days</Button>
          <Button size="sm" variant="ghost" onClick={() => run(() => call('admin_sweep_expired_campaigns'), 'Statuses refreshed.', q.refresh)}>Refresh expired statuses</Button></div>
      </>}
    </Panel>
  );
}

const SETTING_FIELDS: [string, string, 'bool' | 'num'][] = [
  ['ads_enabled', 'Advertising on', 'bool'], ['require_approval', 'Admin approval before a banner goes live', 'bool'],
  ['featured_banner_limit', 'Featured banners (1-10)', 'num'], ['sponsored_banner_limit', 'Sponsored banners between rows (0-12)', 'num'], ['sponsored_row_interval', 'Sponsored banner after every N rows (1-20)', 'num'],
  ['rotating_limit', 'Rotating banner pool (1-24)', 'num'], ['rotation_minutes', 'Rotate every N minutes', 'num'],
  ['social_banner_enabled', 'Social banner on shops', 'bool'], ['social_display_minutes', 'Social banner stays for N minutes', 'num'], ['social_rotation_minutes', 'Minutes between showings', 'num'],
  ['social_max_per_day', 'Max showings per visitor per day', 'num'], ['social_dismiss_hours', 'Hours hidden after a visitor closes it', 'num'],
  ['ai_generation_enabled', 'AI banner generation on', 'bool'], ['ai_daily_limit', 'AI attempts per day', 'num'], ['ai_monthly_budget_usd', 'AI monthly budget (USD)', 'num'],
  ['ai_cost_per_image_usd', 'Estimated cost per image (USD)', 'num'], ['ai_max_attempts', 'Attempts per job (1-6)', 'num'], ['regen_cooldown_minutes', 'Minutes between vendor regenerations', 'num'],
];
const PLAN_FIELDS: [string, string, 'bool' | 'num'][] = [
  ['homepage_promotion_enabled', 'Homepage promotion', 'bool'], ['featured_banner_enabled', 'Featured banner', 'bool'], ['sponsored_placement_enabled', 'Sponsored rows', 'bool'],
  ['social_banner_enabled', 'Social banner', 'bool'], ['external_ads_enabled', 'External ad requests', 'bool'], ['max_advertised_products', 'Products per promotion', 'num'],
  ['campaign_duration_days', 'Promotion days', 'num'], ['max_social_profiles', 'Social links (0-3)', 'num'], ['banner_generations_allowed', 'Banner creations per period', 'num'], ['priority_weight', 'Rotation weight (1-10)', 'num'],
];

function SettingsView() {
  const qc = useQueryClient();
  const s = useQuery({ queryKey: ['admin-ads', 'settings'], queryFn: async () => { const { data, error } = await supabase.from('advertising_settings' as any).select('*').eq('id', true).maybeSingle(); if (error) throw error; return data as any; } });
  const p = useQuery({ queryKey: ['admin-ads', 'plans'], queryFn: async () => { const { data, error } = await supabase.from('advertising_plan_features' as any).select('*').order('plan_slug'); if (error) throw error; return (data ?? []) as any[]; } });
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin-ads'] });
  const save = async (table: string, match: Record<string, unknown>, patch: Record<string, unknown>) => {
    try { let q: any = (supabase as any).from(table).update({ ...patch, updated_at: new Date().toISOString() }); for (const [k, v] of Object.entries(match)) q = q.eq(k, v); const { error } = await q; if (error) throw error; toast.success('Saved.'); refresh(); } catch (e) { toast.error(errText(e)); }
  };
  return (
    <div className="space-y-4">
      <AdBoostAdminPanel />
      <Panel title="Advertising settings"><Loading q={s} />
        {s.data && <div className="grid gap-3 sm:grid-cols-2">{SETTING_FIELDS.map(([k, label, type]) => type === 'bool'
          ? <label key={k} className="flex items-center justify-between gap-3 text-sm">{label}<Switch checked={!!s.data[k]} onCheckedChange={(v) => save('advertising_settings', { id: true }, { [k]: v })} /></label>
          : <NumField key={k} label={label} value={s.data[k]} onSave={(v) => save('advertising_settings', { id: true }, { [k]: v })} />)}</div>}
      </Panel>
      <Panel title="What each plan includes"><Loading q={p} />
        <p className="mb-3 text-xs text-muted-foreground">Plan prices, duration and on/off for buying are set in Supplier plans. Values below are starting points; change them freely.</p>
        <div className="grid gap-4 lg:grid-cols-3">{p.data?.map((row) => (
          <div key={row.plan_slug} className="rounded-lg border border-border p-3"><p className="mb-2 font-medium capitalize">{row.plan_slug}</p>
            <div className="space-y-2">{PLAN_FIELDS.map(([k, label, type]) => type === 'bool'
              ? <label key={k} className="flex items-center justify-between gap-3 text-sm">{label}<Switch checked={!!row[k]} onCheckedChange={(v) => save('advertising_plan_features', { plan_slug: row.plan_slug }, { [k]: v })} /></label>
              : <NumField key={k} label={label} value={row[k]} onSave={(v) => save('advertising_plan_features', { plan_slug: row.plan_slug }, { [k]: v })} />)}</div></div>))}</div>
      </Panel>
    </div>
  );
}

function NumField({ label, value, onSave }: { label: string; value: number; onSave: (v: number) => void }) {
  const [v, setV] = useState(String(value ?? ''));
  return <label className="flex items-center justify-between gap-3 text-sm">{label}<span className="flex gap-1"><Input className="h-8 w-24" type="number" value={v} onChange={(e) => setV(e.target.value)} />
    <Button size="sm" variant="ghost" disabled={v === '' || Number(v) === Number(value)} onClick={() => onSave(Number(v))}>Save</Button></span></label>;
}

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Panel } from '@/components/dashboard/DashboardShell';
import { supabase } from '@/integrations/supabase/client';
import { formatNaira } from '@/lib/format';

const db = supabase as any;
const naira = (k: unknown) => formatNaira(Number(k ?? 0) / 100);
const day = (v?: string | null) => (v ? new Date(v).toLocaleDateString() : '-');
const sel = 'h-10 rounded-md border border-input bg-background px-3 text-sm';
const VIEWS = ['overview', 'referrers', 'commissions', 'withdrawals', 'settings'] as const;
type View = typeof VIEWS[number];
const LABEL: Record<View, string> = { overview: 'Overview', referrers: 'Referrers', commissions: 'Commissions', withdrawals: 'Withdrawals', settings: 'Settings and rates' };

function csv(rows: Record<string, unknown>[], name: string) {
  if (!rows.length) { toast.error('Nothing to export'); return; }
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => { let s = v == null ? '' : String(v); if (/^[=+\-@]/.test(s)) s = `'${s}`; return `"${s.replace(/"/g, '""')}"`; };
  const body = [cols.join(','), ...rows.map(r => cols.map(c => esc(r[c])).join(','))].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([body], { type: 'text/csv' }));
  a.download = name; a.click(); URL.revokeObjectURL(a.href);
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return <div className="rounded-lg border border-border p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="font-heading text-lg font-bold">{value}</p>{hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}</div>;
}

export default function ReferralAdminTab() {
  const qc = useQueryClient();
  const [view, setView] = useState<View>('overview');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [cStatus, setCStatus] = useState('');
  const [aff, setAff] = useState({ email: '', code: '', name: '', rate: '13', bio: '', pub: true });
  const [rate, setRate] = useState({ def: '', agreement: '', cohort: '', reason: '' });
  const [st, setSt] = useState<any>(null);

  const rpc = (fn: string, args?: Record<string, unknown>) => async () => (await db.rpc(fn, args)) as { data?: any; error?: { message: string } | null };
  const q = (key: string, fn: string, args?: Record<string, unknown>, enabled = true) => useQuery<any>({ queryKey: ['adm-ref', key, JSON.stringify(args ?? {})], enabled, queryFn: async () => { const { data, error } = await db.rpc(fn, args); if (error) throw error; return data; } });
  const ov = q('overview', 'admin_referral_overview', undefined, view === 'overview');
  const refs = q('referrers', 'admin_referrers', undefined, view === 'referrers');
  const coms = q('commissions', 'admin_referral_commissions', { _status: cStatus || null, _limit: 300 }, view === 'commissions');
  const wds = q('withdrawals', 'admin_referral_withdrawals', undefined, view === 'withdrawals');
  const { data: settings } = useQuery<any>({ queryKey: ['adm-ref-settings'], enabled: view === 'settings', queryFn: async () => (await db.from('referral_settings').select('*').maybeSingle()).data });
  const { data: agreements = [] } = useQuery<any[]>({ queryKey: ['adm-ref-agreements'], enabled: view === 'settings', queryFn: async () => (await db.from('referral_agreements').select('id,name,rate_percent,is_default').order('created_at', { ascending: false })).data ?? [] });
  const { data: changes = [] } = useQuery<any[]>({ queryKey: ['adm-ref-changes'], enabled: view === 'settings', queryFn: async () => (await db.from('referral_rate_changes').select('*').order('at', { ascending: false }).limit(30)).data ?? [] });
  const { data: audit = [] } = useQuery<any[]>({ queryKey: ['adm-ref-audit'], enabled: view === 'settings', queryFn: async () => (await db.from('referral_audit_logs').select('at,action,entity_type,entity_id').order('at', { ascending: false }).limit(40)).data ?? [] });

  const act = async (fn: () => Promise<{ error?: { message: string } | null }>, ok: string) => {
    setBusy(true);
    try { const { error } = await fn(); if (error) { toast.error(error.message); return; } toast.success(ok); qc.invalidateQueries({ queryKey: ['adm-ref'] }); ['adm-ref-settings', 'adm-ref-agreements', 'adm-ref-changes', 'adm-ref-audit'].forEach(k => qc.invalidateQueries({ queryKey: [k] })); }
    catch (e: any) { toast.error(e?.message ?? 'Something went wrong'); } finally { setBusy(false); }
  };
  const needNote = () => { if (note.trim().length < 3) { toast.error('Write a note or reason first'); return false; } return true; };
  const s = st ?? settings;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" role="tablist">
        {VIEWS.map(v => <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${view === v ? 'bg-primary text-primary-foreground' : 'border border-border'}`}>{LABEL[v]}</button>)}
      </div>

      {view === 'overview' && (ov.data ? (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Suppliers referred" value={ov.data.vendors_acquired} />
            <Stat label="Paying" value={ov.data.vendors_paying} hint={`${ov.data.conversion_percent ?? 0}% converted`} />
            <Stat label="Renewal rate" value={`${ov.data.renewal_percent ?? 0}%`} />
            <Stat label="Revenue from referred suppliers" value={naira(ov.data.revenue_kobo)} />
            <Stat label="Commission generated" value={naira(ov.data.generated_kobo)} />
            <Stat label="Held" value={naira(Number(ov.data.pending_kobo) + Number(ov.data.approved_kobo))} />
            <Stat label="Paid out" value={naira(ov.data.paid_kobo)} />
            <Stat label="Reversed" value={naira(ov.data.reversed_kobo)} />
            <Stat label="Owed to the platform" value={naira(ov.data.debts_kobo)} hint="Reversed after payout" />
            <Stat label="Still owed to referrers" value={naira(ov.data.liability_kobo)} />
          </div>
          <Panel title="Rate groups" flush>
            <ul className="divide-y divide-border text-sm">
              {(ov.data.cohorts ?? []).map((c: any, i: number) => <li key={i} className="flex flex-wrap justify-between gap-2 px-4 py-2"><span>{c.name} · {c.rate_percent}%</span><span>{c.vendors} suppliers</span><span>{naira(c.liability_kobo)} owed</span></li>)}
              {(ov.data.cohorts ?? []).length === 0 && <li className="px-4 py-3 text-muted-foreground">No referrals yet.</li>}
            </ul>
          </Panel>
        </>
      ) : <p className="text-sm text-muted-foreground">{ov.error ? 'Could not load. Run the referral migrations first.' : 'Loading...'}</p>)}

      {view === 'referrers' && (
        <>
          <Panel title="Create an affiliate or celebrity account">
            <div className="grid gap-2 sm:grid-cols-3">
              <Input placeholder="Their account email" value={aff.email} onChange={e => setAff({ ...aff, email: e.target.value })} aria-label="Email" />
              <Input placeholder="Code (e.g. AMAKA10)" value={aff.code} onChange={e => setAff({ ...aff, code: e.target.value.toUpperCase() })} aria-label="Code" />
              <Input placeholder="Public name" value={aff.name} onChange={e => setAff({ ...aff, name: e.target.value })} aria-label="Public name" />
              <Input placeholder="Rate %" inputMode="decimal" value={aff.rate} onChange={e => setAff({ ...aff, rate: e.target.value.replace(/[^\d.]/g, '') })} aria-label="Rate" />
              <Input className="sm:col-span-2" placeholder="Short public bio (optional)" value={aff.bio} onChange={e => setAff({ ...aff, bio: e.target.value })} aria-label="Bio" />
            </div>
            <label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={aff.pub} onChange={e => setAff({ ...aff, pub: e.target.checked })} />Show a public page at /ref/CODE</label>
            <Button type="button" className="mt-2" disabled={busy || !aff.email || !aff.code} onClick={() => act(rpc('admin_create_affiliate', { _email: aff.email.trim(), _code: aff.code.trim(), _display_name: aff.name.trim(), _rate: Number(aff.rate), _bio: aff.bio, _public_page: aff.pub }), 'Affiliate created')}>Create affiliate</Button>
            <p className="mt-1 text-xs text-muted-foreground">The person must already have an account with that email.</p>
          </Panel>
          <Input placeholder="Reason for suspend or reactivate" value={note} onChange={e => setNote(e.target.value)} aria-label="Reason" />
          <Panel title="Referrers" flush action={<Button type="button" size="sm" variant="outline" onClick={() => csv(refs.data ?? [], 'referrers.csv')}><Download className="mr-1 h-4 w-4" />CSV</Button>}>
            <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-xs text-muted-foreground"><tr><th className="px-4 py-2">Name</th><th>Code</th><th>Type</th><th>Rate</th><th>Referred</th><th>Active</th><th>Earned</th><th>Owed</th><th /></tr></thead>
              <tbody className="divide-y divide-border">
                {(refs.data ?? []).map((r: any) => (
                  <tr key={r.user_id}><td className="px-4 py-2">{r.display_name}{r.status !== 'active' ? ' (suspended)' : ''}</td><td>{r.code}</td><td>{r.kind}</td><td>{r.rate_percent}%</td><td>{r.vendors_referred}</td><td>{r.active_vendors}</td><td>{naira(r.earned_kobo)}</td><td>{naira(r.owed_kobo)}</td>
                    <td><Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => { if (!needNote()) return; act(rpc('admin_set_referral_status', { _user: r.user_id, _status: r.status === 'active' ? 'suspended' : 'active', _reason: note.trim() }), 'Updated'); }}>{r.status === 'active' ? 'Suspend' : 'Reactivate'}</Button></td></tr>
                ))}
              </tbody></table></div>
          </Panel>
        </>
      )}

      {view === 'commissions' && (
        <>
          <div className="flex flex-wrap gap-2">
            <select className={sel} value={cStatus} onChange={e => setCStatus(e.target.value)} aria-label="Status filter"><option value="">All</option>{['pending', 'approved', 'available', 'processing', 'paid', 'reversed'].map(x => <option key={x}>{x}</option>)}</select>
            <Input className="min-w-[14rem] flex-1" placeholder="Reason for reversing" value={note} onChange={e => setNote(e.target.value)} aria-label="Reason" />
            <Button type="button" variant="outline" onClick={() => csv(coms.data ?? [], 'commissions.csv')}><Download className="mr-1 h-4 w-4" />CSV</Button>
          </div>
          <Panel flush><div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left text-sm">
            <thead className="text-xs text-muted-foreground"><tr><th className="px-4 py-2">Date</th><th>Referrer</th><th>Supplier</th><th>Plan</th><th>Payment</th><th>Rate</th><th>Commission</th><th>Status</th><th /></tr></thead>
            <tbody className="divide-y divide-border">
              {(coms.data ?? []).map((c: any) => (
                <tr key={c.id}><td className="px-4 py-2">{day(c.created_at)}</td><td>{c.referrer} ({c.code})</td><td>{c.vendor}</td><td>{c.plan_slug}</td><td>{naira(c.base_amount_kobo)}</td><td>{c.rate_percent}%</td><td className="font-medium">{naira(c.amount_kobo)}</td><td>{c.status}</td>
                  <td className="space-x-1 whitespace-nowrap">
                    {c.status === 'pending' && <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => act(rpc('admin_approve_commission_now', { _id: c.id }), 'Released')}>Release now</Button>}
                    {['pending', 'approved', 'available', 'paid'].includes(c.status) && <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => { if (!needNote()) return; act(rpc('admin_reverse_commission', { _id: c.id, _reason: note.trim() }), 'Reversed'); }}>Reverse</Button>}
                  </td></tr>
              ))}
            </tbody></table></div></Panel>
        </>
      )}

      {view === 'withdrawals' && (
        <>
          <Input placeholder="Note or bank transfer reference" value={note} onChange={e => setNote(e.target.value)} aria-label="Note or reference" />
          <Panel title="Withdrawal requests" flush action={<Button type="button" size="sm" variant="outline" onClick={() => csv((wds.data ?? []).map((w: any) => ({ ...w, account: JSON.stringify(w.account) })), 'withdrawals.csv')}><Download className="mr-1 h-4 w-4" />CSV</Button>}>
            <ul className="divide-y divide-border text-sm">
              {(wds.data ?? []).map((w: any) => (
                <li key={w.id} className="space-y-1 px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">{w.referrer} ({w.code})</span><span>{day(w.requested_at)}</span><span className="font-medium">{naira(w.net_kobo)}</span><span>{w.status}</span></div>
                  <p className="text-xs text-muted-foreground">Gross {naira(w.gross_kobo)} − owed back {naira(w.debt_kobo)} − fee {naira(w.fee_kobo)} · {w.account?.bank_name} {w.account?.account_number} {w.account?.account_name}{w.payout_reference ? ` · ref ${w.payout_reference}` : ''}</p>
                  <div className="flex flex-wrap gap-2">
                    {w.status === 'requested' && <><Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => act(rpc('admin_review_referral_withdrawal', { _id: w.id, _decision: 'approved', _note: note.trim() }), 'Approved')}>Approve</Button>
                      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => { if (!needNote()) return; act(rpc('admin_review_referral_withdrawal', { _id: w.id, _decision: 'rejected', _note: note.trim() }), 'Rejected'); }}>Reject</Button></>}
                    {w.status === 'approved' && <Button type="button" size="sm" variant="cta" disabled={busy} onClick={() => { if (!needNote()) return; act(rpc('admin_mark_referral_withdrawal_paid', { _id: w.id, _reference: note.trim() }), 'Marked paid'); }}>Mark as paid (after you send the transfer)</Button>}
                  </div>
                </li>
              ))}
              {(wds.data ?? []).length === 0 && <li className="px-4 py-3 text-muted-foreground">No withdrawal requests.</li>}
            </ul>
          </Panel>
        </>
      )}

      {view === 'settings' && s && (
        <>
          <Panel title="Programme settings">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!s.programme_enabled} onChange={e => setSt({ ...s, programme_enabled: e.target.checked })} />Referral programme is on (turning it off stops new referrals and new commissions)</label>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <label className="text-xs">Hold days<Input inputMode="numeric" value={s.hold_days} onChange={e => setSt({ ...s, hold_days: Number(e.target.value.replace(/\D/g, '') || 0) })} /></label>
              <label className="text-xs">Minimum withdrawal (naira)<Input inputMode="numeric" value={Math.round(Number(s.min_withdrawal_kobo) / 100)} onChange={e => setSt({ ...s, min_withdrawal_kobo: Number(e.target.value.replace(/\D/g, '') || 0) * 100 })} /></label>
              <label className="text-xs">Withdrawal fee (naira)<Input inputMode="numeric" value={Math.round(Number(s.withdrawal_fee_kobo) / 100)} onChange={e => setSt({ ...s, withdrawal_fee_kobo: Number(e.target.value.replace(/\D/g, '') || 0) * 100 })} /></label>
            </div>
            <label className="mt-2 block text-xs">Terms note shown to referrers<Input value={s.terms_note ?? ''} onChange={e => setSt({ ...s, terms_note: e.target.value })} /></label>
            <Button type="button" className="mt-3" disabled={busy} onClick={() => act(rpc('admin_update_referral_settings', { _enabled: !!s.programme_enabled, _hold_days: s.hold_days, _min_kobo: s.min_withdrawal_kobo, _fee_kobo: s.withdrawal_fee_kobo, _methods: s.withdrawal_methods ?? ['bank_transfer'], _terms: s.terms_note ?? '' }), 'Settings saved')}>Save settings</Button>
          </Panel>

          <Panel title="Commission rates">
            <p className="text-sm text-muted-foreground">A new default rate applies only to suppliers referred after the change. Existing suppliers keep the rate they joined with unless you change their group below, which is recorded with your reason.</p>
            <Input className="mt-2" placeholder="Reason for any rate change" value={rate.reason} onChange={e => setRate({ ...rate, reason: e.target.value })} aria-label="Reason" />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Input className="w-28" placeholder="New %" inputMode="decimal" value={rate.def} onChange={e => setRate({ ...rate, def: e.target.value.replace(/[^\d.]/g, '') })} aria-label="New default rate" />
              <Button type="button" disabled={busy || !rate.def} onClick={() => { if (rate.reason.trim().length < 3) { toast.error('Write a reason'); return; } act(rpc('admin_set_default_rate', { _rate: Number(rate.def), _name: '', _reason: rate.reason.trim() }), 'Default rate changed for new referrals'); }}>Set default for new referrals</Button>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <select className={sel} value={rate.agreement} onChange={e => setRate({ ...rate, agreement: e.target.value })} aria-label="Group"><option value="">Choose an existing group</option>{agreements.map(a => <option key={a.id} value={a.id}>{a.name} ({a.rate_percent}%){a.is_default ? ' default' : ''}</option>)}</select>
              <Input className="w-28" placeholder="New %" inputMode="decimal" value={rate.cohort} onChange={e => setRate({ ...rate, cohort: e.target.value.replace(/[^\d.]/g, '') })} aria-label="New group rate" />
              <Button type="button" variant="outline" disabled={busy || !rate.agreement || !rate.cohort} onClick={() => { if (rate.reason.trim().length < 3) { toast.error('Write a reason'); return; } act(rpc('admin_change_cohort_rate', { _agreement: rate.agreement, _new_rate: Number(rate.cohort), _reason: rate.reason.trim() }), 'Group rate changed'); }}>Change this group's rate</Button>
            </div>
          </Panel>

          <Panel title="Rate change history" flush>
            <ul className="divide-y divide-border text-sm">
              {changes.map(c => <li key={c.id} className="flex flex-wrap justify-between gap-2 px-4 py-2"><span>{day(c.at)} · {c.scope}</span><span>{c.old_rate ?? '-'}% → {c.new_rate}%</span><span>{c.affected_vendors} suppliers</span><span className="text-muted-foreground">{c.reason}</span></li>)}
              {changes.length === 0 && <li className="px-4 py-3 text-muted-foreground">No changes yet.</li>}
            </ul>
          </Panel>
          <Panel title="Audit log" flush>
            <ul className="divide-y divide-border text-xs">{audit.map((a, i) => <li key={i} className="flex flex-wrap justify-between gap-2 px-4 py-1.5"><span>{new Date(a.at).toLocaleString()}</span><span>{a.action}</span><span className="text-muted-foreground">{a.entity_type} {a.entity_id}</span></li>)}</ul>
          </Panel>
        </>
      )}
    </div>
  );
}

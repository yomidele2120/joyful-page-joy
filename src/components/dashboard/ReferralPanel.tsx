import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Copy, Mail, MessageCircle, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Panel } from '@/components/dashboard/DashboardShell';
import { supabase } from '@/integrations/supabase/client';
import { formatNaira } from '@/lib/format';
import { BANKS, BANK_PLACEHOLDER, isValidAccountNumber } from '@/lib/banks';
import { useBankAccountName, lookupMessage } from '@/hooks/useBankAccountName';

const rpc = (fn: string, args?: Record<string, unknown>) => (supabase as any).rpc(fn, args);
const naira = (kobo: unknown) => formatNaira(Number(kobo ?? 0) / 100);
const date = (v?: string | null) => (v ? new Date(v).toLocaleDateString() : '-');

const STATUS_TEXT: Record<string, string> = {
  pending: 'Held', approved: 'Approved', available: 'Ready to withdraw', processing: 'Being paid', paid: 'Paid', reversed: 'Reversed',
  requested: 'Requested', rejected: 'Rejected', cancelled: 'Cancelled', active: 'Subscribed', expired: 'Expired', not_subscribed: 'Not subscribed',
};

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-heading text-lg font-bold">{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export default function ReferralPanel() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [bank, setBank] = useState(BANK_PLACEHOLDER);
  const [acct, setAcct] = useState('');
  const [acctName, setAcctName] = useState('');
  // Paystack supplies the account holder's name; it is typed by hand only when the check is unavailable.
  const lookup = useBankAccountName(bank === BANK_PLACEHOLDER ? '' : bank, acct);
  useEffect(() => {
    if (lookup.state === 'verified') setAcctName(lookup.name);
    else if (lookup.state !== 'unavailable') setAcctName('');
  }, [lookup]);

  const { data: ov, isLoading, error } = useQuery<any>({ queryKey: ['my-referral-overview'], queryFn: async () => { const { data, error } = await rpc('my_referral_overview'); if (error) throw error; return data; } });
  const { data: vendors = [] } = useQuery<any[]>({ queryKey: ['my-referred-vendors'], queryFn: async () => (await rpc('my_referred_vendors')).data ?? [] });
  const { data: commissions = [] } = useQuery<any[]>({ queryKey: ['my-commissions'], queryFn: async () => (await rpc('my_commission_history', { _limit: 100 })).data ?? [] });
  const { data: withdrawals = [] } = useQuery<any[]>({
    queryKey: ['my-withdrawals'],
    queryFn: async () => (await (supabase as any).from('referral_withdrawals').select('id,gross_kobo,debt_kobo,fee_kobo,net_kobo,status,requested_at,paid_at,admin_note').order('requested_at', { ascending: false }).limit(30)).data ?? [],
  });

  const refresh = () => ['my-referral-overview', 'my-commissions', 'my-withdrawals', 'my-referred-vendors'].forEach(k => qc.invalidateQueries({ queryKey: [k] }));
  const run = async (fn: string, args: Record<string, unknown> | undefined, ok: string) => {
    setBusy(true);
    const { error } = await rpc(fn, args);
    setBusy(false);
    if (error) { toast.error(error.message); return false; }
    toast.success(ok); refresh(); return true;
  };

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading your referral dashboard...</p>;
  if (error || !ov) return <p className="text-sm text-destructive">Could not load referrals. Try again shortly.</p>;

  const link = `${window.location.origin}/ref/${ov.code}`;
  const msg = `Sell online with me on IT Hub Africa: ${link}`;
  const copy = async (text: string) => { try { await navigator.clipboard.writeText(text); toast.success('Copied'); } catch { toast.error('Copy failed. Select the text and copy it.'); } };
  const open = Number(ov.processing_kobo) > 0 || withdrawals.some((w: any) => ['requested', 'approved'].includes(w.status));
  const canWithdraw = ov.programme_enabled && ov.status === 'active' && ov.has_payout_account && Number(ov.withdrawable_kobo) >= Number(ov.min_withdrawal_kobo) && !open;

  return (
    <div className="space-y-4">
      {!ov.programme_enabled && <p className="rounded-lg border border-border bg-card p-3 text-sm">The referral programme is paused. Your earnings are safe.</p>}
      {ov.status !== 'active' && <p className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive">Your referral account is suspended. Contact support.</p>}

      <Panel title="Your referral link">
        <p className="text-sm text-muted-foreground">Earn {ov.rate_percent}% of every subscription payment from suppliers who join with your link, for as long as they stay subscribed.</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <code className="rounded-md bg-secondary px-3 py-2 text-sm">{ov.code}</code>
          <Button type="button" variant="outline" size="sm" onClick={() => copy(ov.code)}><Copy className="mr-1 h-4 w-4" />Copy code</Button>
          <Button type="button" variant="outline" size="sm" onClick={() => copy(link)}><Copy className="mr-1 h-4 w-4" />Copy link</Button>
        </div>
        <p className="mt-2 break-all text-xs text-muted-foreground">{link}</p>
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          <a className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5" target="_blank" rel="noreferrer" href={`https://wa.me/?text=${encodeURIComponent(msg)}`}><MessageCircle className="h-4 w-4" />WhatsApp</a>
          <a className="rounded-md border border-border px-3 py-1.5" target="_blank" rel="noreferrer" href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`}>Facebook</a>
          <a className="rounded-md border border-border px-3 py-1.5" target="_blank" rel="noreferrer" href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(msg)}`}>X</a>
          <a className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5" target="_blank" rel="noreferrer" href={`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent('Sell online with me on IT Hub Africa')}`}><Send className="h-4 w-4" />Telegram</a>
          <a className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5" href={`mailto:?subject=${encodeURIComponent('Sell on IT Hub Africa')}&body=${encodeURIComponent(msg)}`}><Mail className="h-4 w-4" />Email</a>
        </div>
      </Panel>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Suppliers referred" value={ov.vendors_referred} />
        <Stat label="Active subscriptions" value={ov.active_subscriptions} />
        <Stat label="Expired" value={ov.expired_subscriptions} />
        <Stat label="Payments earned on" value={naira(ov.revenue_kobo)} />
        <Stat label="Total earned" value={naira(ov.earned_kobo)} />
        <Stat label="Held" value={naira(Number(ov.pending_kobo) + Number(ov.approved_kobo))} hint={`Released after ${ov.hold_days} days`} />
        <Stat label="Ready to withdraw" value={naira(ov.withdrawable_kobo)} hint={Number(ov.debt_kobo) > 0 ? `After ${naira(ov.debt_kobo)} owed back` : undefined} />
        <Stat label="Paid out" value={naira(ov.paid_kobo)} />
      </div>

      <Panel title="Withdraw">
        <p className="text-sm text-muted-foreground">Minimum {naira(ov.min_withdrawal_kobo)}.{Number(ov.withdrawal_fee_kobo) > 0 ? ` Fee ${naira(ov.withdrawal_fee_kobo)}.` : ''} Payouts are sent to your bank account after the team approves the request. If a payment you earned on is refunded, that commission is taken back.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <select value={bank} onChange={e => setBank(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm" aria-label="Bank">
            {[BANK_PLACEHOLDER, ...BANKS].map(b => <option key={b}>{b}</option>)}
          </select>
          <Input value={acct} onChange={e => setAcct(e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="10-digit account number" inputMode="numeric" aria-label="Account number" />
          <Input value={acctName} readOnly={lookup.state !== 'unavailable'} onChange={e => setAcctName(e.target.value)}
            placeholder={lookup.state === 'unavailable' ? 'Account name' : 'Name shows after you enter your account number'} aria-label="Account name" />
        </div>
        {lookup.state === 'verified'
          ? <p className="mt-2 text-xs font-medium text-emerald-600" role="status">Verified by Paystack</p>
          : lookupMessage(lookup) && <p className={`mt-2 text-xs ${lookup.state === 'not_found' || lookup.state === 'bank_unsupported' ? 'text-destructive' : 'text-muted-foreground'}`} role="status">{lookupMessage(lookup)}</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={busy || bank === BANK_PLACEHOLDER || !isValidAccountNumber(acct) || !acctName.trim()}
            onClick={() => run('save_my_payout_account', { _bank: bank, _number: acct, _name: acctName }, ov.has_payout_account ? 'Payout account updated' : 'Payout account saved')}>
            {ov.has_payout_account ? 'Update payout account' : 'Save payout account'}
          </Button>
          <Button type="button" variant="cta" disabled={busy || !canWithdraw} onClick={() => run('request_referral_withdrawal', undefined, 'Withdrawal requested')}>
            Withdraw {naira(ov.withdrawable_kobo)}
          </Button>
        </div>
        {!ov.has_payout_account && <p className="mt-2 text-xs text-muted-foreground">Save a payout account to withdraw.</p>}
      </Panel>

      <Panel title="Withdrawals" flush>
        {withdrawals.length === 0 ? <p className="p-4 text-sm text-muted-foreground">No withdrawals yet.</p> : (
          <ul className="divide-y divide-border text-sm">
            {withdrawals.map((w: any) => (
              <li key={w.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
                <span>{date(w.requested_at)}</span>
                <span className="font-medium">{naira(w.net_kobo)}</span>
                <span className="text-muted-foreground">{STATUS_TEXT[w.status] ?? w.status}{w.admin_note ? ` · ${w.admin_note}` : ''}</span>
                {w.status === 'requested' && <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => run('cancel_my_referral_withdrawal', { _id: w.id }, 'Withdrawal cancelled')}>Cancel</Button>}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Suppliers you referred" flush>
        {vendors.length === 0 ? <p className="p-4 text-sm text-muted-foreground">No suppliers yet. Share your link to get started.</p> : (
          <ul className="divide-y divide-border text-sm">
            {vendors.map((v: any, i: number) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
                <span className="font-medium">{v.store_name}</span>
                <span className="text-muted-foreground">Joined {date(v.attributed_at)}</span>
                <span>{STATUS_TEXT[v.status] ?? v.status}{v.status === 'active' && v.plan_name ? ` · ${v.plan_name}` : ''}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Commission history" flush>
        {commissions.length === 0 ? <p className="p-4 text-sm text-muted-foreground">Commissions appear here when a supplier you referred pays for a plan.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs text-muted-foreground"><tr><th className="px-4 py-2">Date</th><th>Supplier</th><th>Plan</th><th>Payment</th><th>Rate</th><th>Commission</th><th>Status</th></tr></thead>
              <tbody className="divide-y divide-border">
                {commissions.map((c: any) => (
                  <tr key={c.id}>
                    <td className="px-4 py-2">{date(c.paid_at)}</td><td>{c.vendor}</td><td>{c.plan_name ?? '-'}</td>
                    <td>{naira(c.payment_kobo)}</td><td>{c.rate_percent}%</td><td className="font-medium">{naira(c.commission_kobo)}</td>
                    <td>{STATUS_TEXT[c.status] ?? c.status}{c.status === 'pending' ? ` until ${date(c.available_at)}` : ''}{c.status === 'reversed' && c.reversal_reason ? ` · ${c.reversal_reason}` : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

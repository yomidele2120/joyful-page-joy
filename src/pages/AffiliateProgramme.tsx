import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import Layout from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { useAuth } from '@/hooks/useAuth';
import { useReferralPublicInfo } from '@/hooks/useReferralPublicInfo';
import { supabase } from '@/integrations/supabase/client';
import { formatNaira } from '@/lib/format';

// Public page for the referral programme. Every number comes from the live settings; nothing here promises earnings.
const db = supabase as any;

const EMPTY = { fullName: '', phone: '', platform: '', profileUrl: '', audience: '', message: '', code: '' };

function ApplyForm({ open }: { open: boolean }) {
  const { user, loading } = useAuth();
  const qc = useQueryClient();
  const [f, setF] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const { data: mine } = useQuery<any>({
    queryKey: ['my-affiliate-application', user?.id], enabled: !!user,
    queryFn: async () => (await db.rpc('my_affiliate_application')).data ?? null,
  });
  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF(prev => ({ ...prev, [k]: e.target.value }));

  if (loading) return null;
  if (mine?.is_affiliate) {
    return <p className="rounded-xl border border-border bg-card p-5 text-sm">You are an approved affiliate. Your link, code and earnings are in your dashboard under <strong>Refer &amp; earn</strong>.</p>;
  }
  if (!open) return <p className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">Affiliate applications are closed right now. Anyone with an account can still use the standard referral link in their dashboard.</p>;
  if (!user) {
    return (
      <div className="rounded-xl border border-border bg-card p-5 text-sm">
        <p>Sign in or create an account to apply. We need an account so we can set up your affiliate link. After you sign in, come back to this page to send your application.</p>
        <Button asChild variant="cta" className="mt-4 rounded-xl"><Link to="/users-login">Sign in to apply</Link></Button>
      </div>
    );
  }
  if (mine?.status === 'pending') return <p className="rounded-xl border border-border bg-card p-5 text-sm">Your application is with the team. We will review it and you will see the result here.</p>;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await db.rpc('submit_affiliate_application', {
        _full_name: f.fullName, _phone: f.phone, _platform: f.platform, _profile_url: f.profileUrl,
        _audience_size: f.audience, _message: f.message, _requested_code: f.code,
      });
      if (error) { toast.error(error.message); return; }
      toast.success('Application sent');
      setF(EMPTY);
      qc.invalidateQueries({ queryKey: ['my-affiliate-application'] });
    } finally { setBusy(false); }
  };

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border border-border bg-card p-5">
      {mine?.status === 'rejected' && <p className="rounded-lg bg-muted p-3 text-sm">Your last application was not approved. You can apply again 30 days after it was reviewed.</p>}
      {mine?.status === 'approved' && !mine?.is_affiliate && <p className="rounded-lg bg-muted p-3 text-sm">Your application was approved. Your account is being set up.</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <div><Label htmlFor="aff-name">Full name</Label><Input id="aff-name" required minLength={2} maxLength={80} value={f.fullName} onChange={set('fullName')} autoComplete="name" /></div>
        <div><Label htmlFor="aff-phone">Phone (optional)</Label><Input id="aff-phone" maxLength={30} value={f.phone} onChange={set('phone')} autoComplete="tel" /></div>
        <div><Label htmlFor="aff-platform">Main platform</Label><Input id="aff-platform" required maxLength={60} placeholder="Instagram, YouTube, a blog..." value={f.platform} onChange={set('platform')} /></div>
        <div><Label htmlFor="aff-url">Link to your profile or page</Label><Input id="aff-url" required maxLength={300} placeholder="https://" value={f.profileUrl} onChange={set('profileUrl')} /></div>
        <div><Label htmlFor="aff-aud">Audience size (optional)</Label><Input id="aff-aud" maxLength={40} placeholder="For example 25,000 followers" value={f.audience} onChange={set('audience')} /></div>
        <div><Label htmlFor="aff-code">Code you would like (optional)</Label><Input id="aff-code" maxLength={32} placeholder="4 to 32 letters or numbers" value={f.code} onChange={e => setF(p => ({ ...p, code: e.target.value.toUpperCase() }))} /></div>
      </div>
      <div><Label htmlFor="aff-msg">Tell us about your audience and how you would promote IT Hub Africa (optional)</Label><Textarea id="aff-msg" rows={4} maxLength={1000} value={f.message} onChange={set('message')} /></div>
      <Button type="submit" variant="cta" disabled={busy} className="rounded-xl">{busy ? 'Sending...' : 'Send application'}</Button>
      <p className="text-xs text-muted-foreground">We review every application. Approval, the commission rate and the code are our decision.</p>
    </form>
  );
}

export default function AffiliateProgramme() {
  const { user, isVendor } = useAuth();
  const { data: info, isLoading } = useReferralPublicInfo();

  useEffect(() => {
    const old = document.title;
    document.title = 'Referral and affiliate programme | IT Hub Africa';
    return () => { document.title = old; };
  }, []);

  const on = info?.programme_enabled !== false && !!info;
  const hold = info?.hold_days ?? 30;
  const min = info ? formatNaira(info.min_withdrawal_kobo / 100) : '';
  const fee = info && info.withdrawal_fee_kobo > 0 ? formatNaira(info.withdrawal_fee_kobo / 100) : null;

  return (
    <Layout>
      <main className="container mx-auto max-w-3xl px-4 py-10 sm:py-14">
        <h1 className="font-heading text-3xl font-bold sm:text-4xl">Earn when suppliers you bring subscribe</h1>
        <p className="mt-3 text-muted-foreground">
          Share your link or code. When a supplier you referred pays for a plan on IT Hub Africa, you earn a commission on that payment, and on each renewal after it.
        </p>

        {isLoading ? <p className="mt-8 text-sm text-muted-foreground">Loading...</p> : !on ? (
          <p className="mt-8 rounded-xl border border-border bg-card p-5 text-sm">The referral programme is not open right now. Please check back later.</p>
        ) : (
          <>
            <div className="mt-8 flex flex-wrap gap-3">
              {user
                ? <Button asChild variant="cta" size="lg" className="rounded-xl"><Link to={isVendor ? '/supplier-dashboard?tab=referrals' : '/user-dashboard?tab=referrals'}>Get my referral link</Link></Button>
                : <Button asChild variant="cta" size="lg" className="rounded-xl"><Link to="/users-login">Sign in to get my link</Link></Button>}
              {info?.applications_open && <Button asChild variant="outline" size="lg" className="rounded-xl"><a href="#apply">Apply as an affiliate</a></Button>}
            </div>

            <section className="mt-12" aria-labelledby="how">
              <h2 id="how" className="font-heading text-xl font-bold sm:text-2xl">How it works</h2>
              <ol className="mt-4 space-y-4">
                {[
                  ['Get your link', 'Open the Refer & earn tab in your dashboard. Your link and code are created for you.'],
                  ['Share it', 'Send it to people who sell products. When they open an account through your link, they are tied to you.'],
                  ['They subscribe', 'You earn when they pay for a paid plan. Signing up on its own earns nothing.'],
                  ['Get paid', `Your commission is held for ${hold} days, then you can withdraw it to your bank account.`],
                ].map(([t, d], i) => (
                  <li key={t} className="flex gap-4">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">{i + 1}</span>
                    <div><p className="font-semibold">{t}</p><p className="text-sm text-muted-foreground">{d}</p></div>
                  </li>
                ))}
              </ol>
            </section>

            <section className="mt-12" aria-labelledby="terms">
              <h2 id="terms" className="font-heading text-xl font-bold sm:text-2xl">The terms in short</h2>
              <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-muted-foreground">
                {info?.rate_percent != null
                  ? <li>The standard commission is <strong className="text-foreground">{info.rate_percent}%</strong> of each subscription payment. Special affiliates may have a different agreed rate. The rate you get is fixed on the day a supplier joins through your link.</li>
                  : <li>The commission is a percentage of each subscription payment. The rate you get is fixed on the day a supplier joins through your link.</li>}
                <li>You are paid on subscription payments only. Money a supplier adds to their advertising balance, and sales on the marketplace, do not earn commission.</li>
                <li>Renewals earn commission too, for as long as the supplier keeps subscribing.</li>
                <li>If a payment is refunded or charged back, the commission on it is cancelled. If it was already paid to you, it is taken from your next withdrawal.</li>
                <li>Commission is held for {hold} days before you can withdraw. The minimum withdrawal is {min}{fee ? `, with a ${fee} fee` : ''}.</li>
                <li>You cannot earn from your own shop, and a code cannot be added after a supplier has already paid.</li>
                <li>We may suspend an account for misuse. Earnings are not guaranteed.</li>
              </ul>
              {info?.terms_note && <p className="mt-3 whitespace-pre-line rounded-lg bg-muted p-3 text-sm">{info.terms_note}</p>}
            </section>

            <section id="apply" className="mt-12 scroll-mt-24" aria-labelledby="apply-h">
              <h2 id="apply-h" className="font-heading text-xl font-bold sm:text-2xl">Apply as an affiliate</h2>
              <p className="mb-4 mt-2 text-sm text-muted-foreground">If you have an audience, such as a social media following, a community or a business network, you can apply for a personal code, a public page and an agreed rate. Everyone else can use the standard link above.</p>
              <ApplyForm open={!!info?.applications_open} />
            </section>

            <section className="mt-12" aria-labelledby="faq">
              <h2 id="faq" className="font-heading text-xl font-bold sm:text-2xl">Questions</h2>
              <Accordion type="single" collapsible className="mt-3">
                <AccordionItem value="a"><AccordionTrigger>Who counts as a referred supplier?</AccordionTrigger><AccordionContent>A supplier who opened their account through your link or entered your code before they paid for any plan.</AccordionContent></AccordionItem>
                <AccordionItem value="b"><AccordionTrigger>When do I see my earnings?</AccordionTrigger><AccordionContent>A commission appears as pending as soon as the supplier's payment is confirmed, and becomes withdrawable after the holding period.</AccordionContent></AccordionItem>
                <AccordionItem value="c"><AccordionTrigger>How are withdrawals paid?</AccordionTrigger><AccordionContent>You save your bank details and request a withdrawal. The team reviews it and sends the money to your bank account.</AccordionContent></AccordionItem>
              </Accordion>
            </section>
          </>
        )}
      </main>
    </Layout>
  );
}

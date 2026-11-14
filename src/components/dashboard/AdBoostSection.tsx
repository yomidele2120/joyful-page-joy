import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { call } from '@/lib/ads/adsApi';
import { formatNaira } from '@/lib/format';
import { errText, fmtDate, n } from '@/components/ads/adUi';

/** "Get more views" for a running promotion. Payment goes through Paystack; the views are added only after the server confirms it. */
export default function AdBoostSection({ campaignId, running }: { campaignId: string; running: boolean }) {
  const qc = useQueryClient();
  const { data } = useQuery<any>({ queryKey: ['ad-boosts'], queryFn: () => call('my_ad_boosts'), staleTime: 20_000 });
  const [busy, setBusy] = useState<string | null>(null);
  const remaining = data?.campaigns?.find((c: any) => c.campaign_id === campaignId)?.boost_remaining ?? 0;
  const pay = (data?.payments ?? []).filter((p: any) => p.campaign_id === campaignId);

  // Coming back from Paystack: ask the server to confirm the payment (never trust the redirect itself).
  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get('boost_ref');
    if (!ref || !/^itha_boost_[a-f0-9]{32}$/i.test(ref) || !pay.some((p: any) => p.status === 'pending')) return;
    (async () => {
      const { data: res, error } = await supabase.functions.invoke('verify-ad-boost', { body: { reference: ref } });
      if (error || (res as any)?.error) toast.error((res as any)?.error ?? 'We could not confirm the payment yet. If you were charged it will be applied automatically.');
      else toast.success('Payment confirmed. Extra views added.');
      const u = new URL(window.location.href); u.searchParams.delete('boost_ref'); window.history.replaceState({}, '', u);
      qc.invalidateQueries({ queryKey: ['ad-boosts'] }); qc.invalidateQueries({ queryKey: ['ad-overview'] });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.payments?.length]);

  if (!data?.packages?.length) return null;
  const start = async (packageId: string) => {
    setBusy(packageId);
    try {
      const { data: res, error } = await supabase.functions.invoke('initialize-ad-boost', { body: { campaignId, packageId } });
      if (error || (res as any)?.error) throw new Error((res as any)?.error ?? 'Could not start the payment');
      window.location.href = (res as any).authorization_url;
    } catch (e) { toast.error(errText(e)); setBusy(null); }
  };
  return (
    <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3">
      <p className="text-sm font-medium">Get more views</p>
      <p className="text-xs text-muted-foreground">Extra views show your promotion more often and keep it showing after your plan's included views are used. This is a separate payment from your plan. {remaining > 0 && <b>{n(remaining)} boosted views left.</b>}</p>
      {running ? (
        <div className="mt-2 flex flex-wrap gap-2">{data.packages.map((p: any) => (
          <Button key={p.id} size="sm" variant="outline" disabled={!!busy} onClick={() => { if (window.confirm(`Pay ${formatNaira(p.price_kobo / 100)} for ${n(p.impressions)} extra views? You will be taken to Paystack.`)) start(p.id); }}>
            {busy === p.id ? 'Opening Paystack...' : `${p.name}: ${n(p.impressions)} views · ${formatNaira(p.price_kobo / 100)}`}</Button>))}</div>
      ) : <p className="mt-1 text-xs">Available while the promotion is running.</p>}
      {!!pay.length && <ul className="mt-2 text-xs text-muted-foreground">{pay.slice(0, 5).map((p: any) => <li key={p.id}>{fmtDate(p.created_at)} · {p.package_name} · {formatNaira(p.amount_kobo / 100)} · {p.status === 'needs_review' ? 'being checked by ITHUBAFRICA' : p.status}</li>)}</ul>}
    </div>
  );
}

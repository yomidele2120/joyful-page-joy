import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, Instagram, Facebook, Music2 } from 'lucide-react';
import { adLocalStore, fetchShopSocialBanner, trackSocial, type SocialAccount } from '@/lib/ads/adsApi';
import { emptySocialState, loadSocialState, markSocialDismissed, markSocialShown, pickSocialAccount, shouldShowSocialBanner, socialHideAt, type SocialBannerState } from '@/lib/ads/socialBannerSchedule';
import { isSafeSocialUrl } from '@/lib/ads/socialValidation';

const ICON = { instagram: Instagram, facebook: Facebook, tiktok: Music2 } as const;
const LABEL = { instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok' } as const;
const KEY = 'ith_social_banner';

const readState = (): SocialBannerState => {
  const now = Date.now();
  try { return loadSocialState(JSON.parse(adLocalStore().getItem(KEY) ?? 'null'), now); } catch { return emptySocialState(now); }
};
const writeState = (s: SocialBannerState) => { try { adLocalStore().setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ } };

/** Small floating invitation to follow the shop on social media. Links only; shown only for valid, enabled profiles. */
export default function ShopSocialBanner({ vendorId, isOwnShop }: { vendorId: string; isOwnShop?: boolean }) {
  const { data } = useQuery({ queryKey: ['shop-social-banner', vendorId], queryFn: () => fetchShopSocialBanner(vendorId), staleTime: 5 * 60_000, retry: 1, enabled: !!vendorId && !isOwnShop });
  const [account, setAccount] = useState<SocialAccount | null>(null);
  const accounts = useMemo(() => (data?.accounts ?? []).filter((a) => isSafeSocialUrl(a.platform, a.profile_url)), [data]);

  // Decide once the data is here (honours the admin's frequency settings kept in this browser).
  useEffect(() => {
    if (!data || !accounts.length) return;
    const now = Date.now();
    const state = readState();
    if (!shouldShowSocialBanner(state, data.settings, now)) return;
    const next = pickSocialAccount(accounts, state.rotation);
    if (!next) return;
    writeState(markSocialShown(state, now));
    setAccount(next);
    trackSocial('impression', next.id);
    const timer = window.setTimeout(() => setAccount(null), Math.max(1000, socialHideAt(now, data.settings) - now));
    return () => window.clearTimeout(timer);
  }, [data, accounts]);

  if (!data || !account) return null;
  const Icon = ICON[account.platform];
  return (
    <aside role="complementary" aria-label="Follow this shop"
           className="fixed bottom-4 left-1/2 z-40 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-2xl border border-border bg-background p-3 shadow-xl sm:left-auto sm:right-4 sm:translate-x-0">
      <button type="button" aria-label="Close" className="absolute right-2 top-2 rounded-full p-1 text-muted-foreground hover:bg-secondary"
              onClick={() => { writeState(markSocialDismissed(readState(), data.settings, Date.now())); setAccount(null); }}>
        <X className="h-4 w-4" />
      </button>
      <p className="pr-6 text-xs text-muted-foreground">Follow</p>
      <p className="truncate pr-6 text-sm font-semibold">{data.vendor.store_name}</p>
      <a href={account.profile_url} target="_blank" rel="noopener noreferrer nofollow"
         onClick={() => trackSocial('social_click', account.id)}
         className="mt-2 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
        <Icon className="h-4 w-4" /> {LABEL[account.platform]} · @{account.handle}
      </a>
    </aside>
  );
}

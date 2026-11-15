import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, Instagram, Facebook, Music2 } from 'lucide-react';
import { adLocalStore, fetchShopSocialBanner, trackSocial, type SocialAccount } from '@/lib/ads/adsApi';
import {
  availableSocialAccounts, dismissSocialAccount, emptySocialState, loadSocialState, markSocialShown, pickSocialAccount,
  shouldShowSocialBanner, socialHideAt, socialSide, type SocialBannerState,
} from '@/lib/ads/socialBannerSchedule';
import { isSafeSocialUrl } from '@/lib/ads/socialValidation';

const ICON = { instagram: Instagram, facebook: Facebook, tiktok: Music2 } as const;
const LABEL = { instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok' } as const;
const TINT = {
  instagram: 'bg-gradient-to-tr from-amber-400 via-pink-500 to-purple-600 text-white',
  facebook: 'bg-[#1877F2] text-white',
  tiktok: 'bg-black text-white ring-1 ring-white/20',
} as const;
const KEY = 'ith_social_banner';
const SWAP_MS = 12_000;      // the card changes sides this often
const IDLE_MS = 700;         // it comes back this long after scrolling stops
const CARD_REM = 11;         // card width; keep in step with the w-44 class below
const EDGE_REM = 1;

const readState = (): SocialBannerState => {
  const now = Date.now();
  try { return loadSocialState(JSON.parse(adLocalStore().getItem(KEY) ?? 'null'), now); } catch { return emptySocialState(now); }
};
const writeState = (s: SocialBannerState) => { try { adLocalStore().setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ } };

/**
 * Small floating card inviting visitors to follow the shop. It floats at the middle of the screen's edge, clear of the contact button and the phone's bottom bar,
 * swaps sides every few seconds, slides out of the way while the visitor scrolls and slides back when they stop.
 * Closing it hides only that account; the shop's other account (if any) takes its place. Links only.
 */
export default function ShopSocialBanner({ vendorId, isOwnShop }: { vendorId: string; isOwnShop?: boolean }) {
  const { data } = useQuery({ queryKey: ['shop-social-banner', vendorId], queryFn: () => fetchShopSocialBanner(vendorId), staleTime: 5 * 60_000, retry: 1, enabled: !!vendorId && !isOwnShop });
  const [account, setAccount] = useState<SocialAccount | null>(null);
  const [entered, setEntered] = useState(false);
  const [scrolling, setScrolling] = useState(false);
  const [tick, setTick] = useState(0);
  const hideAt = useRef(0);
  const accounts = useMemo(() => (data?.accounts ?? []).filter((a) => isSafeSocialUrl(a.platform, a.profile_url)), [data]);

  // Decide once the data is here (honours the admin's frequency settings kept in this browser).
  useEffect(() => {
    if (!data || !accounts.length) return;
    const now = Date.now();
    const state = readState();
    const open = availableSocialAccounts(accounts, state, now);
    if (!open.length || !shouldShowSocialBanner(state, data.settings, now)) return;
    const next = pickSocialAccount(open, state.rotation);
    if (!next) return;
    writeState(markSocialShown(state, now));
    hideAt.current = socialHideAt(now, data.settings);
    setAccount(next);
    trackSocial('impression', next.id);
  }, [data, accounts]);

  // Slide in when an account appears (also when it is replaced after a close); hide for good at the end of the showing time.
  const accountId = account?.id;
  useEffect(() => {
    if (!accountId) return;
    setEntered(false);
    const raf = window.requestAnimationFrame(() => setEntered(true));
    const timer = window.setTimeout(() => setAccount(null), Math.max(1000, hideAt.current - Date.now()));
    return () => { window.cancelAnimationFrame(raf); window.clearTimeout(timer); };
  }, [accountId]);

  // Swap sides every few seconds.
  useEffect(() => {
    if (!accountId) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const t = window.setInterval(() => setTick((n) => n + 1), SWAP_MS);
    return () => window.clearInterval(t);
  }, [accountId]);

  // Slide out of the way while the page is scrolling; come back when it stops.
  useEffect(() => {
    if (!accountId) return;
    let timer = 0;
    const onScroll = () => { setScrolling(true); window.clearTimeout(timer); timer = window.setTimeout(() => setScrolling(false), IDLE_MS); };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.removeEventListener('scroll', onScroll); window.clearTimeout(timer); };
  }, [accountId]);

  if (!data || !account) return null;

  const close = () => {
    const now = Date.now();
    const state = dismissSocialAccount(readState(), account.id, data.settings, now);
    const rest = availableSocialAccounts(accounts, state, now);
    const next = pickSocialAccount(rest, state.rotation);
    if (!next) { writeState(state); setAccount(null); return; }
    writeState(markSocialShown(state, now));       // the other account takes this showing's place straight away
    hideAt.current = socialHideAt(now, data.settings);
    setAccount(next);
    trackSocial('impression', next.id);
  };

  const Icon = ICON[account.platform];
  const side = socialSide(tick);
  const visible = entered && !scrolling;
  // Where the card sits: on the chosen side when visible, off the edge of that side when hidden.
  const left = side === 'right'
    ? (visible ? `calc(100% - ${CARD_REM + EDGE_REM}rem)` : '100%')
    : (visible ? `${EDGE_REM}rem` : `-${CARD_REM + EDGE_REM}rem`);

  return (
    <aside role="complementary" aria-label="Follow this shop"
           className="pointer-events-none fixed inset-x-0 z-30 top-[calc(50%-5.5rem)]">
      <div className="pointer-events-auto absolute top-0 w-44 transition-[left,opacity] duration-500 ease-out motion-reduce:transition-opacity"
           style={{ left, opacity: visible ? 1 : 0 }}>
        <a href={account.profile_url} target="_blank" rel="noopener noreferrer nofollow"
           onClick={() => trackSocial('social_click', account.id)}
           className="block rounded-2xl border border-border bg-background p-3 shadow-xl">
          <span className={`flex h-9 w-9 items-center justify-center rounded-full ${TINT[account.platform]}`}><Icon className="h-5 w-5" aria-hidden="true" /></span>
          <span className="mt-2 block text-[11px] text-muted-foreground">Follow on {LABEL[account.platform]}</span>
          <span className="block truncate text-sm font-semibold leading-tight">{data.vendor.store_name}</span>
          <span className="mt-2 block truncate rounded-full bg-primary px-3 py-1.5 text-center text-xs font-semibold text-primary-foreground">@{account.handle}</span>
        </a>
        <button type="button" aria-label={`Close ${LABEL[account.platform]} invitation`} onClick={close}
                className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </aside>
  );
}

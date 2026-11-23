import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, Instagram, Facebook, Music2 } from 'lucide-react';
import { fetchShopSocialBanner, trackSocial, type SocialAccount } from '@/lib/ads/adsApi';
import { isSafeSocialUrl } from '@/lib/ads/socialValidation';
import { pickPopupTheme, POPUP_THEMES, popupSeen, markPopupSeen, bumpVisit, POPUP_DELAY_MS } from '@/lib/ads/shopPopup';

const ICON = { instagram: Instagram, facebook: Facebook, tiktok: Music2 } as const;
const NAME = { instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok' } as const;

/**
 * A pop-up card inviting visitors to follow the shop on social media. It appears a few seconds after the shop opens,
 * once per visit per shop, can be closed with the X, the backdrop or the Escape key, and uses a different colour theme
 * on each visit. It never blocks the page afterwards, and is not shown to the shop's own owner. Links only.
 */
export default function ShopPromoPopup({ vendorId, isOwnShop, onOpenChange }: { vendorId: string; isOwnShop?: boolean; onOpenChange?: (open: boolean) => void }) {
  const { data } = useQuery({ queryKey: ['shop-social-banner', vendorId], queryFn: () => fetchShopSocialBanner(vendorId), staleTime: 5 * 60_000, retry: 1, enabled: !!vendorId && !isOwnShop });
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const theme = useMemo(() => POPUP_THEMES[pickPopupTheme(vendorId)], [vendorId]);
  const account: SocialAccount | null = useMemo(() => (data?.accounts ?? []).find((a) => isSafeSocialUrl(a.platform, a.profile_url)) ?? null, [data]);
  const accountId = account?.id;

  // Open once, a few seconds after the shop loads, if there is something to show and it has not been seen this visit.
  useEffect(() => {
    if (!accountId || isOwnShop || popupSeen(vendorId)) return;
    const t = window.setTimeout(() => { markPopupSeen(vendorId); bumpVisit(); setOpen(true); trackSocial('impression', accountId); }, POPUP_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [accountId, vendorId, isOwnShop]);

  useEffect(() => { onOpenChange?.(open); }, [open, onOpenChange]);
  useEffect(() => {
    if (!open) { setShown(false); return; }
    const raf = window.requestAnimationFrame(() => { setShown(true); closeRef.current?.focus(); });
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => { window.cancelAnimationFrame(raf); window.removeEventListener('keydown', onKey); };
  }, [open]);

  if (!open || !data || !account) return null;
  const Icon = ICON[account.platform];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6" onClick={() => setOpen(false)}>
      <div role="dialog" aria-modal="true" aria-label={`Follow ${data.vendor.store_name} on ${NAME[account.platform]}`}
           onClick={(e) => e.stopPropagation()}
           className={`relative w-full max-w-sm transition-all duration-300 ease-out motion-reduce:transition-none ${shown ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-4 scale-95 opacity-0'}`}>
        {/* the hanging tag */}
        <span aria-hidden="true" className="absolute -top-6 left-1/2 h-8 w-1 -translate-x-1/2 rotate-[8deg] rounded bg-white/90" />
        <span aria-hidden="true" className="absolute -top-1 left-1/2 z-10 h-3.5 w-3.5 -translate-x-1/2 rounded-full bg-black ring-2 ring-white/70" />
        <div className="overflow-hidden rounded-[2rem] shadow-2xl" style={{ background: theme.card }}>
          <div className="px-6 pb-2 pt-9 text-center">
            <span className="inline-flex max-w-full items-center gap-2 rounded-full bg-white/80 px-3 py-1.5 text-xs font-semibold text-neutral-800 shadow-sm">
              {data.vendor.logo_url
                ? <img src={data.vendor.logo_url} alt="" className="h-5 w-5 rounded-full object-cover" />
                : <span className="flex h-5 w-5 items-center justify-center rounded-full bg-neutral-900 text-[10px] text-white">{data.vendor.store_name.slice(0, 1).toUpperCase()}</span>}
              <span className="truncate">{data.vendor.store_name}</span>
            </span>
            <h2 className="mt-4 font-heading text-3xl font-extrabold leading-tight text-neutral-900">{theme.title(NAME[account.platform])}</h2>
            <p className="mt-2 text-base font-medium text-neutral-800">{theme.line(data.vendor.store_name)}</p>
          </div>
          <div className="relative mx-6 mt-2 flex h-28 items-center justify-center" aria-hidden="true">
            <span className="absolute h-24 w-24 rounded-full opacity-40" style={{ background: theme.glow }} />
            <span className="relative flex h-20 w-20 items-center justify-center rounded-3xl text-white shadow-xl" style={{ background: theme.badge }}><Icon className="h-10 w-10" /></span>
            <span className="absolute left-[18%] top-3 text-2xl">{theme.spark[0]}</span>
            <span className="absolute right-[18%] top-6 text-xl">{theme.spark[1]}</span>
          </div>
          <div className="px-6 pb-7 pt-3">
            <a href={account.profile_url} target="_blank" rel="noopener noreferrer nofollow"
               onClick={() => { trackSocial('social_click', account.id); setOpen(false); }}
               className="flex w-full items-center justify-center gap-2 rounded-2xl px-6 py-4 text-xl font-extrabold text-neutral-900 shadow-lg transition-transform active:scale-[0.98]"
               style={{ background: theme.button }}>
              GO <span aria-hidden="true">»</span>
              <span className="sr-only">to @{account.handle} on {NAME[account.platform]}</span>
            </a>
            <p className="mt-2 text-center text-xs text-neutral-700">@{account.handle}</p>
          </div>
        </div>
        <button ref={closeRef} type="button" aria-label="Close" onClick={() => setOpen(false)}
                className="mx-auto mt-5 flex h-12 w-12 items-center justify-center rounded-full border-2 border-white/90 bg-black/30 text-white backdrop-blur hover:bg-black/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
          <X className="h-6 w-6" />
        </button>
      </div>
    </div>
  );
}

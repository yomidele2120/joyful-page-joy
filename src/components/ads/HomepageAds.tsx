import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import AdBanner from './AdBanner';
import { fetchAdSettings, fetchHomepageAds, type AdPlacement, type HomepageAd, type PublicAdSettings } from '@/lib/ads/adsApi';
import { pickAds, rotationIndex, sponsoredRowSlots } from '@/lib/ads/adRotation';

/** One random seed per page load, so ordering varies between visits but is stable while the page is open. */
const PAGE_SEED = Math.random().toString(36).slice(2);

export function useAdSettings() {
  return useQuery({ queryKey: ['ad-settings'], queryFn: fetchAdSettings, staleTime: 5 * 60_000, retry: 1 });
}
function useAds(placement: AdPlacement, enabled: boolean) {
  return useQuery({ queryKey: ['homepage-ads', placement], queryFn: () => fetchHomepageAds(placement), staleTime: 3 * 60_000, retry: 1, enabled });
}

/** How long each vendor's featured banner stays before the next vendor's banner takes over. */
export const FEATURED_SLIDE_MS = 15_000;

/**
 * Featured banners at the top of the homepage, as a slideshow. Each slide is a different vendor's own banner; with more
 * than one running, the next vendor's banner appears every 15 seconds. The slideshow stops moving while the pointer or
 * keyboard focus is on it, while the browser tab is in the background, and for people who ask for reduced motion
 * (they can still use the dots). One banner or none: nothing moves, and nothing renders when nothing is eligible.
 */
export function FeaturedAds({ className }: { className?: string }) {
  const { data: settings } = useAdSettings();
  const { data: ads } = useAds('featured', !!settings?.ads_enabled);
  const slides = useMemo(() => pickAds(ads ?? [], { limit: settings?.featured_banner_limit ?? 1, seed: `${PAGE_SEED}:f` }), [ads, settings?.featured_banner_limit]);
  const [index, setIndex] = useState(0);
  const [hold, setHold] = useState(false);
  const [hidden, setHidden] = useState(() => typeof document !== 'undefined' && document.hidden);
  const [reduce, setReduce] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  const count = slides.length;

  useEffect(() => {
    const onVis = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return;
    const on = () => setReduce(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  useEffect(() => { if (index >= count) setIndex(0); }, [count, index]);

  // A fresh 15 seconds starts every time the slide changes, including when a visitor taps a dot.
  const playing = count > 1 && !hold && !hidden && !reduce;
  useEffect(() => {
    if (!playing) return;
    const t = window.setTimeout(() => setIndex(i => (i + 1) % count), FEATURED_SLIDE_MS);
    return () => window.clearTimeout(t);
  }, [playing, index, count]);

  const go = useCallback((i: number) => setIndex(((i % count) + count) % count), [count]);

  if (!settings?.ads_enabled || !count) return null;
  const ad = slides[Math.min(index, count - 1)];
  return (
    <section
      aria-label="Sponsored"
      aria-roledescription={count > 1 ? 'carousel' : undefined}
      className={className}
      onPointerEnter={() => setHold(true)}
      onPointerLeave={() => setHold(false)}
      onFocusCapture={() => setHold(true)}
      onBlurCapture={() => setHold(false)}
    >
      <div key={ad.id} className={reduce ? '' : 'animate-in fade-in duration-500'} aria-live={playing ? 'off' : 'polite'}>
        <AdBanner ad={ad} placement="featured" priority={index === 0} />
      </div>
      {count > 1 && (
        <div className="mt-2 flex items-center justify-center gap-1.5" role="group" aria-label="Choose a sponsored banner">
          {slides.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => go(i)}
              aria-label={`Show sponsored banner ${i + 1} of ${count}: ${s.store_name}`}
              aria-current={i === index ? 'true' : undefined}
              className="flex h-6 w-6 items-center justify-center"
            >
              <span className={`block h-2 rounded-full transition-all ${i === index ? 'w-5 bg-foreground/70' : 'w-2 bg-foreground/25'}`} />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * Sponsored banners between product rows. `rowKeys` lists the rows that are actually on screen, in order; the
 * hook returns a function giving the banner (if any) that belongs right after a given row.
 */
export function useSponsoredRows(rowKeys: readonly string[]) {
  const { data: settings } = useAdSettings();
  const { data: ads } = useAds('sponsored_row', !!settings?.ads_enabled);
  const keyStr = rowKeys.join('|');
  return useMemo(() => {
    const rowKeys = keyStr ? keyStr.split('|') : [];
    const slots = settings?.ads_enabled
      ? sponsoredRowSlots(rowKeys.length, settings.sponsored_row_interval, settings.sponsored_banner_limit) : [];
    const chosen = pickAds(ads ?? [], { limit: slots.length, seed: `${PAGE_SEED}:s` });
    return (rowKey: string): HomepageAd | null => {
      const position = rowKeys.indexOf(rowKey) + 1;      // 1-based count of rows shown so far
      const n = slots.indexOf(position);
      return n >= 0 ? chosen[n] ?? null : null;
    };
  }, [ads, settings, keyStr]);
}
// Banners the visitor closed during this visit (kept while they move between pages, forgotten on refresh).
const dismissedAds = new Set<string>();
/** On a phone the sponsored row is a compact card the visitor can close; on larger screens it is the wide strip. */
export function SponsoredRowBanner({ ad }: { ad: HomepageAd | null }) {
  const [, force] = useState(0);
  if (!ad) return null;
  const closed = dismissedAds.has(ad.id);
  return (
    <section aria-label="Sponsored" className="mt-8 sm:mt-10">
      {!closed && <AdBanner ad={ad} placement="sponsored_row" variant="card" className="sm:hidden" onDismiss={() => { dismissedAds.add(ad.id); force((n) => n + 1); }} />}
      <AdBanner ad={ad} placement="sponsored_row" variant="slim" className="hidden sm:flex" />
    </section>
  );
}

/**
 * Ads for cards inside a product grid. Uses the same eligible pool as the sponsored rows (paid plans with sponsored
 * placement), one ad per vendor, different picks on each page of results. Returns an empty list while ads are off.
 */
export function useSponsoredFeed(slotCount: number, pageKey: string): HomepageAd[] {
  const { data: settings } = useAdSettings();
  const { data: ads } = useAds('sponsored_row', !!settings?.ads_enabled);
  return useMemo(
    () => (settings?.ads_enabled && slotCount > 0 ? pickAds(ads ?? [], { limit: slotCount, seed: `${PAGE_SEED}:p:${pageKey}` }) : []),
    [ads, settings?.ads_enabled, slotCount, pageKey],
  );
}

/** Time-rotating banner: the ad changes every `rotation_minutes` (and while the page stays open). */
export function RotatingAds({ className }: { className?: string }) {
  const { data: settings } = useAdSettings();
  const { data: ads } = useAds('rotating', !!settings?.ads_enabled);
  const pool = useMemo(() => pickAds(ads ?? [], { limit: settings?.rotating_limit ?? 5, seed: `${PAGE_SEED}:r` }), [ads, settings?.rotating_limit]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(t); }, []);
  if (!settings?.ads_enabled || !pool.length) return null;
  const ad = pool[rotationIndex(now, (settings as PublicAdSettings).rotation_minutes, pool.length)];
  return <section aria-label="Sponsored" className={className}><AdBanner key={ad.id} ad={ad} placement="rotating" /></section>;
}

import { useEffect, useMemo, useState } from 'react';
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

/** Featured banner(s) at the top of the homepage. Renders nothing when there is nothing eligible. */
export function FeaturedAds({ className }: { className?: string }) {
  const { data: settings } = useAdSettings();
  const { data: ads } = useAds('featured', !!settings?.ads_enabled);
  const chosen = useMemo(() => pickAds(ads ?? [], { limit: settings?.featured_banner_limit ?? 1, seed: `${PAGE_SEED}:f` }), [ads, settings?.featured_banner_limit]);
  if (!settings?.ads_enabled || !chosen.length) return null;
  return (
    <section aria-label="Sponsored" className={className}>
      <div className="grid gap-4">{chosen.map((ad, i) => <AdBanner key={ad.id} ad={ad} placement="featured" priority={i === 0} />)}</div>
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
export function SponsoredRowBanner({ ad }: { ad: HomepageAd | null }) {
  if (!ad) return null;
  return <section aria-label="Sponsored" className="mt-8 sm:mt-10"><AdBanner ad={ad} placement="sponsored_row" variant="slim" /></section>;
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

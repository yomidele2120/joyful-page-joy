import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import type { HomepageAd, AdPlacement } from '@/lib/ads/adsApi';
import { trackAd } from '@/lib/ads/adsApi';
import { bannerSources } from '@/lib/ads/adMedia';
import { adShopLink } from '@/lib/ads/adTracking';

/**
 * One advertising banner. The artwork is text-free; the shop name, logo, headline, description and button are drawn
 * here, so they are always the vendor's real data and always sharp. The whole banner is one link to the vendor's own shop.
 */
export default function AdBanner({ ad, placement, priority = false, className }: { ad: HomepageAd; placement: AdPlacement; priority?: boolean; className?: string }) {
  const ref = useRef<HTMLAnchorElement>(null);
  const src = bannerSources(ad.banner_image_url);

  // Count an impression only when at least half the banner is really on screen (once per page load).
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting && e.intersectionRatio >= 0.5)) { trackAd({ event: 'impression', campaign: ad.id, placement }); io.disconnect(); }
    }, { threshold: [0.5] });
    io.observe(node);
    return () => io.disconnect();
  }, [ad.id, placement]);

  const products = (ad.products ?? []).slice(0, 3);
  return (
    <Link
      ref={ref}
      to={adShopLink(ad.vendor_id, ad.id)}
      onClick={() => trackAd({ event: 'banner_click', campaign: ad.id, placement })}
      aria-label={`${ad.store_name}: ${ad.headline} (sponsored)`}
      className={cn('group relative block aspect-[4/3] w-full overflow-hidden rounded-2xl bg-muted sm:aspect-[2/1] lg:aspect-[16/5]', className)}
    >
      <picture>
        <source media={src.media.desktop} srcSet={src.desktop} />
        <source media={src.media.tablet} srcSet={src.tablet} />
        <img src={src.mobile} alt="" loading={priority ? 'eager' : 'lazy'} decoding="async" fetchPriority={priority ? 'high' : 'auto'}
             className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]" />
      </picture>
      <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/45 to-transparent sm:via-black/35" aria-hidden="true" />
      <span className="absolute right-3 top-3 rounded-full bg-black/55 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white backdrop-blur">Sponsored</span>

      <div className="absolute inset-0 flex max-w-[85%] flex-col justify-end gap-1.5 p-4 text-white sm:max-w-[60%] sm:justify-center sm:gap-2 sm:p-8">
        <div className="flex items-center gap-2">
          {ad.logo_url
            ? <img src={ad.logo_url} alt="" loading="lazy" className="h-8 w-8 rounded-full bg-white object-cover sm:h-10 sm:w-10" />
            : <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-sm font-bold text-black sm:h-10 sm:w-10">{ad.store_name.slice(0, 1).toUpperCase()}</span>}
          <span className="truncate text-sm font-semibold sm:text-base">{ad.store_name}</span>
        </div>
        <h3 className="font-heading text-xl font-bold leading-tight sm:text-3xl lg:text-4xl">{ad.headline}</h3>
        {ad.description && <p className="line-clamp-2 text-xs text-white/85 sm:text-sm lg:text-base">{ad.description}</p>}
        <span className="mt-1 inline-flex w-fit items-center rounded-full bg-white px-4 py-1.5 text-xs font-semibold text-black sm:text-sm">{ad.cta_text || 'Visit shop'}</span>
      </div>

      {products.length > 0 && (
        <div className="absolute bottom-3 right-3 hidden gap-2 sm:flex lg:bottom-auto lg:right-8 lg:top-1/2 lg:-translate-y-1/2">
          {products.map((p) => p.image && (
            <img key={p.id} src={p.image} alt={p.name} loading="lazy" className="h-14 w-14 rounded-xl border-2 border-white/80 bg-white object-cover lg:h-24 lg:w-24" />
          ))}
        </div>
      )}
    </Link>
  );
}

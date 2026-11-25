import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { HomepageAd, AdPlacement } from '@/lib/ads/adsApi';
import { trackAd } from '@/lib/ads/adsApi';
import { bannerSources } from '@/lib/ads/adMedia';
import { adShopLink } from '@/lib/ads/adTracking';

// Ads already counted as seen in this page load. A slideshow remounts a banner each time it comes round again; that must not count twice.
const counted = new Set<string>();

/**
 * One advertising banner. The artwork is text-free; the shop name, logo, headline, description and button are drawn
 * here, so they are always the vendor's real data and always sharp. The whole banner is one link to the vendor's own shop.
 */
export default function AdBanner({ ad, placement, priority = false, className, variant = 'full', onDismiss, dots }: { ad: HomepageAd; placement: AdPlacement; priority?: boolean; className?: string; variant?: 'full' | 'slim' | 'card'; onDismiss?: () => void; dots?: React.ReactNode }) {
  const ref = useRef<HTMLAnchorElement>(null);
  const src = bannerSources(ad.banner_image_url);

  // Count an impression only when at least half the banner is really on screen (once per page load).
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting && e.intersectionRatio >= 0.5)) {
        const key = `${ad.id}:${placement}`;
        if (!counted.has(key)) { counted.add(key); trackAd({ event: 'impression', campaign: ad.id, placement }); }
        io.disconnect();
      }
    }, { threshold: [0.5] });
    io.observe(node);
    return () => io.disconnect();
  }, [ad.id, placement]);

  const products = (ad.products ?? []).slice(0, 3);

  // Card: the phone-sized look (music-app style). A dark card, a tilted picture tile that pokes out above its top-left corner,
  // the wording on the right, an arrow, a close button and (in a carousel) the dots inside the card. Same data and tracking.
  if (variant === 'card') {
    return (
      <div className={cn('relative', className)}>
        <Link
          ref={ref}
          to={adShopLink(ad.vendor_id, ad.id)}
          onClick={() => trackAd({ event: 'banner_click', campaign: ad.id, placement })}
          aria-label={`${ad.store_name}: ${ad.headline} (sponsored)`}
          className="group relative block min-h-[132px] rounded-2xl text-white"
        >
          <span className="absolute inset-0 overflow-hidden rounded-2xl bg-neutral-950" aria-hidden="true">
            <img src={src.mobile} alt="" loading="lazy" decoding="async" className="h-full w-full scale-110 object-cover opacity-40 blur-[3px]" />
            <span className="absolute inset-0 bg-gradient-to-r from-black/55 via-black/75 to-black/90" />
          </span>
          <span className="absolute -top-4 left-3 block -rotate-6 overflow-hidden rounded-xl border-2 border-white/85 bg-white shadow-xl transition-transform duration-300 group-active:rotate-0" aria-hidden="true">
            <img src={products[0]?.image || src.mobile} alt="" loading="lazy" decoding="async" className="h-28 w-28 object-cover" />
          </span>
          <span className="relative block min-h-[132px] py-3 pl-[8.25rem] pr-12">
            <span className="block truncate text-[11px] font-medium text-white/70">{ad.store_name} · Sponsored</span>
            <h3 className="line-clamp-2 font-heading text-lg font-extrabold leading-tight">{ad.headline}</h3>
            {ad.description && <span className="mt-0.5 line-clamp-2 block text-xs text-white/80">{ad.description}</span>}
            <ArrowRight className="mt-2 h-6 w-6 text-white" aria-hidden="true" />
          </span>
        </Link>
        {onDismiss && (
          <button type="button" aria-label="Hide this sponsored banner" onClick={onDismiss}
                  className="absolute right-2.5 top-2.5 z-10 flex h-7 w-7 items-center justify-center rounded-full border border-white/70 text-white hover:bg-white/15">
            <X className="h-4 w-4" />
          </button>
        )}
        {dots && <div className="absolute bottom-2.5 right-4 z-10 flex items-center gap-1">{dots}</div>}
      </div>
    );
  }

  // Slim strip: a short banner for placements between product rows. Same data and tracking, less height.
  if (variant === 'slim') {
    return (
      <Link
        ref={ref}
        to={adShopLink(ad.vendor_id, ad.id)}
        onClick={() => trackAd({ event: 'banner_click', campaign: ad.id, placement })}
        aria-label={`${ad.store_name}: ${ad.headline} (sponsored)`}
        className={cn('group relative flex h-[88px] w-full items-center overflow-hidden rounded-xl bg-muted sm:h-[132px] sm:rounded-2xl lg:h-[148px]', className)}
      >
        <picture>
          <source media={src.media.desktop} srcSet={src.desktop} />
          <source media={src.media.tablet} srcSet={src.tablet} />
          <img src={src.mobile} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]" />
        </picture>
        <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/65 to-black/35" aria-hidden="true" />
        <span className="absolute right-3 top-2 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white backdrop-blur">Sponsored</span>
        <div className="relative flex w-full items-center gap-3 px-4 pt-3 text-white sm:gap-5 sm:px-6">
          {ad.logo_url
            ? <img src={ad.logo_url} alt="" loading="lazy" className="h-10 w-10 shrink-0 rounded-full bg-white object-cover sm:h-14 sm:w-14" />
            : <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-base font-bold text-black sm:h-14 sm:w-14">{ad.store_name.slice(0, 1).toUpperCase()}</span>}
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-white/80 sm:text-sm">{ad.store_name}</p>
            <h3 className="line-clamp-2 font-heading text-base font-bold leading-tight sm:text-xl lg:text-2xl">{ad.headline}</h3>
            {ad.description && <p className="hidden truncate text-sm text-white/80 lg:block">{ad.description}</p>}
          </div>
          {products.length > 0 && (
            <div className="hidden gap-2 md:flex">
              {products.map((p) => p.image && <img key={p.id} src={p.image} alt={p.name} loading="lazy" className="h-14 w-14 rounded-lg border-2 border-white/80 bg-white object-cover lg:h-20 lg:w-20" />)}
            </div>
          )}
          <span className="shrink-0 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-black sm:px-4 sm:text-sm">{ad.cta_text || 'Visit shop'}</span>
        </div>
      </Link>
    );
  }

  return (
    <Link
      ref={ref}
      to={adShopLink(ad.vendor_id, ad.id)}
      onClick={() => trackAd({ event: 'banner_click', campaign: ad.id, placement })}
      aria-label={`${ad.store_name}: ${ad.headline} (sponsored)`}
      className={cn('group relative block aspect-[2/1] w-full overflow-hidden rounded-xl bg-muted sm:rounded-2xl lg:aspect-[16/5]', className)}
    >
      <picture>
        <source media={src.media.desktop} srcSet={src.desktop} />
        <source media={src.media.tablet} srcSet={src.tablet} />
        <img src={src.mobile} alt="" loading={priority ? 'eager' : 'lazy'} decoding="async" fetchPriority={priority ? 'high' : 'auto'}
             className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]" />
      </picture>
      <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/45 to-transparent sm:via-black/35" aria-hidden="true" />
      <span className="absolute right-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-[9px] sm:right-3 sm:top-3 sm:px-2.5 sm:text-[10px] font-semibold uppercase tracking-wider text-white backdrop-blur">Sponsored</span>

      <div className="absolute inset-0 flex max-w-[88%] flex-col justify-end gap-1 p-3 text-white sm:max-w-[60%] sm:justify-center sm:gap-2 sm:p-8">
        <div className="flex items-center gap-2">
          {ad.logo_url
            ? <img src={ad.logo_url} alt="" loading="lazy" className="h-8 w-8 rounded-full bg-white object-cover sm:h-10 sm:w-10" />
            : <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-sm font-bold text-black sm:h-10 sm:w-10">{ad.store_name.slice(0, 1).toUpperCase()}</span>}
          <span className="truncate text-sm font-semibold sm:text-base">{ad.store_name}</span>
        </div>
        <h3 className="line-clamp-2 font-heading text-base font-bold leading-tight sm:text-3xl lg:text-4xl">{ad.headline}</h3>
        {ad.description && <p className="hidden text-xs text-white/85 sm:line-clamp-2 sm:block sm:text-sm lg:text-base">{ad.description}</p>}
        <span className="mt-0.5 inline-flex w-fit items-center rounded-full bg-white px-3 py-1 text-xs font-semibold text-black sm:mt-1 sm:px-4 sm:py-1.5 sm:text-sm">{ad.cta_text || 'Visit shop'}</span>
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

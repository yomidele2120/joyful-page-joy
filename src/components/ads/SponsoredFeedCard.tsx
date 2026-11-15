import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ImageOff } from 'lucide-react';
import type { HomepageAd } from '@/lib/ads/adsApi';
import { trackAd } from '@/lib/ads/adsApi';
import { bannerUrl } from '@/lib/ads/adMedia';
import { adShopLink } from '@/lib/ads/adTracking';

/**
 * A sponsored card that sits between product cards. It is the same size and shape as a product card but is always
 * labelled "Sponsored" and opens the vendor's shop, not a product. Photos shown are the vendor's own promoted products.
 */
export default function SponsoredFeedCard({ ad }: { ad: HomepageAd }) {
  const ref = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting && e.intersectionRatio >= 0.5)) { trackAd({ event: 'impression', campaign: ad.id, placement: 'sponsored_row' }); io.disconnect(); }
    }, { threshold: [0.5] });
    io.observe(node);
    return () => io.disconnect();
  }, [ad.id]);

  const photos = (ad.products ?? []).filter((p) => p.image).slice(0, 4);
  return (
    <Link
      ref={ref}
      to={adShopLink(ad.vendor_id, ad.id)}
      onClick={() => trackAd({ event: 'banner_click', campaign: ad.id, placement: 'sponsored_row' })}
      aria-label={`${ad.store_name}: ${ad.headline} (sponsored)`}
      className="group flex h-full flex-col overflow-hidden rounded-2xl bg-card ring-1 ring-primary/30 transition-shadow duration-200 hover:shadow-lg"
    >
      <div className="relative m-1.5 aspect-square overflow-hidden rounded-xl bg-white">
        {photos.length >= 2 ? (
          <div className="grid h-full w-full grid-cols-2 gap-0.5 bg-border/40">
            {photos.map((p) => <img key={p.id} src={p.image!} alt={p.name} loading="lazy" decoding="async" className="h-full w-full bg-white object-contain p-1.5" />)}
          </div>
        ) : photos.length === 1 ? (
          <img src={photos[0].image!} alt={photos[0].name} loading="lazy" decoding="async" className="h-full w-full object-contain p-3 transition-transform duration-300 group-hover:scale-[1.04]" />
        ) : ad.banner_image_url ? (
          <img src={bannerUrl(ad.banner_image_url, 'mobile', 500)} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center bg-secondary text-muted-foreground"><ImageOff className="h-6 w-6" aria-hidden="true" /></span>
        )}
        <span className="absolute left-1.5 top-1.5 rounded-full bg-background/90 px-2 py-0.5 text-[11px] font-medium text-primary shadow-sm">Sponsored</span>
      </div>
      <div className="flex flex-1 flex-col px-2.5 pb-3 pt-1 sm:px-3">
        <h3 className="line-clamp-2 min-h-[2.5rem] text-[13px] font-medium leading-snug text-foreground group-hover:text-primary sm:text-sm">{ad.headline}</h3>
        <div className="mt-auto flex items-center gap-1.5 pt-2 text-xs text-muted-foreground">
          {ad.logo_url
            ? <img src={ad.logo_url} alt="" loading="lazy" className="h-5 w-5 shrink-0 rounded-full bg-white object-cover" />
            : <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-secondary text-[10px] font-bold text-foreground">{ad.store_name.slice(0, 1).toUpperCase()}</span>}
          <span className="min-w-0 flex-1 truncate">{ad.store_name}</span>
          <span className="shrink-0 font-medium text-primary">{ad.cta_text || 'Visit shop'}</span>
        </div>
      </div>
    </Link>
  );
}

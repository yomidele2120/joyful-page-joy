import { Link } from 'react-router-dom';
import type { BrandFlyer } from '@/lib/brandFlyers';
import { cn } from '@/lib/utils';

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

/** A built-in brand flyer at its own proportions, full width. For banners between content. */
export function BrandFlyerBanner({ flyer, className, imgClassName }: { flyer: BrandFlyer; className?: string; imgClassName?: string }) {
  return (
    <Link to={flyer.href} aria-label={flyer.alt} className={cn('block overflow-hidden bg-secondary', focusRing, className)}>
      <img src={flyer.src} alt={flyer.alt} loading="lazy" decoding="async" className={cn('block h-auto w-full', imgClassName)} />
    </Link>
  );
}

/**
 * A built-in brand flyer that fills its box. For hero slides.
 *  fit 'cover'      fills the box, cropping the edges
 *  fit 'contain'    shows the whole flyer on a blurred copy of itself
 *  fit 'contain-sm' like 'cover' on phones, like 'contain' from tablet size up
 *  load={false}     keeps the picture out of the page until the slide is about to be seen (saves data)
 *  eager            the first slide: fetch it straight away instead of lazily
 */
export function BrandFlyerFill({ flyer, className, imgClassName, tabIndex, fit = 'cover', load = true, eager = false }: {
  flyer: BrandFlyer; className?: string; imgClassName?: string; tabIndex?: number;
  fit?: 'cover' | 'contain' | 'contain-sm'; load?: boolean; eager?: boolean;
}) {
  const fitClass = fit === 'contain' ? 'object-contain' : fit === 'contain-sm' ? 'object-cover sm:object-contain' : 'object-cover';
  const backdropClass = fit === 'contain-sm' ? 'hidden sm:block' : 'block';
  return (
    <Link to={flyer.href} aria-label={flyer.alt} tabIndex={tabIndex} className={cn('relative block h-full w-full overflow-hidden bg-secondary', focusRing, className)}>
      {load && (
        <>
          {fit !== 'cover' && (
            <img src={flyer.src} alt="" aria-hidden="true" loading={eager ? 'eager' : 'lazy'} decoding="async"
              className={cn('absolute inset-0 h-full w-full scale-110 object-cover opacity-90 blur-2xl', backdropClass)} />
          )}
          <img src={flyer.src} alt={flyer.alt} loading={eager ? 'eager' : 'lazy'} decoding="async"
            className={cn('absolute inset-0 h-full w-full', fitClass, imgClassName)} />
        </>
      )}
    </Link>
  );
}

/**
 * A built-in 16:9 flyer for the product grids.
 *  Phone: the full row at its own 16:9 shape, so it stays compact (about 190px tall instead of a tall square card).
 *  Tablet and up: two columns wide and as tall as the row of products beside it (at least 260px), with the whole
 *  picture shown (never cropped) on a blurred copy of itself, so no gap is left under it.
 */
export function BrandFlyerFeedCard({ flyer, className }: { flyer: BrandFlyer; className?: string }) {
  return (
    <Link to={flyer.href} aria-label={flyer.alt} style={flyer.bg ? { backgroundColor: flyer.bg } : undefined}
      className={cn('col-span-2 block overflow-hidden bg-secondary sm:relative sm:min-h-[260px]', focusRing, className)}>
      <img src={flyer.src} alt="" aria-hidden="true" loading="lazy" decoding="async"
        className="hidden scale-110 object-cover opacity-90 blur-2xl sm:absolute sm:inset-0 sm:block sm:h-full sm:w-full" />
      <img src={flyer.src} alt={flyer.alt} width={1600} height={900} loading="lazy" decoding="async"
        className="aspect-video w-full object-cover sm:absolute sm:inset-0 sm:aspect-auto sm:h-full sm:object-contain" />
    </Link>
  );
}

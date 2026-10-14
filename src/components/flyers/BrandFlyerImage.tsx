import { Link } from 'react-router-dom';
import type { BrandFlyer } from '@/lib/brandFlyers';
import { cn } from '@/lib/utils';

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

/** A built-in brand flyer at its own proportions, full width. For banners between content. */
export function BrandFlyerBanner({ flyer, className }: { flyer: BrandFlyer; className?: string }) {
  return (
    <Link to={flyer.href} aria-label={flyer.alt} className={cn('block overflow-hidden rounded-lg bg-secondary', focusRing, className)}>
      <img src={flyer.src} alt={flyer.alt} loading="lazy" decoding="async" className="block h-auto w-full" />
    </Link>
  );
}

/** A built-in brand flyer that fills its box (cropping the edges). For hero slides. */
export function BrandFlyerFill({ flyer, className, imgClassName, tabIndex }: { flyer: BrandFlyer; className?: string; imgClassName?: string; tabIndex?: number }) {
  return (
    <Link to={flyer.href} aria-label={flyer.alt} tabIndex={tabIndex} className={cn('relative block h-full w-full overflow-hidden', focusRing, className)}>
      <img src={flyer.src} alt={flyer.alt} decoding="async" className={cn('absolute inset-0 h-full w-full object-cover', imgClassName)} />
    </Link>
  );
}

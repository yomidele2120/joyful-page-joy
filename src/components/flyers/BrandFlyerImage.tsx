import { Link } from 'react-router-dom';
import type { BrandFlyer } from '@/lib/brandFlyers';
import { cn } from '@/lib/utils';

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

/** A built-in brand flyer at its own proportions, full width. For banners between content. */
export function BrandFlyerBanner({ flyer, className }: { flyer: BrandFlyer; className?: string }) {
  return (
    <Link to={flyer.href} aria-label={flyer.alt} className={cn('block overflow-hidden bg-secondary', focusRing, className)}>
      <img src={flyer.src} alt={flyer.alt} loading="lazy" decoding="async" className="block h-auto w-full" />
    </Link>
  );
}

/** A built-in brand flyer that fills its box (cropping the edges). For hero slides. */
export function BrandFlyerFill({ flyer, className, imgClassName, tabIndex, fit = 'cover' }: { flyer: BrandFlyer; className?: string; imgClassName?: string; tabIndex?: number; fit?: 'cover' | 'contain' }) {
  return (
    <Link to={flyer.href} aria-label={flyer.alt} tabIndex={tabIndex} className={cn('relative block h-full w-full overflow-hidden bg-secondary', focusRing, className)}>
      {fit === 'contain' && <img src={flyer.src} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full scale-110 object-cover opacity-60 blur-2xl" />}
      <img src={flyer.src} alt={flyer.alt} decoding="async" className={cn('absolute inset-0 h-full w-full', fit === 'contain' ? 'object-contain' : 'object-cover', imgClassName)} />
    </Link>
  );
}

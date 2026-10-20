import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { UploadedFlyer } from '@/hooks/useFlyers';
import { HERO_SLIDE_RATIO } from '@/lib/flyerPlacements';

// Shows an admin-uploaded flyer image. A phone-sized image is used on small
// screens when the admin added one; otherwise the main image is used everywhere.

function FlyerLink({ flyer, className, children, tabIndex }: { flyer: UploadedFlyer; className?: string; children: React.ReactNode; tabIndex?: number }) {
  const href = flyer.link_url;
  if (!href) return <div className={className}>{children}</div>;
  if (href.startsWith('/')) {
    return <Link to={href} className={className} aria-label={flyer.title} tabIndex={tabIndex}>{children}</Link>;
  }
  return <a href={href} target="_blank" rel="noopener noreferrer" className={className} aria-label={flyer.title} tabIndex={tabIndex}>{children}</a>;
}

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

function Picture({ flyer, className, eager = false, decorative = false, onLoad }: {
  flyer: UploadedFlyer; className: string; eager?: boolean; decorative?: boolean;
  onLoad?: (e: React.SyntheticEvent<HTMLImageElement>) => void;
}) {
  return (
    <picture>
      {flyer.mobile_image_url && <source media="(max-width: 639px)" srcSet={flyer.mobile_image_url} />}
      <img
        src={flyer.image_url} alt={decorative ? '' : flyer.title} aria-hidden={decorative || undefined} className={className}
        loading={eager ? 'eager' : 'lazy'} decoding="async" onLoad={onLoad}
      />
    </picture>
  );
}

/** Keeps the image's own proportions, full width. For banners between content. */
export function ImageFlyerBanner({ flyer, className = '' }: { flyer: UploadedFlyer; className?: string }) {
  return (
    <FlyerLink flyer={flyer} className={`block overflow-hidden bg-secondary ${focusRing} ${className}`}>
      <Picture flyer={flyer} className="block h-auto w-full" />
    </FlyerLink>
  );
}

const BLURRED_BACKDROP = 'absolute inset-0 h-full w-full scale-110 object-cover opacity-90 blur-2xl';

/**
 * Fills whatever box it is given. For slides, tiles and cards.
 *  fit 'cover'    crops the edges to fill the box
 *  fit 'contain'  shows the whole image on a blurred copy of itself
 *  fit 'auto'     (hero slider) once the picture has loaded: a flyer that is already about the shape of the
 *                 slider fills it edge to edge; any other shape is shown whole on the blurred copy instead of
 *                 being cropped, so the text on it is never cut off
 *  load={false}   keeps the picture out of the page until the slide is about to be seen (saves data)
 *  eager          the first slide: fetch it straight away instead of lazily
 */
export function ImageFlyerFill({ flyer, className = '', tabIndex, fit = 'cover', load = true, eager = false }: {
  flyer: UploadedFlyer; className?: string; tabIndex?: number; fit?: 'cover' | 'contain' | 'auto'; load?: boolean; eager?: boolean;
}) {
  const [ratio, setRatio] = useState<number | null>(null);
  const measure = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (img.naturalWidth && img.naturalHeight) setRatio(img.naturalWidth / img.naturalHeight);
  };

  const closeEnough = ratio !== null && Math.abs(ratio / HERO_SLIDE_RATIO - 1) <= 0.06;
  const mode = fit === 'auto' ? (closeEnough ? 'cover' : 'contain') : fit;
  // In 'auto' the blurred bars only appear once we know the picture really needs them.
  const showBackdrop = mode === 'contain' && (fit !== 'auto' || ratio !== null);

  return (
    <FlyerLink flyer={flyer} tabIndex={tabIndex} className={`relative block h-full w-full overflow-hidden bg-secondary ${focusRing} ${className}`}>
      {load && (
        <>
          {showBackdrop && <Picture flyer={flyer} decorative className={BLURRED_BACKDROP} />}
          <Picture
            flyer={flyer} eager={eager} onLoad={fit === 'auto' ? measure : undefined}
            className={`absolute inset-0 h-full w-full ${mode === 'contain' ? 'object-contain' : 'object-cover'}`}
          />
        </>
      )}
    </FlyerLink>
  );
}

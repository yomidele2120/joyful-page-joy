import { Link } from 'react-router-dom';
import type { UploadedFlyer } from '@/hooks/useFlyers';

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

function Picture({ flyer, className }: { flyer: UploadedFlyer; className: string }) {
  return (
    <picture>
      {flyer.mobile_image_url && <source media="(max-width: 639px)" srcSet={flyer.mobile_image_url} />}
      <img src={flyer.image_url} alt={flyer.title} className={className} loading="lazy" decoding="async" />
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

/** Fills whatever box it is given (cropping edges). For slides, tiles and cards. */
export function ImageFlyerFill({ flyer, className = '', tabIndex, fit = 'cover' }: { flyer: UploadedFlyer; className?: string; tabIndex?: number; fit?: 'cover' | 'contain' }) {
  return (
    <FlyerLink flyer={flyer} tabIndex={tabIndex} className={`relative block h-full w-full overflow-hidden bg-secondary ${focusRing} ${className}`}>
      {fit === 'contain' ? (
        <>
          {/* Soft blurred copy fills any spare space, so the whole image always shows, never cropped */}
          <img src={flyer.image_url} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full scale-110 object-cover opacity-60 blur-2xl" />
          <Picture flyer={flyer} className="absolute inset-0 h-full w-full object-contain" />
        </>
      ) : (
        <Picture flyer={flyer} className="absolute inset-0 h-full w-full object-cover" />
      )}
    </FlyerLink>
  );
}

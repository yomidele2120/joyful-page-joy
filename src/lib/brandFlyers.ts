import elevate from '@/assets/brand/flyer-elevate.jpg';
import seamlessPurple from '@/assets/brand/flyer-seamless-purple.jpg';
import seamlessOlive from '@/assets/brand/flyer-seamless-olive.jpg';

// The IT Hub Africa promo flyers that ship with the site. They are shown in
// their planned spots whenever no flyer has been uploaded for that spot in the
// admin "Flyers" tab. Uploading one there replaces the built-in one.

export interface BrandFlyer {
  id: string;
  src: string;
  alt: string;
  href: string;
}

export const BRAND_FLYERS = {
  elevate: { id: 'elevate', src: elevate, alt: 'Elevate your life at I.T Hub Africa, up to 30% off', href: '/products' },
  seamlessPurple: { id: 'seamless-purple', src: seamlessPurple, alt: 'Seamless payment: fast, safe and trusted', href: '/products' },
  seamlessOlive: { id: 'seamless-olive', src: seamlessOlive, alt: 'Seamless payment: fast, safe and trusted', href: '/products' },
} satisfies Record<string, BrandFlyer>;

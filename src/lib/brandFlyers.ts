import elevate from '@/assets/brand/flyer-elevate.jpg';
import seamlessPurple from '@/assets/brand/flyer-seamless-purple.jpg';
import seamlessOlive from '@/assets/brand/flyer-seamless-olive.jpg';
import techFlatlay from '@/assets/brand/hero-tech-flatlay.jpg';
import blackFriday from '@/assets/brand/hero-black-friday.jpg';
import mysteryDeal from '@/assets/brand/card-mystery-deal.jpg';

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
  techFlatlay: { id: 'tech-flatlay', src: techFlatlay, alt: 'Tech gadgets and electronics from verified suppliers at I.T Hub Africa', href: '/products' },
  blackFriday: { id: 'black-friday', src: blackFriday, alt: 'Black Friday super sale: up to 59% off smart watches', href: '/products' },
  mysteryDeal: { id: 'mystery-deal', src: mysteryDeal, alt: 'Mystery deal surprise: up to 50% off gadgets', href: '/products' },
} satisfies Record<string, BrandFlyer>;

// Image slides that open the homepage hero, in this order, before the generated slides.
export const HERO_IMAGE_SLIDES: BrandFlyer[] = [BRAND_FLYERS.elevate, BRAND_FLYERS.techFlatlay, BRAND_FLYERS.blackFriday];

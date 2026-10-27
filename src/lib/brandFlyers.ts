import elevate from '@/assets/brand/flyer-elevate.jpg';
import seamlessPurple from '@/assets/brand/flyer-seamless-purple.jpg';
import seamlessOlive from '@/assets/brand/flyer-seamless-olive.jpg';
import techFlatlay from '@/assets/brand/hero-tech-flatlay.jpg';
import blackFriday from '@/assets/brand/hero-black-friday.jpg';
import mysteryDeal from '@/assets/brand/card-mystery-deal.jpg';
import payLater from '@/assets/brand/flyer-pay-later.webp';
import clothing from '@/assets/brand/flyer-clothing.webp';
import preorderKitchen from '@/assets/brand/flyer-preorder-kitchen.webp';
import suppliers from '@/assets/brand/flyer-suppliers.webp';
import sellSide from '@/assets/brand/flyer-side-sell.webp';
import rfq from '@/assets/brand/flyer-rfq.webp';
import sell from '@/assets/brand/flyer-sell.webp';
import dealsSide from '@/assets/brand/flyer-side-deals.webp';
import makeMoneyBadge from '@/assets/brand/badge-make-money.webp';

// The IT Hub Africa promo flyers that ship with the site. They are shown in
// their planned spots whenever no flyer has been uploaded for that spot in the
// admin "Flyers" tab. Uploading one there replaces the built-in one.

export interface BrandFlyer {
  id: string;
  src: string;
  alt: string;
  href: string;
  /** Optional object-position classes, e.g. to keep the subject visible when cropped. */
  focus?: string;
  /** 'contain' shows the whole flyer (never cropped) on a blurred copy of itself. Default is 'cover'.
   *  'contain-sm' crops to fill on phones (using `focus`) and shows the whole flyer from tablet size up. */
  fit?: 'cover' | 'contain' | 'contain-sm';
  /** Colour behind the picture (matches its edges) for the blurred backdrop used in the product grids. */
  bg?: string;
  /** Pinned slides stay in the hero slider even when the admin has uploaded enough of their own to hide the built-in ones. */
  pinned?: boolean;
}

export const BRAND_FLYERS = {
  elevate: { id: 'elevate', src: elevate, alt: 'Elevate your life at I.T Hub Africa, up to 30% off', href: '/products', focus: 'object-[65%_center]', fit: 'contain-sm' },
  seamlessPurple: { id: 'seamless-purple', src: seamlessPurple, alt: 'Seamless payment: fast, safe and trusted', href: '/products' },
  seamlessOlive: { id: 'seamless-olive', src: seamlessOlive, alt: 'Seamless payment: fast, safe and trusted', href: '/products' },
  techFlatlay: { id: 'tech-flatlay', src: techFlatlay, alt: 'Tech gadgets and electronics from verified suppliers at I.T Hub Africa', href: '/products' },
  blackFriday: { id: 'black-friday', src: blackFriday, alt: 'Black Friday super sale: up to 59% off smart watches', href: '/products' },
  // Wide 2:1 flyers with text near every edge, so they are shown whole instead of cropped.
  payLater: { id: 'pay-later', src: payLater, alt: 'Buy now, pay later: get the latest phones and laptops and spread your payments', href: '/pay-later', fit: 'contain', pinned: true },
  clothing: { id: 'clothing', src: clothing, alt: 'Adult and children clothing collection: stylish, comfortable, for every generation', href: '/category/fashion', fit: 'contain', pinned: true },
  preorderKitchen: { id: 'preorder-kitchen', src: preorderKitchen, alt: 'Preorder kitchen utensils now, before they are out of stock', href: '/preorders', fit: 'contain', pinned: true },
  // 16:9 banner with its headline and button drawn into the picture, so it is shown whole (no text overlay).
  suppliers: { id: 'suppliers', src: suppliers, alt: 'Meet trusted suppliers. Discover quality products from suppliers you can count on. Explore suppliers.', href: '/products?tab=suppliers', bg: '#e0eaf6' },
  // Dark 16:9 banners for the product grids (they replace the old tall square cards).
  rfq: { id: 'rfq', src: rfq, alt: 'Can’t find it? We’ll get it for you. Tell us what you need and we’ll source it from trusted suppliers. Post a request.', href: '/rfq/new', bg: '#0b1626' },
  sell: { id: 'sell', src: sell, alt: 'Sell to buyers across Nigeria. Open your store, list your products and start receiving inquiries from buyers. Open your store.', href: '/supplier-signup', bg: '#0b1626' },
  // 4:3 tiles for the two spots beside the hero slider. Headline, subline and button are drawn into the picture,
  // with everything kept well inside the edges, so they survive the slightly different tile shapes (cover fit).
  sellSide: { id: 'sell-side', src: sellSide, alt: 'Sell to buyers across Nigeria. List products and receive inquiries. Open your store.', href: '/supplier-signup' },
  dealsSide: { id: 'deals-side', src: dealsSide, alt: 'Price drops on bulk favourites. Prices reduced by the seller. See the deals.', href: '/products' },
  mysteryDeal: { id: 'mystery-deal', src: mysteryDeal, alt: 'Mystery deal surprise: up to 50% off gadgets', href: '/products' },
} satisfies Record<string, BrandFlyer>;

// Image slides that open the homepage hero, in this order, before the generated slides.
export const HERO_IMAGE_SLIDES: BrandFlyer[] = [
  BRAND_FLYERS.elevate, BRAND_FLYERS.payLater, BRAND_FLYERS.clothing,
  BRAND_FLYERS.preorderKitchen, BRAND_FLYERS.techFlatlay, BRAND_FLYERS.blackFriday,
];

// The two flyers beside the hero slider, top to bottom (side by side on phones).
export const HERO_SIDE_FLYERS: BrandFlyer[] = [BRAND_FLYERS.sellSide, BRAND_FLYERS.dealsSide];

/** Small round "Make Money, be your own boss" badge for supplier sign-up spots. */
export const MAKE_MONEY_BADGE = { src: makeMoneyBadge, alt: 'Make money. Be your own boss.' };

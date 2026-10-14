// Promotional flyers shown around the marketplace. Every flyer points at a
// real page and uses product photos from the database for its artwork, so
// nothing here claims a price, discount or number that isn't true.

export type FlyerTone = 'green' | 'ink' | 'orange' | 'mint';
export type FlyerIconName = 'bag' | 'quote' | 'store' | 'tag' | 'play' | 'box' | 'sparkles';

export interface Flyer {
  id: string;
  tone: FlyerTone;
  icon: FlyerIconName;
  title: string;
  text: string;
  cta: string;
  href: string;
  // Which slice of the product photos to use for the artwork, so the same
  // photos don't repeat in every flyer on the page.
  offset: number;
}

export const FLYERS: Record<string, Flyer> = {
  bulk: {
    id: 'bulk', tone: 'green', icon: 'bag', offset: 0,
    title: 'Source in bulk from verified suppliers',
    text: 'Compare price breaks and minimum orders in one place.',
    cta: 'Browse products', href: '/products',
  },
  rfq: {
    id: 'rfq', tone: 'ink', icon: 'quote', offset: 3,
    title: 'Can’t find it? Tell suppliers what you need',
    text: 'Post one request and get quotations sent to you.',
    cta: 'Post a request', href: '/rfq/new',
  },
  sell: {
    id: 'sell', tone: 'mint', icon: 'store', offset: 6,
    title: 'Sell to buyers across Nigeria',
    text: 'Open your store, list products and receive inquiries.',
    cta: 'Open your store', href: '/supplier-signup',
  },
  deals: {
    id: 'deals', tone: 'orange', icon: 'tag', offset: 2,
    title: 'Price drops on bulk favourites',
    text: 'Products whose price has been reduced by the seller.',
    cta: 'See the deals', href: '/products',
  },
  watch: {
    id: 'watch', tone: 'ink', icon: 'play', offset: 5,
    title: 'Watch products in action',
    text: 'Short videos from sellers, with a shop button on every post.',
    cta: 'Watch and shop', href: '/feed',
  },
  lowMoq: {
    id: 'lowMoq', tone: 'green', icon: 'box', offset: 8,
    title: 'Start small with low minimum orders',
    text: 'Test a product before you commit to a full carton.',
    cta: 'Shop low MOQ', href: '/products',
  },
  suppliers: {
    id: 'suppliers', tone: 'mint', icon: 'sparkles', offset: 1,
    title: 'Meet verified suppliers',
    text: 'Browse approved sellers and message them directly.',
    cta: 'View suppliers', href: '/products?tab=suppliers',
  },
};

// Short lines for the rotating header strip.
export const HEADER_MESSAGES: { text: string; href: string; cta: string }[] = [
  { text: 'Source in bulk from verified Nigerian suppliers', href: '/products', cta: 'Browse' },
  { text: 'Need a price? Post one request and suppliers quote you', href: '/rfq/new', cta: 'Post RFQ' },
  { text: 'Sell your products to buyers nationwide', href: '/supplier-signup', cta: 'Open a store' },
  { text: 'Watch short product videos from sellers', href: '/feed', cta: 'Watch' },
];

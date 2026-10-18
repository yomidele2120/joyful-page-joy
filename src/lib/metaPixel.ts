// Meta (Facebook) Pixel for the storefront.
//
// The pixel is OFF unless VITE_META_PIXEL_ID is set to a valid Pixel ID, so
// local development and previews never send anything to Meta.
//
// Rules this file follows:
//  - Only product ids, names, quantities and totals are sent. No names, emails,
//    phone numbers or addresses.
//  - Admin, supplier-dashboard, inbox and account pages are never reported.
//  - A Purchase is reported once per order, and only after the payment has been
//    confirmed by our server.

const PIXEL_ID = (import.meta.env.VITE_META_PIXEL_ID as string | undefined)?.trim() ?? '';
const CURRENCY = 'NGN';

type Fbq = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  queue: unknown[];
  loaded: boolean;
  version: string;
  push: unknown;
};

declare global {
  interface Window { fbq?: Fbq; _fbq?: Fbq }
}

// Pages that are private to the shop owner or the signed-in person: never reported.
const PRIVATE_PREFIXES = ['/admin', '/admin-login', '/supplier-dashboard', '/supplier-chat', '/user-dashboard', '/messages', '/inquiries'];

let started = false;

/** True when a valid Pixel ID is configured (numbers only, as Meta issues them). */
export function isPixelEnabled(): boolean {
  return /^\d{8,20}$/.test(PIXEL_ID);
}

export function isPrivatePath(pathname: string): boolean {
  return PRIVATE_PREFIXES.some(p => pathname === p || pathname.startsWith(`${p}/`));
}

/** Loads Meta's script and registers the Pixel ID. Safe to call many times. */
export function initPixel(): void {
  if (started || typeof window === 'undefined' || !isPixelEnabled()) return;
  started = true;

  // This is Meta's standard loader, written out in TypeScript. Calls made before
  // the script has downloaded are queued and replayed by Meta's script.
  if (!window.fbq) {
    const fbq = function (...args: unknown[]) {
      if (fbq.callMethod) fbq.callMethod(...args);
      else fbq.queue.push(args);
    } as Fbq;
    window.fbq = fbq;
    if (!window._fbq) window._fbq = fbq;
    fbq.push = fbq;
    fbq.loaded = true;
    fbq.version = '2.0';
    fbq.queue = [];

    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://connect.facebook.net/en_US/fbevents.js';
    document.head.appendChild(script);
  }

  window.fbq!('init', PIXEL_ID);
}

function send(event: string, params?: Record<string, unknown>, eventId?: string): void {
  if (!started || !window.fbq) return;
  if (eventId) window.fbq('track', event, params ?? {}, { eventID: eventId });
  else if (params) window.fbq('track', event, params);
  else window.fbq('track', event);
}

// ---- Events ---------------------------------------------------------------

export function trackPageView(pathname: string): void {
  if (isPrivatePath(pathname)) return;
  send('PageView');
}

export function trackViewContent(p: { id: string; name: string; price: number }): void {
  send('ViewContent', {
    content_type: 'product', content_ids: [p.id], content_name: p.name,
    value: p.price, currency: CURRENCY,
  });
}

export function trackSearch(term: string): void {
  const q = term.trim();
  if (q) send('Search', { search_string: q.slice(0, 100) });
}

export function trackAddToCart(p: { id: string; name: string; price: number; quantity: number }): void {
  send('AddToCart', {
    content_type: 'product', content_ids: [p.id], content_name: p.name,
    contents: [{ id: p.id, quantity: p.quantity, item_price: p.price }],
    value: p.price * p.quantity, currency: CURRENCY,
  });
}

interface CartLine { id: string; quantity: number; unitPrice: number }

function cartParams(lines: CartLine[], value: number) {
  return {
    content_type: 'product',
    content_ids: lines.map(l => l.id),
    contents: lines.map(l => ({ id: l.id, quantity: l.quantity, item_price: l.unitPrice })),
    num_items: lines.reduce((n, l) => n + l.quantity, 0),
    value, currency: CURRENCY,
  };
}

export function trackInitiateCheckout(lines: CartLine[], value: number): void {
  if (lines.length) send('InitiateCheckout', cartParams(lines, value));
}

/** Reports a confirmed purchase once per order (the order id doubles as Meta's dedupe id). */
export function trackPurchase(orderId: string, lines: CartLine[], value: number): void {
  const key = `meta_pixel_purchase_${orderId}`;
  try {
    if (window.sessionStorage.getItem(key)) return;
    window.sessionStorage.setItem(key, '1');
  } catch { /* storage unavailable: still report once per page load */ }
  send('Purchase', cartParams(lines, value), orderId);
}

export function trackRegistration(kind: 'buyer' | 'supplier'): void {
  send('CompleteRegistration', { content_name: kind, status: true });
}

export function trackLead(kind: 'inquiry' | 'rfq', productId?: string): void {
  send('Lead', { content_name: kind, ...(productId ? { content_ids: [productId] } : {}) });
}

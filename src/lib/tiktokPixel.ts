// TikTok Pixel for the storefront.
//
// /tiktok-pixel.js (loaded from index.html) starts the pixel on hold. This file lets it send data only
// while the visitor allows marketing cookies, and reports the shop events TikTok understands.
//
// Rules:
//  - Only product ids, names, quantities, prices and totals are sent. No names, emails, phones, addresses or card details.
//  - Admin, supplier-dashboard, inbox and account pages are never reported.
//  - CompletePayment is sent once per order, only after our server has confirmed the payment, and uses the
//    order id as its event id so the server-side Events API copy of the same event is merged, not counted twice.

const CURRENCY = 'NGN';

type Ttq = {
  grantConsent?: () => void;
  revokeConsent?: () => void;
  page?: () => void;
  track?: (event: string, params?: Record<string, unknown>, options?: { event_id?: string }) => void;
};
declare global { interface Window { ttq?: Ttq } }

const PRIVATE = ['/admin', '/admin-login', '/supplier-dashboard', '/supplier-chat', '/user-dashboard', '/messages', '/inquiries'];
export function isPrivatePath(pathname: string): boolean {
  return PRIVATE.some(p => pathname === p || pathname.startsWith(`${p}/`));
}

let firstPage = true;
let allowed = false;

export function grantPixel(): void {
  allowed = true;
  try { window.ttq?.grantConsent?.(); } catch { /* pixel blocked by an ad blocker: ignore */ }
}

export function stopPixel(): void {
  allowed = false;
  try { window.ttq?.revokeConsent?.(); } catch { /* ignore */ }
}

function send(event: string, params?: Record<string, unknown>, eventId?: string): void {
  if (!allowed) return;
  try { window.ttq?.track?.(event, params ?? {}, eventId ? { event_id: eventId } : undefined); } catch { /* ignore */ }
}

/** The pixel reports the first page itself; later in-app page changes are reported here. */
export function trackPageView(pathname: string): void {
  if (firstPage) { firstPage = false; return; }
  if (isPrivatePath(pathname)) return;
  try { window.ttq?.page?.(); } catch { /* ignore */ }
}

interface CartLine { id: string; name?: string; quantity: number; unitPrice: number }

function contents(lines: CartLine[]) {
  return lines.map(l => ({
    content_id: l.id, content_type: 'product', quantity: l.quantity, price: l.unitPrice,
    ...(l.name ? { content_name: l.name } : {}),
  }));
}

function cartParams(lines: CartLine[], value: number) {
  return { contents: contents(lines), content_type: 'product', value, currency: CURRENCY };
}

export function trackViewContent(p: { id: string; name: string; price: number }): void {
  send('ViewContent', { contents: [{ content_id: p.id, content_type: 'product', content_name: p.name, quantity: 1, price: p.price }], content_type: 'product', value: p.price, currency: CURRENCY });
}

export function trackAddToCart(p: { id: string; name: string; price: number; quantity: number }): void {
  send('AddToCart', cartParams([{ id: p.id, name: p.name, quantity: p.quantity, unitPrice: p.price }], p.price * p.quantity));
}

export function trackInitiateCheckout(lines: CartLine[], value: number): void {
  if (lines.length) send('InitiateCheckout', cartParams(lines, value));
}

/** The buyer has chosen how to pay and pressed pay (once per order). */
export function trackAddPaymentInfo(orderId: string, lines: CartLine[], value: number): void {
  if (!lines.length || !once(`tiktok_pixel_payinfo_${orderId}`)) return;
  send('AddPaymentInfo', cartParams(lines, value));
}

/** A confirmed payment. A confirmed preorder is also reported as SubmitForm. */
export function trackPurchase(orderId: string, lines: CartLine[], value: number, preorder = false): void {
  if (!once(`tiktok_pixel_purchase_${orderId}`)) return;
  send('CompletePayment', cartParams(lines, value), orderId);
  if (preorder) send('SubmitForm', cartParams(lines, value), `${orderId}:preorder`);
}

export function trackRegistration(kind: 'buyer' | 'supplier'): void {
  send('CompleteRegistration', { content_name: kind, status: 'completed' });
}

/** True the first time for a key in this browser session. */
function once(key: string): boolean {
  try {
    if (window.sessionStorage.getItem(key)) return false;
    window.sessionStorage.setItem(key, '1');
  } catch { /* storage unavailable: still report once per page load */ }
  return true;
}

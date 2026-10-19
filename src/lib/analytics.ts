// First-party site analytics: our own "pixel", stored in our own database.
//
// What it records: page views, product views, searches, add to cart, checkout
// start, purchase, sign-ups and inquiries, each tagged with a random visitor id,
// the page path, the device type and where the visit came from.
// What it never records: names, emails, phone numbers, addresses, IP addresses
// or the text of anything a person types (except the search words they search for).
//
// It stays quiet for: private pages (admin, dashboards, inbox), search-engine
// and automated visitors, people with "Do Not Track" turned on, and local
// development (set VITE_ANALYTICS_IN_DEV=true to try it locally).
// Set VITE_ANALYTICS_ENABLED=false to switch it off completely.

import { isPrivatePath } from './metaPixel';

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '';
const SUPABASE_KEY = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ?? '';
const SWITCHED_OFF = import.meta.env.VITE_ANALYTICS_ENABLED === 'false';
const ALLOW_IN_DEV = import.meta.env.VITE_ANALYTICS_IN_DEV === 'true';
const IS_DEV = !!import.meta.env.DEV;

const BOT_PATTERN = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|facebookexternalhit|whatsapp/i;
const FLUSH_AFTER_MS = 3000;
const FLUSH_AT = 10;
const MAX_PER_REQUEST = 50;

interface Row {
  visitor_id: string;
  session_id: string;
  event: string;
  path?: string;
  product_id?: string;
  order_id?: string;
  search_term?: string;
  label?: string;
  value?: number;
  source?: string;
  campaign?: string;
  referrer_host?: string;
  device?: 'mobile' | 'tablet' | 'desktop';
}

let ready = false;
let visitorId = '';
let sessionId = '';
let attribution: { source: string; campaign?: string; referrer_host?: string } = { source: 'direct' };
const queue: Row[] = [];
let timer: number | undefined;

// ---- helpers (exported so they can be tested) -----------------------------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function randomId(): string {
  try { if (crypto.randomUUID) return crypto.randomUUID(); } catch { /* fall through */ }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
}

/** Works out where a visit came from: a campaign tag wins, then the referring site. */
export function classifySource(i: {
  referrerHost?: string; ownHost?: string; utmSource?: string | null; hasFbclid?: boolean; hasGclid?: boolean;
}): string {
  const utm = i.utmSource?.trim().toLowerCase();
  if (utm) return utm.slice(0, 60);
  if (i.hasFbclid) return 'facebook';
  if (i.hasGclid) return 'google';

  const host = (i.referrerHost ?? '').toLowerCase().replace(/^www\./, '');
  const own = (i.ownHost ?? '').toLowerCase().replace(/^www\./, '');
  if (!host || (own && (host === own || host.endsWith(`.${own}`)))) return 'direct';

  if (/(^|\.)(facebook|fb)\.com$/.test(host) || host === 'fb.me' || host === 'l.facebook.com') return 'facebook';
  if (/(^|\.)instagram\.com$/.test(host)) return 'instagram';
  if (/(^|\.)google\./.test(host)) return 'google';
  if (/(^|\.)bing\.com$/.test(host)) return 'bing';
  if (host === 't.co' || /(^|\.)(twitter|x)\.com$/.test(host)) return 'twitter';
  if (host === 'wa.me' || /(^|\.)whatsapp\.com$/.test(host)) return 'whatsapp';
  if (/(^|\.)linkedin\.com$/.test(host) || host === 'lnkd.in') return 'linkedin';
  if (/(^|\.)youtube\.com$/.test(host) || host === 'youtu.be') return 'youtube';
  if (/(^|\.)tiktok\.com$/.test(host)) return 'tiktok';
  return host.slice(0, 60);
}

function deviceType(): 'mobile' | 'tablet' | 'desktop' {
  const w = window.innerWidth;
  return w < 640 ? 'mobile' : w < 1024 ? 'tablet' : 'desktop';
}

function isWanted(): boolean {
  if (typeof window === 'undefined') return false;
  if (SWITCHED_OFF || !SUPABASE_URL || !SUPABASE_KEY) return false;
  if (IS_DEV && !ALLOW_IN_DEV) return false;
  const nav = window.navigator;
  if (nav.webdriver || BOT_PATTERN.test(nav.userAgent || '')) return false;
  if (nav.doNotTrack === '1' || (window as unknown as { doNotTrack?: string }).doNotTrack === '1') return false;
  return true;
}

function remember(storage: Storage | undefined, key: string, make: () => string): string {
  try {
    const existing = storage?.getItem(key);
    if (existing) return existing;
    const fresh = make();
    storage?.setItem(key, fresh);
    return fresh;
  } catch {
    return make(); // storage blocked: the id lives only until the page closes
  }
}

// ---- sending --------------------------------------------------------------

function flush(): void {
  if (timer !== undefined) { window.clearTimeout(timer); timer = undefined; }
  while (queue.length) {
    const batch = queue.splice(0, MAX_PER_REQUEST);
    // keepalive lets the request finish even if the visitor is closing the tab.
    // Failures are ignored on purpose: analytics must never break the shop.
    void fetch(`${SUPABASE_URL}/rest/v1/analytics_events`, {
      method: 'POST',
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(batch),
    }).catch(() => undefined);
  }
}

function record(event: string, fields: Partial<Row> = {}): void {
  if (!ready) return;
  const path = (fields.path ?? window.location.pathname).slice(0, 300);
  if (isPrivatePath(path)) return;
  queue.push({
    visitor_id: visitorId,
    session_id: sessionId,
    event,
    path,
    device: deviceType(),
    source: attribution.source,
    campaign: attribution.campaign,
    referrer_host: attribution.referrer_host,
    ...fields,
  });
  if (queue.length >= FLUSH_AT) flush();
  else if (timer === undefined) timer = window.setTimeout(flush, FLUSH_AFTER_MS);
}

// ---- public API (same names as the Meta Pixel module) ----------------------

export function initAnalytics(): void {
  if (ready || !isWanted()) return;

  visitorId = remember(window.localStorage, 'ana_vid', randomId);
  sessionId = remember(window.sessionStorage, 'ana_sid', randomId);

  // Where this visit came from is decided once, on the first page of the session.
  const cached = (() => { try { return window.sessionStorage.getItem('ana_attr'); } catch { return null; } })();
  if (cached) {
    try { attribution = JSON.parse(cached); } catch { /* use default */ }
  } else {
    const params = new URLSearchParams(window.location.search);
    let referrerHost = '';
    try { referrerHost = document.referrer ? new URL(document.referrer).hostname : ''; } catch { /* ignore */ }
    attribution = {
      source: classifySource({
        referrerHost, ownHost: window.location.hostname, utmSource: params.get('utm_source'),
        hasFbclid: params.has('fbclid'), hasGclid: params.has('gclid'),
      }),
      campaign: params.get('utm_campaign')?.slice(0, 100) || undefined,
      referrer_host: referrerHost.slice(0, 100) || undefined,
    };
    try { window.sessionStorage.setItem('ana_attr', JSON.stringify(attribution)); } catch { /* ignore */ }
  }

  ready = true;
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
  window.addEventListener('pagehide', flush);
}

/** Stop recording and forget this device's analytics ids (used when a visitor withdraws consent). */
export function stopAnalytics(): void {
  ready = false;
  queue.length = 0;
  if (timer !== undefined) { window.clearTimeout(timer); timer = undefined; }
  try {
    window.localStorage.removeItem('ana_vid');
    window.sessionStorage.removeItem('ana_sid');
    window.sessionStorage.removeItem('ana_attr');
  } catch { /* storage unavailable */ }
}

export function trackPageView(pathname: string): void {
  record('PageView', { path: pathname });
}

export function trackViewContent(p: { id: string; name: string; price: number }): void {
  record('ViewContent', { product_id: UUID.test(p.id) ? p.id : undefined, value: p.price });
}

// resultCount = how many products the search found. It lets the admin see searches that found nothing.
export function trackSearch(term: string, resultCount?: number): void {
  const q = term.trim().slice(0, 100);
  if (!q) return;
  const hasCount = typeof resultCount === 'number' && Number.isFinite(resultCount);
  record('Search', { search_term: q, ...(hasCount ? { value: Math.max(0, Math.round(resultCount as number)) } : {}) });
}

export function trackAddToCart(p: { id: string; name: string; price: number; quantity: number }): void {
  record('AddToCart', { product_id: UUID.test(p.id) ? p.id : undefined, value: p.price * p.quantity });
}

export function trackInitiateCheckout(_lines: unknown[], value: number): void {
  record('InitiateCheckout', { value });
}

export function trackPurchase(orderId: string, _lines: unknown[], value: number): void {
  const key = `ana_purchase_${orderId}`;
  try {
    if (window.sessionStorage.getItem(key)) return;
    window.sessionStorage.setItem(key, '1');
  } catch { /* storage unavailable: still report once per page load */ }
  record('Purchase', { order_id: UUID.test(orderId) ? orderId : undefined, value });
}

export function trackRegistration(kind: 'buyer' | 'supplier'): void {
  record('CompleteRegistration', { label: kind });
}

export function trackLead(kind: 'inquiry' | 'rfq', productId?: string): void {
  record('Lead', { label: kind, product_id: productId && UUID.test(productId) ? productId : undefined });
}

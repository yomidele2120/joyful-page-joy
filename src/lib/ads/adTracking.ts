// Visitor id, attribution and event de-duplication for ads. Browser-only pieces are injected so this is testable.
// The database independently de-duplicates and rate-limits (record_ad_event); this just avoids pointless calls.

export interface KV { getItem(k: string): string | null; setItem(k: string, v: string): void }
export const VISITOR_RE = /^[A-Za-z0-9_-]{8,64}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);

const memory = (): KV => { const m = new Map<string, string>(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); } }; };
/** Storage that never throws (private windows, blocked cookies). */
export function safeStore(real: KV | undefined): KV {
  const fallback = memory();
  return {
    getItem: (k) => { try { return real?.getItem(k) ?? fallback.getItem(k); } catch { return fallback.getItem(k); } },
    setItem: (k, v) => { try { real?.setItem(k, v); } catch { /* ignore */ } fallback.setItem(k, v); },
  };
}

export function getVisitorId(store: KV, randomId: () => string = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}${Math.random()}`)): string {
  const KEY = 'ith_ad_visitor';
  const existing = store.getItem(KEY);
  if (existing && VISITOR_RE.test(existing)) return existing;
  const id = randomId().replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40).padEnd(12, 'x');
  store.setItem(KEY, id);
  return id;
}

export const deviceFromWidth = (w: number): 'mobile' | 'tablet' | 'desktop' => (w < 640 ? 'mobile' : w < 1024 ? 'tablet' : 'desktop');

/** The only destination an ad may use: its own shop, tagged with the campaign for attribution. */
export function adShopLink(vendorId: string, campaignId: string): string {
  return `/shop/${encodeURIComponent(vendorId)}?ad=${encodeURIComponent(campaignId)}`;
}
/** Reads ?ad=<campaign> from a query string; anything that is not a UUID is ignored. */
export function readAttribution(search: string): string | null {
  const v = new URLSearchParams(search).get('ad');
  return isUuid(v) ? v : null;
}
/** Remembers which ad brought the visitor in, for this browser session only. */
export function rememberAttribution(session: KV, campaignId: string | null) { if (campaignId && isUuid(campaignId)) session.setItem('ith_ad_attr', campaignId); }
export const recallAttribution = (session: KV): string | null => { const v = session.getItem('ith_ad_attr'); return isUuid(v) ? v : null; };

export type AdEventName = 'impression' | 'banner_click' | 'shop_visit' | 'product_visit' | 'social_click';
export interface AdEvent { event: AdEventName; campaign: string; placement: string; social?: string | null; product?: string | null }
export type SendAdEvent = (e: Required<Pick<AdEvent, 'event' | 'campaign' | 'placement'>> & { visitor: string; device: string; social: string | null; product: string | null }) => Promise<unknown> | void;

/** Sends each impression once per campaign+placement per page session; clicks and visits always go (the server de-dupes). */
export function createAdTracker(opts: { store: KV; send: SendAdEvent; width: () => number }) {
  const sentImpressions = new Set<string>();
  return function track(e: AdEvent): boolean {
    if (!isUuid(e.campaign)) return false;
    if (e.event === 'impression') {
      const key = `${e.campaign}:${e.placement}`;
      if (sentImpressions.has(key)) return false;
      sentImpressions.add(key);
    }
    try {
      void Promise.resolve(opts.send({ event: e.event, campaign: e.campaign, placement: e.placement, visitor: getVisitorId(opts.store),
        device: deviceFromWidth(opts.width()), social: e.social ?? null, product: e.product ?? null })).catch(() => {});
    } catch { /* tracking must never break the page */ }
    return true;
  };
}

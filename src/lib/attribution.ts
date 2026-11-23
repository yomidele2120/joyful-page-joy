// Remembers which advertisement brought the visitor, for the rest of the visit, and hands it to the server
// when an order is created. Campaign tags (utm_*, ad_*) are not personal data. TikTok's own click id and
// browser id are only passed on when the visitor allowed marketing cookies.
import { supabase } from '@/integrations/supabase/client';
import { hasConsent } from './consent';

const KEY = 'ithub.ad-attribution';
const TAGS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'ad_campaign', 'ad_vendor', 'ad_product', 'ttclid'] as const;
type Tag = (typeof TAGS)[number];
export type Attribution = Partial<Record<Tag, string>>;

/** Reads the advertisement tags from the address bar. A new tagged visit replaces the old one; an untagged page keeps it. */
export function captureAttribution(search = typeof window !== 'undefined' ? window.location.search : ''): void {
  try {
    const params = new URLSearchParams(search);
    const found: Attribution = {};
    TAGS.forEach(t => { const v = params.get(t); if (v) found[t] = v.slice(0, 200); });
    if (Object.keys(found).length) window.sessionStorage.setItem(KEY, JSON.stringify(found));
  } catch { /* storage unavailable: attribution is simply not kept */ }
}

export function getAttribution(): Attribution {
  try { return JSON.parse(window.sessionStorage.getItem(KEY) ?? '{}') as Attribution; } catch { return {}; }
}

function cookie(name: string): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

/** Tells the server what brought this buyer, for their own just-created order. Never blocks or breaks checkout. */
export async function recordOrderAttribution(orderId: string): Promise<void> {
  try {
    const a = getAttribution();
    const consent = hasConsent('marketing');
    await supabase.rpc('record_order_attribution', {
      _order_id: orderId,
      _marketing_consent: consent,
      _ttclid: consent ? (a.ttclid ?? cookie('ttclid')) : null,
      _ttp: consent ? cookie('_ttp') : null,
      _utm: { utm_source: a.utm_source, utm_medium: a.utm_medium, utm_campaign: a.utm_campaign, utm_content: a.utm_content, ad_campaign: a.ad_campaign, ad_vendor: a.ad_vendor, ad_product: a.ad_product },
      _page_url: window.location.href.split('?')[0],
      _user_agent: navigator.userAgent,
      _fbp: consent ? cookie('_fbp') : null,
      _fbc: consent ? cookie('_fbc') : null,
    } as never);
  } catch { /* attribution is optional */ }
}

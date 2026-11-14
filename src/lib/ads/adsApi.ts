// Thin wrapper over the advertising RPCs (supabase/migrations/20261114090000_vendor_advertising.sql).
// The generated Supabase types do not know these functions yet, so calls go through a loosely typed client.
import { supabase } from '@/integrations/supabase/client';
import type { RotatableAd } from './adRotation';
import type { SocialBannerSettings } from './socialBannerSchedule';
import { createAdTracker, safeStore, type KV } from './adTracking';

const rpc = (name: string, args?: Record<string, unknown>) => (supabase as any).rpc(name, args) as Promise<{ data: any; error: { message: string } | null }>;

export type AdPlacement = 'featured' | 'sponsored_row' | 'rotating';
export interface PublicAdSettings {
  ads_enabled: boolean; featured_banner_limit: number; sponsored_banner_limit: number; sponsored_row_interval: number;
  rotating_limit: number; rotation_minutes: number; social_banner_enabled: boolean;
}
export interface HomepageAd extends RotatableAd {
  campaign_type: 'shop_promotion' | 'product_promotion';
  headline: string; description: string | null; cta_text: string | null; banner_image_url: string;
  store_name: string; logo_url: string | null; category: string | null;
  products: { id: string; slug: string | null; name: string; image: string | null }[];
}
export interface SocialAccount { id: string; platform: 'instagram' | 'facebook' | 'tiktok'; handle: string; display_name: string | null; profile_url: string; verified: boolean }
export interface ShopSocialBanner {
  vendor: { id: string; store_name: string; logo_url: string | null };
  accounts: SocialAccount[];
  settings: SocialBannerSettings;
}

export async function fetchAdSettings(): Promise<PublicAdSettings | null> {
  const { data, error } = await rpc('get_public_ad_settings');
  return error || !data ? null : (data as PublicAdSettings);
}
export async function fetchHomepageAds(placement: AdPlacement, limit = 30): Promise<HomepageAd[]> {
  const { data, error } = await rpc('get_homepage_ads', { _placement: placement, _limit: limit });
  return error || !Array.isArray(data) ? [] : (data as HomepageAd[]);   // ads are optional: any failure means "show none"
}
export async function fetchShopSocialBanner(vendorId: string): Promise<ShopSocialBanner | null> {
  const { data, error } = await rpc('get_shop_social_banner', { _vendor_id: vendorId });
  return error || !data ? null : (data as ShopSocialBanner);
}

const local = (): KV | undefined => { try { return window.localStorage; } catch { return undefined; } };
const session = (): KV | undefined => { try { return window.sessionStorage; } catch { return undefined; } };
export const adLocalStore = () => safeStore(local());
export const adSessionStore = () => safeStore(session());

/** One tracker per page load. Failures are swallowed: tracking must never affect browsing. */
export const trackAd = createAdTracker({
  store: adLocalStore(),
  width: () => (typeof window === 'undefined' ? 1280 : window.innerWidth),
  send: (e) => rpc('record_ad_event', {
    _event: e.event, _campaign: e.campaign, _placement: e.placement, _visitor: e.visitor, _social: e.social, _product: e.product, _device: e.device,
  }),
});
export function trackSocial(event: 'impression' | 'social_click', socialId: string) {
  void rpc('record_ad_event', { _event: event, _campaign: null, _placement: 'social_banner', _visitor: adVisitor(), _social: socialId, _product: null, _device: null });
}
import { getVisitorId } from './adTracking';
const adVisitor = () => getVisitorId(adLocalStore());

// ---------------------------------------------------------------- dashboards (vendor + admin)
/** Calls a database function and throws a readable Error on failure (messages come from the function's own validation). */
export async function call<T = any>(name: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}

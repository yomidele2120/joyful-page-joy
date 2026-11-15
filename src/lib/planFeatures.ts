// Turns one row of the database's plan_catalog() into the plain list of what the plan includes.
// Every line comes from a number the database enforces, so the list cannot promise more than the plan gives.
export interface CatalogPlan {
  slug: string; name: string; price_kobo: number | null; period_days: number | null; purchase_enabled: boolean;
  product_limit: number | null; pinned_limit: number; renew_hours: number | null;
  call_daily_minutes: number | null; call_monthly_minutes: number | null; call_max_concurrent: number | null; call_queue_waiting: number | null;
  homepage_promotion: boolean | null; max_advertised_products: number | null; external_ads: boolean | null;
  sponsored_placement: boolean | null; featured_banner: boolean | null; campaign_days: number | null;
  social_banner: boolean | null; social_profiles: number | null; banner_generations: number | null;
}

export const hoursText = (h: number) => (h % 24 === 0 ? `${h / 24} day${h === 24 ? '' : 's'}` : `${h} hours`);

export interface FeatureGroup { title: string; items: string[] }

export function planFeatureGroups(p: CatalogPlan): FeatureGroup[] {
  const n = (v: number) => v.toLocaleString('en-NG');
  const paid = p.slug !== 'free';
  const listing: string[] = [
    p.product_limit == null ? 'Unlimited products' : `Up to ${n(p.product_limit)} products`,
    p.pinned_limit > 0 ? `Pin up to ${p.pinned_limit} products at the top (shown as Promoted)` : 'No pinned products',
    p.renew_hours ? `Your listings move back to the top every ${hoursText(p.renew_hours)}` : 'No automatic listing renewal',
  ];
  const brand: string[] = [paid ? `${p.name} badge on your shop, product pages and supplier list` : 'No plan badge'];
  if (paid) brand.push('TikTok shop connection');

  const ads: string[] = [];
  if (p.homepage_promotion && p.max_advertised_products) ads.push(`Promote up to ${n(p.max_advertised_products)} products`);
  if (p.social_banner && p.social_profiles) ads.push(`Social banner with up to ${p.social_profiles} social accounts`);
  if (p.banner_generations) ads.push(`${p.banner_generations} AI banner designs`);
  if (p.featured_banner) ads.push('Featured banner placement');
  if (p.sponsored_placement) ads.push('Sponsored row placement');
  if (p.external_ads) ads.push('Ads on other platforms (Google, Meta, TikTok) from your ad balance');
  if (p.campaign_days && ads.length) ads.push(`Each campaign runs ${p.campaign_days} days`);
  if (!ads.length) ads.push('No advertising features');

  const calls: string[] = [];
  if (p.call_daily_minutes != null) calls.push(`${n(p.call_daily_minutes)} call minutes a day, ${n(p.call_monthly_minutes ?? 0)} a month`);
  if (p.call_queue_waiting != null) calls.push(`Up to ${p.call_queue_waiting} buyers can wait in your call queue`);

  return [
    { title: 'Listing', items: listing },
    { title: 'Badge and channels', items: brand },
    { title: 'Advertising', items: ads },
    ...(calls.length ? [{ title: 'Buyer calls', items: calls }] : []),
  ];
}

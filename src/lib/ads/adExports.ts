// Platform-ready versions of an approved banner, for manual publishing on external ad platforms.
// Every version is a crop of the SAME stored, approved, text-free artwork (never regenerated), so what the admin
// downloads is what was approved. Text is added with Cloudinary's text layer from real database fields.
// Sizes are common published sizes; platforms change their specs, so check the platform's current guidance before upload.
import { parseCloudinaryUrl } from '../cloudinaryUrl';

export interface ExportFormat { key: string; label: string; platform: string; width: number; height: number }
export const EXPORT_FORMATS: readonly ExportFormat[] = [
  { key: 'google_landscape', label: 'Display landscape 1.91:1', platform: 'google_ads', width: 1200, height: 628 },
  { key: 'google_square', label: 'Display square 1:1', platform: 'google_ads', width: 1200, height: 1200 },
  { key: 'google_medium_rect', label: 'Medium rectangle', platform: 'google_ads', width: 300, height: 250 },
  { key: 'facebook_feed', label: 'Feed landscape 1.91:1', platform: 'facebook_ads', width: 1200, height: 628 },
  { key: 'facebook_square', label: 'Feed square 1:1', platform: 'facebook_ads', width: 1080, height: 1080 },
  { key: 'instagram_square', label: 'Feed square 1:1', platform: 'instagram_ads', width: 1080, height: 1080 },
  { key: 'instagram_portrait', label: 'Feed portrait 4:5', platform: 'instagram_ads', width: 1080, height: 1350 },
  { key: 'instagram_story', label: 'Story / Reel 9:16', platform: 'instagram_ads', width: 1080, height: 1920 },
  { key: 'tiktok_vertical', label: 'Vertical 9:16', platform: 'tiktok_ads', width: 1080, height: 1920 },
] as const;

const TRANSFORM = /^[a-z]{1,4}_[^/,]+(,[a-z]{1,4}_[^/,]+)*$/i;

/** Cloudinary text layers need this escaping; commas, slashes and a few symbols would otherwise break the URL. */
export function cloudinaryText(text: string): string {
  return encodeURIComponent(text.replace(/[,/\\%#?]|\.{2,}/g, ' ').replace(/\s+/g, ' ').trim()).replace(/%20/g, '%20');
}

export interface ExportInput { imageUrl: string; storeName: string; headline: string; cta?: string; download?: boolean; withText?: boolean }

/** URL of one export. Returns null if the artwork is not a Cloudinary link (nothing to crop). */
export function exportUrl(input: ExportInput, fmt: ExportFormat): string | null {
  if (!parseCloudinaryUrl(input.imageUrl)) return null;
  const u = new URL(input.imageUrl);
  const at = u.pathname.indexOf('/upload/');
  const head = u.pathname.slice(0, at + 8);
  const segs = u.pathname.slice(at + 8).split('/');
  while (segs.length > 1 && TRANSFORM.test(segs[0])) segs.shift();
  const base = `w_${fmt.width},h_${fmt.height},c_fill,g_auto,f_jpg,q_90`;
  const layers: string[] = [];
  if (input.withText !== false) {
    const big = Math.round(Math.min(fmt.width, fmt.height * 1.6) / 14);
    const small = Math.round(big * 0.55);
    const pad = Math.round(fmt.width * 0.05);
    const shade = `l_text:Arial_${small}_bold:${cloudinaryText(input.storeName.slice(0, 40))},co_white,g_south_west,x_${pad},y_${Math.round(fmt.height * 0.30)}`;
    const head1 = `l_text:Arial_${big}_bold:${cloudinaryText(input.headline.slice(0, 60))},co_white,g_south_west,x_${pad},y_${Math.round(fmt.height * 0.14)},w_${fmt.width - pad * 2},c_fit`;
    layers.push(shade, head1);
    if (input.cta) layers.push(`l_text:Arial_${small}_bold:${cloudinaryText(input.cta.slice(0, 24))},co_white,b_rgb:111111,g_south_west,x_${pad},y_${Math.round(fmt.height * 0.04)}`);
  }
  const flag = input.download ? ',fl_attachment' : '';
  const chain = [base + flag, ...layers.map((l) => `${l}/fl_layer_apply`)].join('/');
  return `${u.origin}${head}${chain}/${segs.join('/')}`;
}

/** UTM-tagged destination for an external ad. Only ever the vendor's own shop (or a product on this site). */
export function externalDestination(site: string, vendorId: string, platform: string, campaignId: string): string {
  const u = new URL(`/shop/${encodeURIComponent(vendorId)}`, site);
  u.searchParams.set('utm_source', platform.replace(/_ads$/, ''));
  u.searchParams.set('utm_medium', 'paid');
  u.searchParams.set('utm_campaign', campaignId);
  return u.toString();
}

/** A plain-text brief an admin can paste into the platform's ads manager. */
export function campaignBrief(c: { store_name: string; platform: string; scope: string; objective: string; duration_days: number; budget_amount: number | null;
  headline: string; description: string | null; cta: string | null; destination: string; products?: string[] }): string {
  return [
    `Platform: ${c.platform}`, `Shop: ${c.store_name}`, `Promotes: ${c.scope === 'shop' ? 'whole shop' : (c.products ?? []).join(', ') || 'selected products'}`,
    `Goal: ${c.objective}`, `Run for: ${c.duration_days} days`, `Budget the vendor authorised: ${c.budget_amount ?? 'not specified'} (paid to the platform, not to ITHUBAFRICA)`,
    `Headline: ${c.headline}`, c.description ? `Description: ${c.description}` : '', `Button: ${c.cta ?? 'Visit shop'}`, `Link: ${c.destination}`,
    '', 'Status note: this is a manual-publishing brief. Mark the request as running only after the platform confirms the ad is live.',
  ].filter(Boolean).join('\n');
}

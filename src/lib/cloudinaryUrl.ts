// Pure helpers for Cloudinary image URLs. No SDK and no secrets, so both the website and the /api functions can use them.
// Product photos can come from three places during the move: Cloudinary, the old Supabase bucket and other websites.
// Everything here leaves non-Cloudinary links exactly as they are.

/** Every vendor's Cloudinary files live under their own folder; the server checks this prefix before deleting. */
export const CLOUDINARY_ROOT = 'marketplace/vendors';
export const vendorFolder = (vendorId: string) => `${CLOUDINARY_ROOT}/${vendorId}/products`;

export interface ParsedCloudinaryUrl { cloudName: string; publicId: string; resourceType: string }

const HOST = /^res\.cloudinary\.com$/i;
// A transformation segment looks like "f_auto,q_auto,w_400" (every part is "letters_value").
const TRANSFORM_SEGMENT = /^[a-z]{1,4}_[^/,]+(,[a-z]{1,4}_[^/,]+)*$/i;
const VERSION_SEGMENT = /^v\d+$/;

/** Reads a Cloudinary delivery URL. Returns null for any other link. */
export function parseCloudinaryUrl(url: string | null | undefined): ParsedCloudinaryUrl | null {
  if (!url) return null;
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  if (u.protocol !== 'https:' || !HOST.test(u.hostname)) return null;
  const parts = u.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  // cloudName / resourceType / deliveryType("upload") / [transformations] / [v123] / publicId...
  if (parts.length < 4 || parts[2] !== 'upload') return null;
  const [cloudName, resourceType] = parts;
  let rest = parts.slice(3);
  while (rest.length > 1 && TRANSFORM_SEGMENT.test(rest[0])) rest = rest.slice(1);
  if (rest.length > 1 && VERSION_SEGMENT.test(rest[0])) rest = rest.slice(1);
  if (!rest.length) return null;
  const last = rest[rest.length - 1];
  rest[rest.length - 1] = last.replace(/\.[a-z0-9]{2,5}$/i, '');
  const publicId = rest.join('/');
  return publicId ? { cloudName, publicId, resourceType } : null;
}

export const isCloudinaryUrl = (url: string | null | undefined) => parseCloudinaryUrl(url) !== null;

export interface CloudinarySize { w?: number; h?: number; crop?: 'limit' | 'fill' | 'fit' | 'pad' }

/** Adds automatic format and quality, and an optional size, to a Cloudinary URL. Any other URL is returned unchanged. */
export function cloudinaryUrl(url: string, size: CloudinarySize = {}): string {
  if (!parseCloudinaryUrl(url)) return url;
  const u = new URL(url);
  const marker = '/upload/';
  const at = u.pathname.indexOf(marker);
  if (at < 0) return url;
  const t = ['f_auto', 'q_auto'];
  if (size.w) t.push(`w_${Math.round(size.w)}`);
  if (size.h) t.push(`h_${Math.round(size.h)}`);
  if (size.w || size.h) t.push(`c_${size.crop ?? 'limit'}`);
  t.push('dpr_auto');
  const head = u.pathname.slice(0, at + marker.length);
  let tail = u.pathname.slice(at + marker.length);
  // Drop transformations that were already in the stored URL so they are not applied twice.
  const segs = tail.split('/');
  while (segs.length > 1 && TRANSFORM_SEGMENT.test(segs[0])) segs.shift();
  tail = segs.join('/');
  return `${u.origin}${head}${t.join(',')}/${tail}`;
}

/** Sizes used across the marketplace. Widths are for a 2x screen at most; dpr_auto handles the rest. */
export const IMAGE_SIZES = {
  thumb: { w: 160, h: 160, crop: 'limit' } as CloudinarySize,   // small lists: cart, orders, pickers
  card: { w: 400, h: 400, crop: 'limit' } as CloudinarySize,    // product cards, search, categories, storefronts, related
  gallery: { w: 1000, h: 1000, crop: 'limit' } as CloudinarySize, // product page main picture
  zoom: { w: 1600, h: 1600, crop: 'limit' } as CloudinarySize,
};

/** A srcset for a Cloudinary photo (undefined for other links, which keep their single URL). */
export function cloudinarySrcSet(url: string, widths: number[]): string | undefined {
  if (!parseCloudinaryUrl(url)) return undefined;
  return widths.map(w => `${cloudinaryUrl(url, { w, crop: 'limit' })} ${w}w`).join(', ');
}

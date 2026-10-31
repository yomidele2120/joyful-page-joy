import { compressImage } from '@/lib/mediaProcessing';
import { IMAGE_SIZES, cloudinaryUrl, isCloudinaryUrl, type CloudinarySize } from '@/lib/cloudinaryUrl';

// Product photos are shown at about 170 to 250 px on a card but were uploaded at 1200 px (a few hundred KB each),
// so a page of 24 cards downloaded several MB. Each new product now also gets a small thumbnail, and cards
// show that instead. The big photo is only loaded on the product page.

export const THUMB_SIZE = 400;
const THUMB_QUALITY = 0.75;

/** A small JPEG copy of the photo, or null when the file is already small (or is a GIF/SVG), so the original is used. */
export async function makeThumbnail(file: File): Promise<Blob | null> {
  const blob = await compressImage(file, THUMB_SIZE, THUMB_QUALITY);
  return blob === file ? null : blob;
}

/** The picture to show in a list or card: the thumbnail when there is one, otherwise the original. */
export function listImage(p: { thumb_url?: string | null; image_url?: string | null }): string | null {
  // Cloudinary photos are resized on the fly (and sent as WebP/AVIF), so no stored thumbnail is needed.
  if (isCloudinaryUrl(p.image_url)) return cloudinaryUrl(p.image_url as string, IMAGE_SIZES.card);
  return p.thumb_url || p.image_url || null;
}

/** A photo URL at a given display size. Cloudinary links are resized and optimised; old Supabase and other links are returned unchanged. */
export function imgSrc(url: string | null | undefined, size: keyof typeof IMAGE_SIZES | CloudinarySize = 'card'): string | null {
  if (!url) return null;
  return cloudinaryUrl(url, typeof size === 'string' ? IMAGE_SIZES[size] : size);
}

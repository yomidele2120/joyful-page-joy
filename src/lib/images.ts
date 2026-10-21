import { compressImage } from '@/lib/mediaProcessing';

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
  return p.thumb_url || p.image_url || null;
}

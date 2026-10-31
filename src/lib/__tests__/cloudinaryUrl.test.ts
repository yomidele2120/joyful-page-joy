import { describe, expect, it } from 'vitest';
import { IMAGE_SIZES, cloudinaryUrl, cloudinarySrcSet, isCloudinaryUrl, parseCloudinaryUrl, vendorFolder } from '@/lib/cloudinaryUrl';
import { imgSrc, listImage } from '@/lib/images';

const V = '11111111-1111-1111-1111-111111111111';
const ID = `${vendorFolder(V)}/lx9a1b2c3d4e5f6`;
const URL1 = `https://res.cloudinary.com/demo/image/upload/v1730000000/${ID}.jpg`;

describe('parseCloudinaryUrl', () => {
  it('reads cloud name and public id (without version and extension)', () => {
    expect(parseCloudinaryUrl(URL1)).toEqual({ cloudName: 'demo', publicId: ID, resourceType: 'image' });
  });
  it('ignores transformations already in the link', () => {
    expect(parseCloudinaryUrl(`https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,w_400/v1/${ID}.webp`)?.publicId).toBe(ID);
  });
  it('rejects other links', () => {
    for (const u of ['https://x.supabase.co/storage/v1/object/public/vendor-assets/a.jpg', 'http://res.cloudinary.com/demo/image/upload/v1/a.jpg', 'https://evilres.cloudinary.com.example.com/demo/image/upload/v1/a.jpg', 'not a url', '']) {
      expect(parseCloudinaryUrl(u)).toBeNull();
    }
    expect(isCloudinaryUrl(null)).toBe(false);
  });
});

describe('cloudinaryUrl', () => {
  it('adds automatic format, quality and size', () => {
    expect(cloudinaryUrl(URL1, { w: 400, h: 400, crop: 'limit' })).toBe(`https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,w_400,h_400,c_limit,dpr_auto/v1730000000/${ID}.jpg`);
  });
  it('does not stack transformations when called twice', () => {
    const once = cloudinaryUrl(URL1, IMAGE_SIZES.card);
    expect(cloudinaryUrl(once, IMAGE_SIZES.card)).toBe(once);
  });
  it('leaves Supabase and external links untouched', () => {
    const old = 'https://abc.supabase.co/storage/v1/object/public/vendor-assets/v/products/1.jpg';
    expect(cloudinaryUrl(old, IMAGE_SIZES.card)).toBe(old);
    expect(imgSrc(old, 'thumb')).toBe(old);
    expect(imgSrc(null)).toBeNull();
  });
  it('builds a srcset only for Cloudinary photos', () => {
    expect(cloudinarySrcSet(URL1, [480, 800])).toContain('w_480');
    expect(cloudinarySrcSet('https://x.com/a.jpg', [480])).toBeUndefined();
  });
});

describe('listImage with Cloudinary', () => {
  it('uses a card-sized Cloudinary copy instead of the stored thumbnail', () => {
    expect(listImage({ thumb_url: 'https://x/t.jpg', image_url: URL1 })).toContain('w_400');
  });
});

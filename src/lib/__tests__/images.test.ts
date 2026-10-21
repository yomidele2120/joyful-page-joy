import { describe, expect, it } from 'vitest';
import { listImage } from '@/lib/images';

describe('listImage', () => {
  it('prefers the thumbnail', () => {
    expect(listImage({ thumb_url: 'https://x/t.jpg', image_url: 'https://x/full.jpg' })).toBe('https://x/t.jpg');
  });
  it('falls back to the full photo, then to nothing', () => {
    expect(listImage({ thumb_url: null, image_url: 'https://x/full.jpg' })).toBe('https://x/full.jpg');
    expect(listImage({})).toBeNull();
  });
});

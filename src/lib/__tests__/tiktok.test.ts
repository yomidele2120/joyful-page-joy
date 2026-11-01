import { describe, expect, it } from 'vitest';
import { isTikTokPost, tiktokVideoId } from '@/lib/tiktok';

describe('tiktokVideoId', () => {
  it('accepts only the exact embed address', () => {
    expect(tiktokVideoId('https://www.tiktok.com/embed/v2/7234567890123456789')).toBe('7234567890123456789');
    for (const bad of ['http://www.tiktok.com/embed/v2/7234567890123456789', 'https://evil.com/embed/v2/7234567890123456789',
      'https://www.tiktok.com/embed/v2/123', 'https://www.tiktok.com/embed/v2/7234567890123456789/../x', 'javascript:alert(1)', '', null, undefined]) {
      expect(tiktokVideoId(bad as string | null | undefined)).toBeNull();
    }
  });
  it('treats a post as TikTok only with the right type and a valid address', () => {
    expect(isTikTokPost({ media_type: 'tiktok', tiktok_embed_url: 'https://www.tiktok.com/embed/v2/7234567890123456789' })).toBe(true);
    expect(isTikTokPost({ media_type: 'tiktok', tiktok_embed_url: null })).toBe(false);
    expect(isTikTokPost({ media_type: 'video', tiktok_embed_url: 'https://www.tiktok.com/embed/v2/7234567890123456789' })).toBe(false);
  });
});

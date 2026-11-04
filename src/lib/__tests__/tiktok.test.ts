import { describe, expect, it } from 'vitest';
import { isTikTokPost, tiktokPlayerErrorMessage, tiktokPlayerUrl, tiktokVideoId } from '@/lib/tiktok';

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

  it('builds the official autoplaying player URL only for a valid TikTok embed', () => {
    expect(tiktokPlayerUrl('https://www.tiktok.com/embed/v2/7234567890123456789'))
      .toBe('https://www.tiktok.com/player/v1/7234567890123456789?autoplay=1&loop=1');
    expect(tiktokPlayerUrl('https://example.com/video')).toBeNull();
  });

  it('explains TikTok server and autoplay player errors', () => {
    expect(tiktokPlayerErrorMessage({ errorCode: 2001, errorType: 'SERVER_ERROR' })).toContain('temporarily limited');
    expect(tiktokPlayerErrorMessage({ errorCode: 3002, errorType: 'AUTOPLAY_ERROR' })).toContain('Tap Play');
  });
});

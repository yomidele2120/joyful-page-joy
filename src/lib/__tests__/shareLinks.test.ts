import { afterEach, describe, expect, it, vi } from 'vitest';
import { postPath, postShareUrl, sharePost } from '../shareLinks';
import { buildShareHtml, escapeHtml, previewImage, truncate } from '../shareOg';

const ID = '2d4b970b-70f4-40d0-b56c-83576969752c';

describe('share link', () => {
  it('opens the feed on that exact post', () => {
    expect(postPath(ID)).toBe(`/feed?post=${ID}`);
    expect(postShareUrl(ID, 'https://site.test')).toBe(`https://site.test/feed?post=${ID}`);
  });
});

describe('share action', () => {
  afterEach(() => { vi.restoreAllMocks(); Object.defineProperty(navigator, 'share', { value: undefined, configurable: true }); });

  it('uses the phone share sheet when there is one', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    expect(await sharePost({ id: ID, vendorName: 'Fumex', caption: 'New stock' })).toBe('shared');
    expect(share.mock.calls[0][0].url).toContain(`/feed?post=${ID}`);
  });
  it('does not copy the link when the person closes the share sheet', async () => {
    const copy = vi.fn();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: copy }, configurable: true });
    Object.defineProperty(navigator, 'share', { value: vi.fn().mockRejectedValue(new DOMException('x', 'AbortError')), configurable: true });
    expect(await sharePost({ id: ID })).toBe('cancelled');
    expect(copy).not.toHaveBeenCalled();
  });
  it('copies the link when sharing is not supported', async () => {
    const copy = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: copy }, configurable: true });
    expect(await sharePost({ id: ID })).toBe('copied');
    expect(copy).toHaveBeenCalledWith(expect.stringContaining(`/feed?post=${ID}`));
  });
  it('copies when the share sheet fails for another reason', async () => {
    const copy = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: copy }, configurable: true });
    Object.defineProperty(navigator, 'share', { value: vi.fn().mockRejectedValue(new Error('boom')), configurable: true });
    expect(await sharePost({ id: ID })).toBe('copied');
  });
});

describe('link preview page', () => {
  const post = { id: ID, caption: 'Brand new <b>HP</b> laptops "in stock"', thumbnail_url: 'https://cdn.test/t.jpg', media_type: 'video', vendors: { store_name: 'Fumex import hub' }, products: { name: 'HP 15' } };

  it('has the title, description, image and the exact link', () => {
    const html = buildShareHtml(post, 'https://site.test/');
    expect(html).toContain('<meta property="og:title" content="Fumex import hub: Watch this video on IT Hub Africa">');
    expect(html).toContain(`<meta property="og:url" content="https://site.test/feed?post=${ID}">`);
    expect(html).toContain('<meta property="og:image" content="https://cdn.test/t.jpg">');
    expect(html).toContain('summary_large_image');
  });
  it('cannot be hijacked by what a supplier typed in a caption', () => {
    const html = buildShareHtml(post, 'https://site.test');
    expect(html).not.toContain('<b>HP</b>');
    expect(html).toContain('&lt;b&gt;HP&lt;/b&gt;');
    expect(html).not.toMatch(/content="[^"]*"[^>]*"in stock"/);
  });
  it('shows a plain site card for a missing or removed video, with no private details', () => {
    const html = buildShareHtml(null, 'https://site.test');
    expect(html).toContain('og:title');
    expect(html).not.toContain('og:image');
    expect(html).toContain('summary"');
  });
  it('uses the first photo of a photo post and ignores non-https images', () => {
    expect(previewImage({ id: ID, image_urls: ['http://x/y.jpg', 'https://x/z.jpg'] })).toBe('https://x/z.jpg');
    expect(previewImage({ id: ID, thumbnail_url: 'javascript:alert(1)' })).toBeNull();
  });
  it('escapes and shortens text', () => {
    expect(escapeHtml(`<a href="x">&'`)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;');
    expect(truncate('a'.repeat(300), 50).length).toBe(50);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The module reads VITE_META_PIXEL_ID when it loads, so each test sets the
// variable first and then imports a fresh copy.
async function load(id?: string) {
  vi.resetModules();
  vi.stubEnv('VITE_META_PIXEL_ID', id ?? '');
  return import('./metaPixel');
}

const calls = () => (window.fbq?.queue ?? []).map(a => Array.from(a as ArrayLike<unknown>));

describe('metaPixel', () => {
  beforeEach(() => {
    delete window.fbq; delete window._fbq;
    document.head.innerHTML = '';
    window.sessionStorage.clear();
  });
  afterEach(() => vi.unstubAllEnvs());

  it('does nothing when no Pixel ID is set', async () => {
    const px = await load('');
    px.initPixel();
    px.trackPageView('/');
    expect(px.isPixelEnabled()).toBe(false);
    expect(window.fbq).toBeUndefined();
    expect(document.querySelector('script[src*="fbevents"]')).toBeNull();
  });

  it('ignores an ID that is not a number', async () => {
    const px = await load('not-a-pixel');
    px.initPixel();
    expect(window.fbq).toBeUndefined();
  });

  it('loads Meta once and registers the ID', async () => {
    const px = await load('123456789012345');
    px.initPixel(); px.initPixel();
    expect(document.querySelectorAll('script[src*="fbevents"]')).toHaveLength(1);
    expect(calls()).toEqual([['init', '123456789012345']]);
  });

  it('reports page views but never private pages', async () => {
    const px = await load('123456789012345');
    px.initPixel();
    px.trackPageView('/products');
    px.trackPageView('/admin');
    px.trackPageView('/admin/anything');
    px.trackPageView('/supplier-dashboard');
    px.trackPageView('/messages');
    expect(calls().filter(c => c[1] === 'PageView')).toHaveLength(1);
  });

  it('reports a purchase once per order, with the order id as dedupe id', async () => {
    const px = await load('123456789012345');
    px.initPixel();
    const lines = [{ id: 'p1', quantity: 20, unitPrice: 1500 }];
    px.trackPurchase('order-1', lines, 32250);
    px.trackPurchase('order-1', lines, 32250);
    px.trackPurchase('order-2', lines, 32250);
    const purchases = calls().filter(c => c[1] === 'Purchase');
    expect(purchases).toHaveLength(2);
    expect(purchases[0][2]).toMatchObject({ value: 32250, currency: 'NGN', content_ids: ['p1'], num_items: 20 });
    expect(purchases[0][3]).toEqual({ eventID: 'order-1' });
  });

  it('sends no personal details', async () => {
    const px = await load('123456789012345');
    px.initPixel();
    px.trackRegistration('buyer');
    px.trackLead('inquiry', 'p1');
    px.trackSearch('  rice  ');
    const sent = JSON.stringify(calls());
    expect(sent).not.toMatch(/@|email|phone/i);
    expect(calls().find(c => c[1] === 'Search')?.[2]).toEqual({ search_string: 'rice' });
  });
});

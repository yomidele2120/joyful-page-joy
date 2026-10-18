import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const PRODUCT = '11111111-1111-1111-1111-111111111111';
const ORDER = '22222222-2222-2222-2222-222222222222';

async function load(env: Record<string, string> = {}) {
  vi.resetModules();
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'anon-key');
  vi.stubEnv('VITE_ANALYTICS_IN_DEV', 'true'); // tests run in "dev" mode
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  return import('./analytics');
}

let fetchMock: ReturnType<typeof vi.fn>;
const sent = () => fetchMock.mock.calls.flatMap(c => JSON.parse((c[1] as RequestInit).body as string) as Record<string, unknown>[]);

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal('fetch', fetchMock);
  window.localStorage.clear();
  window.sessionStorage.clear();
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('classifySource', () => {
  it('works out where a visit came from', async () => {
    const { classifySource: c } = await load();
    expect(c({ utmSource: ' Newsletter ' })).toBe('newsletter');
    expect(c({ hasFbclid: true })).toBe('facebook');
    expect(c({ hasGclid: true })).toBe('google');
    expect(c({ referrerHost: '' })).toBe('direct');
    expect(c({ referrerHost: 'shop.example.com', ownHost: 'shop.example.com' })).toBe('direct');
    expect(c({ referrerHost: 'l.facebook.com', ownHost: 'x.com.ng' })).toBe('facebook');
    expect(c({ referrerHost: 'www.google.com.ng', ownHost: 'x.com.ng' })).toBe('google');
    expect(c({ referrerHost: 'wa.me', ownHost: 'x.com.ng' })).toBe('whatsapp');
    expect(c({ referrerHost: 'blog.somewhere.org', ownHost: 'x.com.ng' })).toBe('blog.somewhere.org');
  });
});

describe('analytics', () => {
  it('sends nothing until started, and nothing when switched off', async () => {
    const a = await load();
    a.trackPageView('/');
    vi.advanceTimersByTime(5000);
    expect(fetchMock).not.toHaveBeenCalled();

    const off = await load({ VITE_ANALYTICS_ENABLED: 'false' });
    off.initAnalytics(); off.trackPageView('/'); vi.advanceTimersByTime(5000);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('stays off in development unless allowed', async () => {
    const a = await load({ VITE_ANALYTICS_IN_DEV: 'false' });
    a.initAnalytics(); a.trackPageView('/'); vi.advanceTimersByTime(5000);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('ignores robots and Do Not Track visitors', async () => {
    vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (compatible; Googlebot/2.1)');
    const bot = await load();
    bot.initAnalytics(); bot.trackPageView('/'); vi.advanceTimersByTime(5000);
    expect(fetchMock).not.toHaveBeenCalled();
    vi.restoreAllMocks();

    Object.defineProperty(window.navigator, 'doNotTrack', { value: '1', configurable: true });
    const dnt = await load();
    dnt.initAnalytics(); dnt.trackPageView('/'); vi.advanceTimersByTime(5000);
    expect(fetchMock).not.toHaveBeenCalled();
    delete (window.navigator as unknown as { doNotTrack?: string }).doNotTrack;
  });

  it('records how many results a search found', async () => {
    const a = await load();
    a.initAnalytics();
    a.trackSearch('iphone 16', 0);
    a.trackSearch('laptop', 12);
    a.trackSearch('tv');
    vi.advanceTimersByTime(3100);
    const searches = sent().filter(r => r.event === 'Search');
    expect(searches).toHaveLength(3);
    expect(searches[0]).toMatchObject({ search_term: 'iphone 16', value: 0 });
    expect(searches[1]).toMatchObject({ search_term: 'laptop', value: 12 });
    expect(searches[2]).not.toHaveProperty('value');
  });

  it('batches events and sends them to the analytics table', async () => {
    const a = await load();
    a.initAnalytics();
    a.trackPageView('/products');
    a.trackViewContent({ id: PRODUCT, name: 'Rice', price: 45000 });
    a.trackSearch('  rice  ');
    expect(fetchMock).not.toHaveBeenCalled(); // waits a moment to send one request
    vi.advanceTimersByTime(3100);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://example.supabase.co/rest/v1/analytics_events');
    expect((init.headers as Record<string, string>).apikey).toBe('anon-key');
    expect(init.keepalive).toBe(true);

    const rows = sent();
    expect(rows.map(r => r.event)).toEqual(['PageView', 'ViewContent', 'Search']);
    expect(rows[0]).toMatchObject({ path: '/products', source: 'direct' });
    expect(rows[1]).toMatchObject({ product_id: PRODUCT, value: 45000 });
    expect(rows[2]).toMatchObject({ search_term: 'rice' });
  });

  it('keeps the same visitor and session ids', async () => {
    const a = await load(); a.initAnalytics(); a.trackPageView('/a'); a.trackPageView('/b'); vi.advanceTimersByTime(3100);
    const rows = sent();
    expect(rows[0].visitor_id).toBe(rows[1].visitor_id);
    expect(rows[0].session_id).toBe(rows[1].session_id);
    expect(String(rows[0].visitor_id).length).toBeGreaterThanOrEqual(8);
    expect(window.localStorage.getItem('ana_vid')).toBe(rows[0].visitor_id);
  });

  it('never reports private pages', async () => {
    const a = await load(); a.initAnalytics();
    ['/admin', '/admin/x', '/supplier-dashboard', '/messages', '/user-dashboard'].forEach(p => a.trackPageView(p));
    vi.advanceTimersByTime(5000);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('records a purchase once per order', async () => {
    const a = await load(); a.initAnalytics();
    a.trackPurchase(ORDER, [], 32250); a.trackPurchase(ORDER, [], 32250);
    vi.advanceTimersByTime(3100);
    const purchases = sent().filter(r => r.event === 'Purchase');
    expect(purchases).toHaveLength(1);
    expect(purchases[0]).toMatchObject({ order_id: ORDER, value: 32250 });
  });

  it('drops ids that are not real ids and sends only allowed columns', async () => {
    const a = await load(); a.initAnalytics();
    a.trackViewContent({ id: 'not-a-uuid', name: 'x', price: 1 });
    a.trackRegistration('buyer'); a.trackLead('inquiry', PRODUCT);
    vi.advanceTimersByTime(3100);
    const allowed = ['visitor_id', 'session_id', 'event', 'path', 'product_id', 'order_id', 'search_term', 'label', 'value', 'source', 'campaign', 'referrer_host', 'device'];
    for (const row of sent()) for (const k of Object.keys(row)) expect(allowed).toContain(k);
    expect(sent()[0].product_id).toBeUndefined();
    expect(sent().find(r => r.event === 'CompleteRegistration')).toMatchObject({ label: 'buyer' });
    expect(sent().find(r => r.event === 'Lead')).toMatchObject({ label: 'inquiry', product_id: PRODUCT });
  });

  it('sends right away once ten events are waiting', async () => {
    const a = await load(); a.initAnalytics();
    for (let i = 0; i < 10; i++) a.trackPageView(`/p${i}`);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sent()).toHaveLength(10);
  });
});

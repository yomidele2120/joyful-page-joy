import { describe, expect, it } from 'vitest';
import { adWeight, isExhausted, pickAds, rotationIndex, seededRandom, sponsoredRowSlots, type RotatableAd } from './adRotation';
import { isSafeSocialUrl, normalizeSocial } from './socialValidation';
import { dayKey, emptySocialState, loadSocialState, markSocialDismissed, markSocialShown, pickSocialAccount, shouldShowSocialBanner, socialHideAt } from './socialBannerSchedule';
import { bannerSources, bannerUrl } from './adMedia';
import { adShopLink, createAdTracker, deviceFromWidth, getVisitorId, readAttribution, recallAttribution, rememberAttribution, safeStore, VISITOR_RE, type KV } from './adTracking';

const ad = (id: string, o: Partial<RotatableAd> = {}): RotatableAd => ({ id, vendor_id: `v-${id}`, priority: 0, impressions_count: 0, clicks_count: 0, priority_weight: 1, impression_allocation: null, ...o });
const mem = (): KV & { m: Map<string, string> } => { const m = new Map<string, string>(); return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); } }; };
const UUID = '11111111-2222-3333-4444-555555555555';

describe('rotation', () => {
  it('is deterministic for the same seed and different for another', () => {
    const pool = ['a', 'b', 'c', 'd', 'e', 'f'].map((i) => ad(i));
    expect(pickAds(pool, { limit: 3, seed: 's1' }).map((a) => a.id)).toEqual(pickAds(pool, { limit: 3, seed: 's1' }).map((a) => a.id));
    const seeds = new Set(Array.from({ length: 30 }, (_, i) => pickAds(pool, { limit: 3, seed: `x${i}` }).map((a) => a.id).join()));
    expect(seeds.size).toBeGreaterThan(3);
  });
  it('never returns more than the limit, duplicates, or an exhausted ad', () => {
    const pool = [ad('a'), ad('b', { impression_allocation: 5, impressions_count: 5 }), ad('c'), ad('a')];
    const out = pickAds(pool, { limit: 10, seed: 1 });
    expect(out.map((a) => a.id).sort()).toEqual(['a', 'c']);
    expect(isExhausted(pool[1])).toBe(true);
    expect(pickAds(pool, { limit: 0, seed: 1 })).toEqual([]);
  });
  it('shows at most one ad per vendor while other vendors exist, and fills from the rest when the pool is small', () => {
    const pool = [ad('a', { vendor_id: 'V' }), ad('b', { vendor_id: 'V' }), ad('c')];
    const two = pickAds(pool, { limit: 2, seed: 7 });
    expect(new Set(two.map((a) => a.vendor_id)).size).toBe(2);
    expect(pickAds([ad('a', { vendor_id: 'V' }), ad('b', { vendor_id: 'V' })], { limit: 2, seed: 7 })).toHaveLength(2);
  });
  it('higher plans and priority get more exposure, but low ones still appear (statistical)', () => {
    const pool = [ad('premium', { priority_weight: 3, priority: 40 }), ad('free', { priority_weight: 1, priority: 0 })];
    const first: Record<string, number> = { premium: 0, free: 0 };
    for (let i = 0; i < 2000; i++) first[pickAds(pool, { limit: 1, seed: `s${i}` })[0].id]++;
    expect(first.premium).toBeGreaterThan(first.free * 2);
    expect(first.free).toBeGreaterThan(20);
  });
  it('under-served ads are boosted and heavily-shown ones damped (fairness)', () => {
    const fresh = ad('fresh', { impressions_count: 0 }), heavy = ad('heavy', { impressions_count: 5000 });
    const pool = [fresh, heavy];
    expect(adWeight(fresh, pool)).toBeGreaterThan(adWeight(heavy, pool));
  });
  it('better click-through nudges weight up, within bounds', () => {
    const good = ad('g', { impressions_count: 1000, clicks_count: 100 }), bad = ad('b', { impressions_count: 1000, clicks_count: 0 });
    const pool = [good, bad];
    const ratio = adWeight(good, pool) / adWeight(bad, pool);
    expect(ratio).toBeGreaterThan(1);
    expect(ratio).toBeLessThanOrEqual(1.6 / 0.6 + 1e-9);
  });
  it('recently shown ads are avoided when alternatives exist', () => {
    const pool = ['a', 'b', 'c', 'd'].map((i) => ad(i));
    let repeats = 0;
    for (let i = 0; i < 500; i++) if (pickAds(pool, { limit: 1, seed: i, recentIds: ['a'] })[0].id === 'a') repeats++;
    expect(repeats).toBeLessThan(500 / 4 / 2);
  });
  it('time rotation steps through slots and wraps', () => {
    const min = 60_000;
    expect(rotationIndex(0, 10, 3)).toBe(0);
    expect(rotationIndex(10 * min, 10, 3)).toBe(1);
    expect(rotationIndex(30 * min, 10, 3)).toBe(0);
    expect(rotationIndex(5, 0, 0)).toBe(0);
  });
  it('places sponsored rows every N product rows, never after the last, capped', () => {
    expect(sponsoredRowSlots(10, 3, 5)).toEqual([3, 6, 9]);
    expect(sponsoredRowSlots(9, 3, 5)).toEqual([3, 6]);
    expect(sponsoredRowSlots(10, 3, 2)).toEqual([3, 6]);
    expect(sponsoredRowSlots(10, 0, 5)).toEqual([]);
    expect(sponsoredRowSlots(0, 3, 5)).toEqual([]);
  });
  it('PRNG output is within [0,1)', () => { const r = seededRandom('x'); for (let i = 0; i < 1000; i++) { const v = r(); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); } });
});

describe('social link validation (mirror of the SQL function)', () => {
  it('accepts and canonicalises real profile links', () => {
    expect(normalizeSocial('instagram', 'https://instagram.com/shop.name')).toEqual({ ok: true, url: 'https://www.instagram.com/shop.name/', handle: 'shop.name' });
    expect(normalizeSocial('facebook', 'https://m.facebook.com/MyShopPage', '@myshoppage')).toEqual({ ok: true, url: 'https://www.facebook.com/MyShopPage', handle: 'MyShopPage' });
    expect(normalizeSocial('tiktok', 'https://www.tiktok.com/@shop_ng?lang=en')).toEqual({ ok: true, url: 'https://www.tiktok.com/@shop_ng', handle: 'shop_ng' });
  });
  it('rejects lookalikes, credentials, ports, non-https, deep paths, home pages and wrong platforms', () => {
    for (const [p, u] of [
      ['instagram', 'http://instagram.com/shop'], ['instagram', 'https://instagram.com.evil.com/shop'], ['instagram', 'https://evil.com/instagram.com/shop'],
      ['instagram', 'https://user:pw@instagram.com/shop'], ['instagram', 'https://instagram.com:8080/shop'], ['instagram', 'https://instagram.com/'],
      ['instagram', 'https://instagram.com/p'], ['instagram', 'https://instagram.com/shop/extra'], ['facebook', 'https://facebook.com/sharer'],
      ['facebook', 'https://facebook.com/abc'], ['tiktok', 'https://tiktok.com/shop'], ['tiktok', 'https://instagram.com/shop'], ['myspace', 'https://instagram.com/shop'],
      ['instagram', 'javascript:alert(1)'], ['instagram', ''],
    ] as const) expect(normalizeSocial(p, u).ok, `${p} ${u}`).toBe(false);
  });
  it('rejects a handle that does not match the link', () => {
    expect(normalizeSocial('instagram', 'https://instagram.com/shop', 'other').ok).toBe(false);
    expect(isSafeSocialUrl('instagram', 'https://www.instagram.com/shop/')).toBe(true);
  });
});

describe('social banner schedule', () => {
  const S = { display_minutes: 2, rotation_minutes: 30, max_per_day: 3, dismiss_hours: 24 };
  const t0 = new Date(2026, 10, 14, 10, 0, 0).getTime();
  it('shows first, then waits for rotation, then respects the daily cap', () => {
    let st = emptySocialState(t0);
    expect(shouldShowSocialBanner(st, S, t0)).toBe(true);
    st = markSocialShown(st, t0);
    expect(shouldShowSocialBanner(st, S, t0 + 10 * 60_000)).toBe(false);
    expect(shouldShowSocialBanner(st, S, t0 + 31 * 60_000)).toBe(true);
    st = markSocialShown(markSocialShown(st, t0 + 31 * 60_000), t0 + 70 * 60_000);
    expect(shouldShowSocialBanner(st, S, t0 + 200 * 60_000)).toBe(false);
  });
  it('dismissal hides it for the configured hours, and a new day resets the counter', () => {
    let st = markSocialDismissed(markSocialShown(emptySocialState(t0), t0), S, t0);
    expect(shouldShowSocialBanner(st, S, t0 + 23 * 3_600_000)).toBe(false);
    st = loadSocialState({ ...st, dismissedUntil: null, shownToday: 3, lastShownAt: t0 }, t0 + 25 * 3_600_000);
    expect(st.shownToday).toBe(0);
    expect(shouldShowSocialBanner(st, S, t0 + 25 * 3_600_000)).toBe(true);
  });
  it('survives corrupt stored state; rotates accounts; computes hide time', () => {
    expect(loadSocialState('garbage', t0)).toEqual(emptySocialState(t0));
    expect(loadSocialState({ shownToday: 'x', lastShownAt: NaN }, t0).shownToday).toBe(0);
    expect(pickSocialAccount(['a', 'b', 'c'], 4)).toBe('b');
    expect(pickSocialAccount([], 1)).toBeNull();
    expect(socialHideAt(t0, S)).toBe(t0 + 120_000);
    expect(dayKey(t0)).toBe('2026-11-14');
    expect(shouldShowSocialBanner(emptySocialState(t0), { ...S, max_per_day: 0 }, t0)).toBe(false);
  });
});

describe('responsive banner urls', () => {
  const U = 'https://res.cloudinary.com/demo/image/upload/v123/marketplace/vendors/v1/ads/a.jpg';
  it('crops per device with smart gravity', () => {
    expect(bannerUrl(U, 'desktop')).toBe('https://res.cloudinary.com/demo/image/upload/ar_16:5,c_fill,g_auto,w_1600,f_auto,q_auto/v123/marketplace/vendors/v1/ads/a.jpg');
    expect(bannerUrl(U, 'tablet')).toContain('ar_2:1,c_fill,g_auto,w_1024');
    expect(bannerUrl(U, 'mobile')).toContain('ar_4:3,c_fill,g_auto,w_720');
  });
  it('does not stack transformations and leaves other hosts alone', () => {
    const t = bannerUrl(bannerUrl(U, 'desktop'), 'mobile');
    expect((t.match(/ar_/g) ?? []).length).toBe(1);
    expect(bannerUrl('https://example.com/x.jpg', 'mobile')).toBe('https://example.com/x.jpg');
    expect(bannerSources(U).mobile).toContain('4:3');
  });
});

describe('tracking', () => {
  it('visitor id is created once, valid, and stable; bad stored values are replaced', () => {
    const s = mem();
    const id = getVisitorId(s);
    expect(VISITOR_RE.test(id)).toBe(true);
    expect(getVisitorId(s)).toBe(id);
    s.setItem('ith_ad_visitor', 'bad id!');
    expect(VISITOR_RE.test(getVisitorId(s))).toBe(true);
  });
  it('works when storage throws', () => {
    const broken: KV = { getItem: () => { throw new Error('no'); }, setItem: () => { throw new Error('no'); } };
    const s = safeStore(broken);
    expect(getVisitorId(s)).toBe(getVisitorId(s));
  });
  it('device buckets and links', () => {
    expect([deviceFromWidth(390), deviceFromWidth(800), deviceFromWidth(1400)]).toEqual(['mobile', 'tablet', 'desktop']);
    expect(adShopLink('vend 1', UUID)).toBe(`/shop/vend%201?ad=${UUID}`);
  });
  it('attribution accepts only UUIDs', () => {
    expect(readAttribution(`?ad=${UUID}`)).toBe(UUID);
    expect(readAttribution('?ad=<script>')).toBeNull();
    expect(readAttribution('')).toBeNull();
    const s = mem();
    rememberAttribution(s, 'nope'); expect(recallAttribution(s)).toBeNull();
    rememberAttribution(s, UUID); expect(recallAttribution(s)).toBe(UUID);
  });
  it('sends an impression once per campaign+placement, clicks every time, ignores bad ids, never throws', async () => {
    const sent: any[] = [];
    const track = createAdTracker({ store: mem(), width: () => 1300, send: (e) => { sent.push(e); } });
    expect(track({ event: 'impression', campaign: UUID, placement: 'featured' })).toBe(true);
    expect(track({ event: 'impression', campaign: UUID, placement: 'featured' })).toBe(false);
    expect(track({ event: 'impression', campaign: UUID, placement: 'rotating' })).toBe(true);
    expect(track({ event: 'banner_click', campaign: UUID, placement: 'featured' })).toBe(true);
    expect(track({ event: 'banner_click', campaign: UUID, placement: 'featured' })).toBe(true);
    expect(track({ event: 'impression', campaign: 'not-a-uuid', placement: 'featured' })).toBe(false);
    expect(sent).toHaveLength(4);
    expect(sent[0].device).toBe('desktop');
    const throwing = createAdTracker({ store: mem(), width: () => 300, send: () => { throw new Error('x'); } });
    expect(() => throwing({ event: 'banner_click', campaign: UUID, placement: 'featured' })).not.toThrow();
    const rejecting = createAdTracker({ store: mem(), width: () => 300, send: () => Promise.reject(new Error('x')) });
    expect(() => rejecting({ event: 'banner_click', campaign: UUID, placement: 'featured' })).not.toThrow();
  });
});

import { campaignStatus, checkMessage, daysLeft, externalStatus, pct } from './adStatus';
describe('status text and wording check', () => {
  it('maps known statuses and never calls a not-yet-connected external request live', () => {
    expect(campaignStatus('active').label).toBe('Live');
    expect(campaignStatus('pending_review').tone).toBe('warn');
    expect(campaignStatus('weird').label).toBe('weird');
    expect(externalStatus('pending_integration').hint).toContain('Nothing is running');
    expect(externalStatus('draft').label).not.toBe('Running');
  });
  it('wording check mirrors the database rules', () => {
    expect(checkMessage('Phones and accessories', 'Browse our range of phones and cases.')).toBeNull();
    expect(checkMessage('', '')).toBeNull();
    for (const bad of ['Save 50% today', 'Free delivery', 'Only ₦5000', 'Genuine phones', 'Best price in town', 'Visit www.x.com', 'Call @shop', 'Limited time offer', 'Top #1 seller', 'Great <b>deals</b>'])
      expect(checkMessage(bad, ''), bad).not.toBeNull();
    expect(checkMessage('Hi', '')).not.toBeNull();
    expect(checkMessage('Fine headline', 'short')).not.toBeNull();
    expect(checkMessage('Fine headline', 'x'.repeat(161))).not.toBeNull();
  });
  it('formats time left and percentages', () => {
    const now = Date.UTC(2026, 10, 14);
    expect(daysLeft(new Date(now + 3 * 86_400_000 - 1000).toISOString(), now)).toBe('3 days left');
    expect(daysLeft(new Date(now + 1000).toISOString(), now)).toBe('1 day left');
    expect(daysLeft(new Date(now - 1).toISOString(), now)).toBe('Ended');
    expect(pct('2.5')).toBe('2.50%');
    expect(pct(null)).toBe('0.00%');
  });
});

import { nextStep, positionText, queueReasonText, secondsLeft } from '../calls/callQueue';
describe('call queue helpers', () => {
  it('decides the next step from the server answer, falling back to a normal call if the queue is unreachable', () => {
    expect(nextStep(null)).toBe('call');
    expect(nextStep({ action: 'call_now' })).toBe('call');
    expect(nextStep({ action: 'queued', position: 2 })).toBe('wait');
    expect(nextStep({ action: 'already_queued' })).toBe('wait');
    expect(nextStep({ action: 'queue_full' })).toBe('message');
    expect(nextStep({ action: 'unavailable', reason: 'calls_off' })).toBe('message');
  });
  it('counts down offers without going negative', () => {
    const now = Date.UTC(2026, 10, 14, 10, 0, 0);
    expect(secondsLeft(new Date(now + 12_300).toISOString(), now)).toBe(13);
    expect(secondsLeft(new Date(now - 5000).toISOString(), now)).toBe(0);
    expect(secondsLeft(null, now)).toBe(0);
    expect(secondsLeft('garbage', now)).toBe(0);
  });
  it('words positions and reasons plainly', () => {
    expect(positionText(1)).toBe("You're next");
    expect(positionText(2)).toBe('1 person is ahead of you');
    expect(positionText(4)).toBe('3 people are ahead of you');
    expect(queueReasonText('queue_off')).toContain('switched off');
    expect(queueReasonText('???')).toContain('cannot join');
  });
});

describe('boosted ads', () => {
  it('a boosted ad is not exhausted by the plan cap and is weighted higher', () => {
    const capped = ad('a', { impression_allocation: 100, impressions_count: 100 });
    const boosted = ad('b', { impression_allocation: 100, impressions_count: 100, boost_remaining: 500 });
    expect(isExhausted(capped)).toBe(true);
    expect(isExhausted(boosted)).toBe(false);
    const peer = ad('c', { impressions_count: 100 }), boostedPeer = ad('d', { impressions_count: 100, boost_remaining: 5 });
    expect(adWeight(boostedPeer, [peer, boostedPeer]) / adWeight(peer, [peer, boostedPeer])).toBeGreaterThan(1.9);
    expect(pickAds([capped, boosted], { limit: 5, seed: 1 }).map((x) => x.id)).toEqual(['b']);
  });
});

import { campaignBrief, cloudinaryText, EXPORT_FORMATS, exportUrl, externalDestination } from './adExports';
describe('external ad exports', () => {
  const U = 'https://res.cloudinary.com/demo/image/upload/v9/marketplace/vendors/v1/ads/a.jpg';
  it('crops the SAME stored artwork to each platform size and never changes the source', () => {
    for (const f of EXPORT_FORMATS) {
      const url = exportUrl({ imageUrl: U, storeName: 'Tech World', headline: 'Discover phones', cta: 'Visit shop' }, f)!;
      expect(url).toContain(`w_${f.width},h_${f.height},c_fill,g_auto`);
      expect(url.endsWith('/v9/marketplace/vendors/v1/ads/a.jpg')).toBe(true);
      expect(url.startsWith('https://res.cloudinary.com/demo/image/upload/')).toBe(true);
    }
  });
  it('adds database text as layers, can download as attachment, and can skip text', () => {
    const f = EXPORT_FORMATS[0];
    const withText = exportUrl({ imageUrl: U, storeName: 'Tech World', headline: 'Discover phones', download: true }, f)!;
    expect(withText).toContain('fl_attachment');
    expect(withText).toContain('Discover%20phones');
    expect(withText).toContain('Tech%20World');
    expect(exportUrl({ imageUrl: U, storeName: 'x', headline: 'y', withText: false }, f)!).not.toContain('l_text');
  });
  it('is safe with hostile text and non-Cloudinary artwork', () => {
    expect(cloudinaryText('A,B/C%D#E?F')).toBe('A%20B%20C%20D%20E%20F');
    const url = exportUrl({ imageUrl: U, storeName: 'a/../../b,c', headline: 'x%2Fy' }, EXPORT_FORMATS[0])!;
    expect(url).not.toContain('..');
    expect(exportUrl({ imageUrl: 'https://example.com/a.jpg', storeName: 'a', headline: 'b' }, EXPORT_FORMATS[0])).toBeNull();
  });
  it('builds a tagged destination that stays on the shop and a truthful brief', () => {
    const d = externalDestination('https://ithubafrica.com', 'abc-123', 'google_ads', 'camp1');
    expect(d).toBe('https://ithubafrica.com/shop/abc-123?utm_source=google&utm_medium=paid&utm_campaign=camp1');
    const b = campaignBrief({ store_name: 'S', platform: 'google_ads', scope: 'shop', objective: 'traffic', duration_days: 14, budget_amount: 50000, headline: 'H', description: null, cta: null, destination: d });
    expect(b).toContain('paid to the platform, not to ITHUBAFRICA');
    expect(b).toContain('only after the platform confirms');
  });
});

import { feedSlots } from './adFeed';
describe('feedSlots (sponsored cards inside a product grid)', () => {
  it('places the first card after the 4th product, then every 8, at most 3', () => {
    expect(feedSlots({ itemCount: 40 })).toEqual([3, 11, 19]);
  });
  it('moves a card that would land on a flyer position one product on', () => {
    expect(feedSlots({ itemCount: 40, reserved: [5, 11] })).toEqual([3, 12, 20]);
  });
  it('never ends the page: keeps products after the last card', () => {
    expect(feedSlots({ itemCount: 6 })).toEqual([3]);
    expect(feedSlots({ itemCount: 5 })).toEqual([]);
    expect(feedSlots({ itemCount: 24, reserved: [5, 11] }).every((i) => i <= 24 - 1 - 2)).toBe(true);
  });
  it('returns nothing for empty pages or invalid settings', () => {
    expect(feedSlots({ itemCount: 0 })).toEqual([]);
    expect(feedSlots({ itemCount: 30, max: 0 })).toEqual([]);
    expect(feedSlots({ itemCount: 30, first: 0 })).toEqual([]);
  });
  it('respects a smaller cap', () => {
    expect(feedSlots({ itemCount: 60, max: 1 })).toEqual([3]);
  });
});

import { buildSocialUrl } from './socialValidation';
describe('buildSocialUrl (vendors type only a username)', () => {
  it('builds the link from a plain or @ username', () => {
    expect(buildSocialUrl('instagram', 'techhub_ng')).toEqual({ ok: true, url: 'https://www.instagram.com/techhub_ng/', handle: 'techhub_ng' });
    expect(buildSocialUrl('instagram', '@techhub_ng')).toEqual({ ok: true, url: 'https://www.instagram.com/techhub_ng/', handle: 'techhub_ng' });
    expect(buildSocialUrl('tiktok', '@techhub')).toEqual({ ok: true, url: 'https://www.tiktok.com/@techhub', handle: 'techhub' });
    expect(buildSocialUrl('facebook', 'techhub.ng')).toEqual({ ok: true, url: 'https://www.facebook.com/techhub.ng', handle: 'techhub.ng' });
  });
  it('still accepts a pasted profile link and keeps only the username', () => {
    const r = buildSocialUrl('instagram', 'https://www.instagram.com/techhub_ng/?hl=en');
    expect(r.ok && r.handle).toBe('techhub_ng');
  });
  it('rejects empty, spaces, symbols, reserved names and the wrong length', () => {
    expect(buildSocialUrl('instagram', '').ok).toBe(false);
    expect(buildSocialUrl('instagram', 'tech hub').ok).toBe(false);
    expect(buildSocialUrl('instagram', 'bad<script>').ok).toBe(false);
    expect(buildSocialUrl('instagram', 'explore').ok).toBe(false);
    expect(buildSocialUrl('facebook', 'abc').ok).toBe(false);
    expect(buildSocialUrl('myspace', 'name').ok).toBe(false);
  });
  it('a link to another website or a deeper path is not accepted', () => {
    expect(buildSocialUrl('instagram', 'https://evil.com/techhub').ok).toBe(false);
    expect(buildSocialUrl('instagram', 'https://www.instagram.com/p/abc123/').ok).toBe(false);
  });
});

// Run: npx tsx --test supabase/functions/_shared/seasonalHeroCore.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { MONTHS, SELL_TILE, allCopySafe, buildSeasonalPrompt, croppedUrl, flyerWindow, heroSlots, isSeasonKey, seasonKey, themeFor } from './seasonalHeroCore.ts';
import { pickVariant } from './adBannerCore.ts';

test('twelve months, each with three slides, a tile, five scenes and five palettes', () => {
  assert.equal(MONTHS.length, 12);
  MONTHS.forEach((m, i) => { assert.equal(m.month, i + 1); assert.equal(m.slides.length, 3); assert.equal(m.scenes.length, 5); assert.equal(m.palettes.length, 5); });
});

test('every headline, line and button passes the vendor-ad copy rules (no numbers, prices, links or claim words)', () => {
  const r = allCopySafe();
  assert.deepEqual(r.bad, []);
  assert.ok(r.ok);
});

test('text fits the banners', () => {
  for (const c of [SELL_TILE, ...MONTHS.flatMap((m) => [...m.slides, m.tile])]) {
    assert.ok(c.h.length <= 42, c.h); assert.ok(c.s.length <= 70, c.s); assert.ok(c.c.length <= 24, c.c);
  }
});

test('season key uses Lagos time', () => {
  assert.equal(seasonKey(new Date('2026-11-15T10:00:00Z')), '2026-11');
  assert.equal(seasonKey(new Date('2026-11-30T23:30:00Z')), '2026-12');   // already 00:30 on 1 December in Lagos
  assert.equal(seasonKey(new Date('2026-12-31T22:59:00Z')), '2026-12');
  assert.equal(seasonKey(new Date('2026-12-31T23:00:00Z')), '2027-01');
  assert.ok(isSeasonKey('2026-11') && !isSeasonKey('2026-13') && !isSeasonKey('26-11') && !isSeasonKey(null));
  assert.equal(themeFor('2026-12').name, 'December');
});

test('banners are live from the 1st (Lagos) until the 6th of the next month', () => {
  const w = flyerWindow('2026-11');
  assert.equal(w.starts_at, '2026-10-31T23:00:00.000Z');
  assert.equal(w.ends_at, '2026-12-05T23:00:00.000Z');
  assert.equal(flyerWindow('2026-12').ends_at, '2027-01-05T23:00:00.000Z');   // December rolls into the next year
});

test('five slots: three slides (2:1) and two tiles (4:3), the second tile sells', () => {
  const s = heroSlots('2026-11');
  assert.deepEqual(s.map((x) => x.placement), ['hero_slide', 'hero_slide', 'hero_slide', 'hero_side', 'hero_side']);
  assert.deepEqual(s.map((x) => x.ratio), ['2:1', '2:1', '2:1', '4:3', '4:3']);
  assert.equal(s[4].link, '/sell');
  assert.equal(new Set(s.map((x) => x.scene)).size, 5);
  assert.equal(new Set(s.map((x) => x.slot)).size, 5);
});

test('the picture prompt carries the season, forbids text, people, brands and flags, and has no digits', () => {
  for (let m = 1; m <= 12; m++) for (const slot of heroSlots(`2026-${String(m).padStart(2, '0')}`)) {
    const p = buildSeasonalPrompt(slot, pickVariant('general', `${m}-${slot.slot}`));
    assert.ok(p.includes('NO text'));
    assert.ok(p.includes('Do not show identifiable people'));
    assert.ok(p.includes('flags'));
    assert.ok(p.includes(slot.scene));
    assert.doesNotMatch(p, /[0-9]/, `digits in ${m} ${slot.slot}`);
    assert.ok(!p.includes(slot.copy.h), 'the headline must not be sent to the image model');
  }
});

test('cropped URL: Cloudinary links are cropped to the slot shape, other links are left alone', () => {
  assert.equal(croppedUrl('https://res.cloudinary.com/demo/image/upload/v1/marketplace/seasonal/2026-11/slide-1.jpg', '2:1', 1600),
    'https://res.cloudinary.com/demo/image/upload/ar_2:1,c_fill,g_auto,w_1600,f_auto,q_auto/v1/marketplace/seasonal/2026-11/slide-1.jpg');
  assert.equal(croppedUrl('https://res.cloudinary.com/demo/image/upload/c_fill,w_10/v1/a.jpg', '4:3', 900),
    'https://res.cloudinary.com/demo/image/upload/ar_4:3,c_fill,g_auto,w_900,f_auto,q_auto/v1/a.jpg');
  assert.equal(croppedUrl('https://example.com/a.jpg', '2:1', 1600), 'https://example.com/a.jpg');
  assert.equal(croppedUrl('not a url', '2:1', 1600), 'not a url');
});

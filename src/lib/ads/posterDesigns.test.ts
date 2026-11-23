import test from 'node:test';
import assert from 'node:assert/strict';
import { POSTER_DESIGNS, nextDesignIndex, wrapLines, POSTER_SIZE } from './posterDesigns.ts';

// A stand-in canvas that records what is drawn and measures text as 0.5 x font size per character.
function fakeCtx() {
  const calls: string[] = []; let size = 20;
  const grad = { addColorStop() {} };
  const proxy: any = new Proxy({}, {
    get(_t, k: string) {
      if (k === 'measureText') return (s: string) => ({ width: s.length * size * 0.5 });
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => grad;
      if (k === 'calls') return calls;
      return (...a: any[]) => { calls.push(k); };
    },
    set(_t, k: string, v: any) { if (k === 'font') size = parseInt(String(v).split(' ')[1], 10) || 20; return true; },
  });
  return proxy;
}
test('every layout draws a full poster with headline, shop and button text', () => {
  const img = { width: 800, height: 600 };
  for (const d of POSTER_DESIGNS) {
    const c = fakeCtx();
    d.draw(c, POSTER_SIZE, POSTER_SIZE, { image: img, shop: 'Techhub Operations Limited', headline: 'New laptops just landed in the shop', cta: 'Visit shop', accent: '#ff7a00' }, img);
    assert.ok(c.calls.filter((x: string) => x === 'fillText').length >= 3, d.id);
    assert.ok(c.calls.includes('drawImage'), `${d.id} shows the photo`);
  }
});
test('layouts also draw without a photo', () => { for (const d of POSTER_DESIGNS) d.draw(fakeCtx(), 1080, 1080, { image: null, shop: 'S', headline: 'Hello there', cta: 'Go', accent: '#000000' }, null); });
test('shuffle always changes the layout and reaches all of them', () => {
  const seen = new Set<number>(); let cur = 0;
  for (let i = 0; i < 300; i++) { const n = nextDesignIndex(cur); assert.notEqual(n, cur); seen.add(n); cur = n; }
  assert.equal(seen.size, POSTER_DESIGNS.length);
});
test('text wraps to the width and is cut with an ellipsis past the line limit', () => {
  const m = (s: string) => s.length * 10;
  assert.deepEqual(wrapLines('one two three four', 90, m, 5), ['one two', 'three', 'four']);
  const cut = wrapLines('aaa bbb ccc ddd eee fff', 40, m, 2); assert.equal(cut.length, 2); assert.ok(cut[1].endsWith('…'));
  assert.deepEqual(wrapLines('', 100, m), []);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { POPUP_THEMES, pickPopupTheme } from './shopPopup.ts';

test('popup theme steps to a different one on each visit, same shop', () => {
  const seen = new Set<number>();
  for (let v = 0; v < POPUP_THEMES.length; v++) seen.add(pickPopupTheme('shop-1', v));
  assert.equal(seen.size, POPUP_THEMES.length);
  assert.notEqual(pickPopupTheme('shop-1', 0), pickPopupTheme('shop-1', 1));
});
test('every theme has readable wording that names the platform and shop', () => {
  for (const t of POPUP_THEMES) { assert.ok(t.title('TikTok').includes('TikTok')); assert.ok(t.line('Acme').includes('Acme')); }
});

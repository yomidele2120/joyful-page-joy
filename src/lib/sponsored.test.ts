// Run: node --test src/lib/sponsored.test.ts   (Node 22+)
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLandingUrl, NEXT_STATUSES, remainingBudget, totals } from './sponsored.ts';

const row = (o: Record<string, unknown> = {}) => ({
  spend: 1000, impressions: 10000, clicks: 200, product_views: 50, add_to_carts: 10, checkouts: 4, purchases: 2, revenue: 5000,
  tiktok_data_entered: true, allocated_budget: 3000, ...o,
}) as any;

test('landing link carries the source, campaign, vendor and product tags', () => {
  const u = new URL(buildLandingUrl('https://www.ithubafrica.com/', { slug: 'blue phone', productId: '12345678-aaaa', vendorId: 'v1', campaignId: 'c1', campaignCode: 'spABC' }));
  assert.equal(u.pathname, '/product/blue%20phone');
  assert.equal(u.searchParams.get('utm_source'), 'tiktok');
  assert.equal(u.searchParams.get('utm_campaign'), 'spABC');
  assert.equal(u.searchParams.get('ad_vendor'), 'v1');
  assert.equal(u.searchParams.get('ad_product'), '12345678-aaaa');
});

test('rates are worked out from recorded figures only', () => {
  const t = totals([row(), row({ spend: 500, impressions: 5000, clicks: 100, purchases: 1, revenue: 2500 })]);
  assert.equal(t.spend, 1500); assert.equal(t.ctr, 2); assert.equal(t.cpc, 5); assert.equal(t.costPerPurchase, 500); assert.equal(t.roas, (7500) / 1500);
});

test('missing TikTok data stays "not entered" and never becomes zero', () => {
  const t = totals([row({ tiktok_data_entered: false, spend: null, impressions: null, clicks: null })]);
  assert.equal(t.spend, null); assert.equal(t.ctr, null); assert.equal(t.cpc, null); assert.equal(t.roas, null); assert.equal(t.tiktokEntered, false);
  assert.equal(t.purchases, 2);                       // website figures are still real
  assert.equal(remainingBudget(3000, t.spend), null);
});

test('no purchases means no cost per purchase; zero spend means no return', () => {
  assert.equal(totals([row({ purchases: 0 })]).costPerPurchase, null);
  assert.equal(totals([row({ spend: 0 })]).roas, null);
});

test('a finished campaign cannot be restarted', () => {
  assert.deepEqual(NEXT_STATUSES.completed, []);
  assert.ok(NEXT_STATUSES.pending_approval.includes('approved'));
});

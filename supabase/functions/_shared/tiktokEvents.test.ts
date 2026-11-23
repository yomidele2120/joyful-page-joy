// Run: node --test supabase/functions/_shared/tiktokEvents.test.ts   (Node 22+)
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEventRequest, readResponse, sha256Hex } from './tiktokEvents.ts';

const order = { id: 'o1', total: 5000, email: ' Buyer@Example.com ', items: [{ product_id: 'p1', name: 'Phone', quantity: 2, price: 2500 }] };

test('hashes the email the way TikTok expects', async () => {
  assert.equal(await sha256Hex(' Buyer@Example.com '), await sha256Hex('buyer@example.com'));
  assert.match(await sha256Hex('a@b.c'), /^[0-9a-f]{64}$/);
});

test('request carries ids, value and products but no personal details', async () => {
  const body: any = await buildEventRequest({
    pixelCode: 'PIX', eventName: 'CompletePayment', eventId: 'o1', order,
    attribution: { ttclid: 'click', ttp: null, user_agent: 'UA', page_url: 'https://x.test/p' }, eventTime: 100,
  });
  assert.equal(body.event_source_id, 'PIX');
  const e = body.data[0];
  assert.equal(e.event_id, 'o1'); assert.equal(e.event_time, 100);
  assert.equal(e.properties.value, 5000); assert.equal(e.properties.contents[0].quantity, 2);
  assert.equal(e.user.ttclid, 'click'); assert.ok(!('phone' in e.user)); assert.ok(!JSON.stringify(body).includes('Buyer@'));
  assert.equal(body.test_event_code, undefined);
});

test('reads TikTok responses', () => {
  assert.equal(readResponse(200, { code: 0 }).ok, true);
  assert.equal(readResponse(200, { code: 40001, message: 'bad token' }).ok, false);
  assert.equal(readResponse(500, null).ok, false);
});

// Run: node --test supabase/functions/_shared/metaEvents.test.ts   (Node 22+)
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMetaRequest, metaEventsUrl, readMetaResponse } from './metaEvents.ts';

const order = { id: 'o1', total: 5000, email: 'Buyer@Example.com', items: [{ product_id: 'p1', name: 'Phone', quantity: 2, price: 2500 }] };

test('purchase uses the order id as event id and carries no personal details in the clear', async () => {
  const body: any = await buildMetaRequest({ eventId: 'o1', order, attribution: { ttclid: null, ttp: null, user_agent: 'UA', page_url: 'https://x.test/', fbp: 'fb.1.2', fbc: null }, eventTime: 5, testEventCode: 'TEST1' });
  const e = body.data[0];
  assert.equal(e.event_name, 'Purchase'); assert.equal(e.event_id, 'o1'); assert.equal(e.action_source, 'website');
  assert.equal(e.custom_data.value, 5000); assert.equal(e.custom_data.currency, 'NGN'); assert.equal(e.custom_data.contents[0].item_price, 2500);
  assert.match(e.user_data.em[0], /^[0-9a-f]{64}$/); assert.ok(!JSON.stringify(body).includes('Buyer@'));
  assert.equal(body.test_event_code, 'TEST1'); assert.equal(e.user_data.fbp, 'fb.1.2'); assert.ok(!('fbc' in e.user_data));
});

test('reads Meta responses and builds the endpoint', () => {
  assert.equal(readMetaResponse(200, { events_received: 1 }).ok, true);
  assert.equal(readMetaResponse(400, { error: { message: 'Invalid token' } }).ok, false);
  assert.match(metaEventsUrl('123'), /\/123\/events$/);
});

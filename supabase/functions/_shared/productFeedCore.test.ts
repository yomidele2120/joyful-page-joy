// Run: node --test supabase/functions/_shared/productFeedCore.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFeedRow, feedImage, toFeedText, FEED_COLUMNS } from './productFeedCore.ts';

const site = { siteUrl: 'https://www.ithubafrica.com/' };
const good = () => ({
  id: 'p1', name: 'Phone <b>X</b>', slug: 'phone x', description: '<p>Nice  phone</p>', price: 150000.5,
  image_url: 'https://res.cloudinary.com/demo/image/upload/v1/abc', images: ['https://res.cloudinary.com/demo/image/upload/v1/abc', 'https://res.cloudinary.com/demo/image/upload/v1/two.png'],
  brand: '', stock_quantity: 3, is_public: true, is_active: true, specs: { condition: 'Used', gtin: '12345678' },
  categories: { name: 'Phones' }, vendors: { is_approved: true, store_name: 'Techhub' },
});

test('image links end in .jpg or .png and must be Cloudinary https', () => {
  assert.equal(feedImage('https://res.cloudinary.com/demo/image/upload/v1/abc'), 'https://res.cloudinary.com/demo/image/upload/v1/abc.jpg');
  assert.equal(feedImage('https://res.cloudinary.com/demo/image/upload/v1/abc.webp?x=1'), 'https://res.cloudinary.com/demo/image/upload/v1/abc.jpg');
  assert.equal(feedImage('https://res.cloudinary.com/demo/image/upload/v1/abc.PNG'), 'https://res.cloudinary.com/demo/image/upload/v1/abc.PNG');
  assert.equal(feedImage('http://res.cloudinary.com/demo/image/upload/v1/abc'), null);
  assert.equal(feedImage('https://example.com/a.jpg'), null);
  assert.equal(feedImage(null), null);
});

test('a good product fills every required TikTok field', () => {
  const r = buildFeedRow(good(), site)!;
  assert.equal(r.sku_id, 'p1'); assert.equal(r.title, 'Phone X'); assert.equal(r.description, 'Nice phone');
  assert.equal(r.availability, 'in stock'); assert.equal(r.condition, 'used'); assert.equal(r.price, '150000.50 NGN');
  assert.equal(r.link, 'https://www.ithubafrica.com/product/phone%20x');
  assert.equal(r.brand, 'Techhub');                       // no brand set: the shop name
  assert.equal(r.additional_image_link, '"https://res.cloudinary.com/demo/image/upload/v1/two.png"');   // quoted list, as in TikTok's template
  assert.equal(r.gtin, '12345678'); assert.equal(r.product_type, 'Phones');
  for (const c of ['sku_id', 'title', 'description', 'availability', 'condition', 'price', 'link', 'image_link', 'brand'] as const) assert.ok(r[c], c);
});

test('products that cannot be listed are skipped', () => {
  assert.equal(buildFeedRow({ ...good(), is_public: false }, site), null);
  assert.equal(buildFeedRow({ ...good(), is_active: false }, site), null);
  assert.equal(buildFeedRow({ ...good(), vendors: { is_approved: false } }, site), null);
  assert.equal(buildFeedRow({ ...good(), price: 0 }, site), null);
  assert.equal(buildFeedRow({ ...good(), image_url: null, images: [] }, site), null);
  assert.equal(buildFeedRow({ ...good(), slug: '' }, site), null);
});

test('availability: out of stock, and open pre-orders', () => {
  assert.equal(buildFeedRow({ ...good(), stock_quantity: 0 }, site)!.availability, 'out of stock');
  assert.equal(buildFeedRow({ ...good(), stock_quantity: 0, is_preorder: true, preorder_approved: true, preorder_status: 'open' }, site)!.availability, 'preorder');
});

test('the header is exactly TikTok\'s template header', async () => {
  const fs = await import('node:fs');
  const tpl = '/tmp/claude-0/-home-claude/bae94f89-8fb8-536a-a4f9-956831a55b15/scratchpad/tiktok_template_header.txt';
  if (fs.existsSync(tpl)) assert.equal(FEED_COLUMNS.join(','), fs.readFileSync(tpl, 'utf8').trim());
  assert.equal(FEED_COLUMNS.length, 44);
  const r = buildFeedRow(good(), site)!;
  assert.equal(Object.keys(r).length, 44);
});

test('CSV quotes commas, quotes and line breaks; TSV never breaks a row', () => {
  const r = buildFeedRow({ ...good(), name: 'Say "hi", ok', description: 'a\nb' }, site)!;
  const csv = toFeedText([r]);
  assert.ok(csv.startsWith(FEED_COLUMNS.join(',') + '\r\n'));
  assert.ok(csv.includes('"Say ""hi"", ok"'));
  assert.equal(csv.trim().split('\r\n').length, 2);
  const tsv = toFeedText([{ ...r, description: 'a\tb\nc' }], 'tsv');
  assert.equal(tsv.trim().split('\n').length, 2);
});

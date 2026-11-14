// Executes the REAL worker (index.ts) against a fake database client and mocked OpenAI / Cloudinary.
// Run: node --import ./supabase/functions/ad-process-jobs/testing/loader.mjs --test supabase/functions/ad-process-jobs/worker.test.ts
//
// What this proves: the worker's decisions (what it calls, in what order, what it records, what it refuses to do).
// What it cannot prove: that OpenAI, Cloudinary or Supabase accept the requests. Those need a live smoke test.
import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const SERVICE = 'service-role-key-for-tests';
const OPENAI_KEY = 'sk-proj-FAKEKEYFORTESTS0123456789abcdef';
const JOB = { id: '11111111-aaaa-bbbb-cccc-222222222222', campaign_id: '33333333-aaaa-bbbb-cccc-444444444444', vendor_id: '55555555-aaaa-bbbb-cccc-666666666666', kind: 'initial', attempts: 1, max_attempts: 3 };

const env: Record<string, string | undefined> = {};
let handler: (req: Request) => Promise<Response>;
(globalThis as any).Deno = { env: { get: (k: string) => env[k] }, serve: (h: any) => { handler = h; } };

let calls: { rpc: { name: string; args: any }[]; fetch: { url: string; body: any }[]; updates: any[] };
let fixtures: Record<string, any>;
let claimQueue: any[];
let behave: { image: (model: string, n: number) => Response | Promise<Response>; text: (body: any) => Response | Promise<Response>; moderation: (body: any) => Response | Promise<Response>; cloudinary: () => Response | Promise<Response> };
let imageAttempts = 0;

function png(width: number, height: number, size = 30_000): Buffer {
  const b = Buffer.alloc(size);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  b.writeUInt32BE(13, 8); b.write('IHDR', 12); b.writeUInt32BE(width, 16); b.writeUInt32BE(height, 20);
  return b;
}
const reply = (obj: unknown, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
const imageReply = (buf: Buffer) => reply({ data: [{ b64_json: buf.toString('base64') }] });
const textReply = (text: string) => reply({ output: [{ type: 'message', content: [{ type: 'output_text', text }] }] });
const CLEAN = '{"safe":true,"contains_text":false,"contains_logo":false,"contains_face":false,"reasons":[]}';
const GOOD_COPY = '{"headline":"Discover Premium Phones","description":"Browse phones and accessories from a shop on the marketplace."}';

function builder(table: string) {
  const b: any = {
    select: () => b, eq: () => b, in: () => b, order: () => b, limit: () => b,
    update: (v: any) => { calls.updates.push({ table, v }); return b; },
    maybeSingle: async () => ({ data: Array.isArray(fixtures[table]) ? fixtures[table][0] : fixtures[table] }),
    then: (res: any, rej: any) => Promise.resolve({ data: fixtures[table] }).then(res, rej),
  };
  return b;
}
(globalThis as any).__createClient = () => ({
  rpc: async (name: string, args: any) => {
    calls.rpc.push({ name, args });
    if (name === 'claim_advertising_job') return { data: claimQueue.shift() ?? null, error: null };
    if (name === 'finish_advertising_job_failure') return { data: args._retryable && JOB.attempts < JOB.max_attempts ? 'retry' : 'failed', error: null };
    if (name === 'finish_advertising_job_success') return { data: 'banner-id', error: null };
    return { data: null, error: null };
  },
  from: (t: string) => builder(t),
});
globalThis.fetch = (async (url: any, init: any) => {
  const u = String(url);
  const body = typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body;
  calls.fetch.push({ url: u, body });
  if (u.includes('api.cloudinary.com')) return behave.cloudinary();
  if (u === 'https://api.openai.com/v1/images/generations') return behave.image(body.model, ++imageAttempts);
  if (u === 'https://api.openai.com/v1/responses') return JSON.stringify(body).includes('ad-image reviewer') ? behave.moderation(body) : behave.text(body);
  throw new Error(`unexpected fetch ${u}`);
}) as typeof fetch;

await import('./index.ts');

beforeEach(() => {
  for (const k of Object.keys(env)) delete env[k];
  Object.assign(env, {
    SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: SERVICE, OPENAI_API_KEY: OPENAI_KEY,
    CLOUDINARY_CLOUD_NAME: 'demo', CLOUDINARY_API_KEY: 'k', CLOUDINARY_API_SECRET: 's',
  });
  calls = { rpc: [], fetch: [], updates: [] };
  imageAttempts = 0;
  claimQueue = [{ ...JOB }];
  fixtures = {
    vendor_advertising_campaigns: { id: JOB.campaign_id, vendor_id: JOB.vendor_id, campaign_type: 'shop_promotion', status: 'generating', end_date: new Date(Date.now() + 864e5).toISOString(), custom_headline: null, custom_description: null, target_product_ids: [] },
    vendors: { store_name: 'TechWorld Nigeria', store_description: 'Phones and gadgets for everyone', business_type: 'Electronics', product_categories: ['Phones & Accessories'] },
    advertising_settings: { ai_cost_per_image_usd: 0.04 },
    products: [{ name: 'Galaxy S24 Ultra', category_id: 'c1' }, { name: 'USB-C Cable', category_id: 'c1' }],
    categories: [{ id: 'c1', name: 'Phones' }],
  };
  behave = {
    image: () => imageReply(png(2100, 900)),
    text: () => textReply(GOOD_COPY),
    moderation: () => textReply(CLEAN),
    cloudinary: () => reply({ secure_url: 'https://res.cloudinary.com/demo/image/upload/v1/ad.png', public_id: 'marketplace/vendors/x/ads/y' }),
  };
});

const run = async (headers: Record<string, string> = { Authorization: `Bearer ${SERVICE}` }, body: unknown = { max: 1 }, method = 'POST') => {
  const res = await handler(new Request('http://worker.test/', { method, headers, body: method === 'POST' ? JSON.stringify(body) : undefined }));
  return { status: res.status, json: await res.json() };
};
const rpcCalls = (name: string) => calls.rpc.filter((c) => c.name === name);
const uploads = () => calls.fetch.filter((f) => f.url.includes('cloudinary'));
const reset = () => { calls = { rpc: [], fetch: [], updates: [] }; claimQueue = [{ ...JOB }]; };

test('rejects callers that are not the server', async () => {
  assert.equal((await run({})).status, 401);
  assert.equal((await run({ Authorization: 'Bearer wrong-key' })).status, 401);
  assert.equal((await run({ Authorization: `Bearer ${SERVICE}x` })).status, 401);
  assert.equal((await run({ 'x-ad-worker-secret': 'short' })).status, 401);
  assert.equal((await run({ Authorization: `Bearer ${SERVICE}` }, {}, 'GET')).status, 405);
  assert.equal(rpcCalls('claim_advertising_job').length, 0, 'an unauthorised call must not touch the queue');
  assert.equal(calls.fetch.length, 0, 'an unauthorised call must not spend AI budget');
});

test('accepts the service key or a long worker secret', async () => {
  assert.equal((await run()).status, 200);
  claimQueue = [{ ...JOB }]; env.AD_WORKER_SECRET = 'a-long-random-worker-secret-123';
  assert.equal((await run({ 'x-ad-worker-secret': 'a-long-random-worker-secret-123' })).status, 200);
  env.AD_WORKER_SECRET = 'tooshort';
  assert.equal((await run({ 'x-ad-worker-secret': 'tooshort' })).status, 401, 'weak secrets are never accepted');
});

test('generates, reviews, uploads and records a banner from real shop data', async () => {
  const { status, json } = await run();
  assert.equal(status, 200);
  assert.deepEqual(json.results[0], { job: JOB.id, status: 'succeeded', category: 'phones', copy_source: 'ai' });
  const ok = rpcCalls('finish_advertising_job_success');
  assert.equal(ok.length, 1);
  const a = ok[0].args;
  assert.equal(a._job, JOB.id);
  assert.equal(a._image_url, 'https://res.cloudinary.com/demo/image/upload/v1/ad.png');
  assert.equal(a._width, 2100); assert.equal(a._height, 900);
  assert.equal(a._headline, 'Discover Premium Phones');
  assert.equal(a._art_category, 'phones');
  assert.equal(a._provider, 'openai');
  assert.equal(a._model, 'gpt-image-2@2016x864');
  assert.equal(a._cost, 0.042);
  assert.deepEqual(a._flags, []);
  assert.equal(a._meta.aspect_requested, '21:9');
  assert.match(a._prompt_hash, /^[0-9a-f]{64}$/);
  assert.equal(rpcCalls('finish_advertising_job_failure').length, 0);
});

test('the image prompt carries no shop name, product name, brand or digits, and forbids text', async () => {
  await run();
  const imageCall = calls.fetch.find((f) => f.url.includes('/images/generations'))!;
  const prompt: string = imageCall.body.prompt;
  assert.match(prompt, /NO text, letters, numbers/);
  assert.doesNotMatch(prompt, /TechWorld|Nigeria|Galaxy|USB|\bUltra\b/);   // case-sensitive: our own template says "ultra-wide"
  assert.doesNotMatch(prompt, /[0-9]/);
  assert.match(prompt, /Phones/);
  assert.equal(imageCall.body.size, '2016x864');
  assert.equal(imageCall.body.output_format, 'jpeg');
});

test('safety review happens BEFORE the upload, and the upload happens exactly once', async () => {
  await run();
  const order = calls.fetch.map((f) => f.url.includes('cloudinary') ? 'upload' : f.body && JSON.stringify(f.body).includes('ad-image reviewer') ? 'review' : f.url.includes('/images/generations') ? 'image' : 'copy');
  assert.equal(order.filter((o) => o === 'upload').length, 1);
  assert.ok(order.indexOf('image') < order.indexOf('review'));
  assert.ok(order.indexOf('review') < order.indexOf('upload'));
});

test('the API key is only ever sent to OpenAI, never stored or returned', async () => {
  const { json } = await run();
  assert.doesNotMatch(JSON.stringify(json), /sk-proj|FAKEKEY/);
  assert.doesNotMatch(JSON.stringify(calls.rpc), /sk-proj|FAKEKEY/);
  assert.ok(calls.fetch.filter((f) => !f.url.includes('cloudinary')).every((f) => f.url.startsWith('https://api.openai.com/')));
  assert.equal(uploads().every((u) => !u.url.includes('key=')), true);
});

test('an image containing text, a logo or an unsafe scene is refused and never uploaded', async () => {
  for (const verdict of [
    '{"safe":true,"contains_text":true,"contains_logo":false,"contains_face":false}',
    '{"safe":true,"contains_text":false,"contains_logo":true,"contains_face":false}',
    '{"safe":false,"contains_text":false,"contains_logo":false,"contains_face":false,"reasons":["nudity"]}',
    '{"safe":true,"contains_text":false,"contains_logo":false,"contains_face":true}',
  ]) {
    reset();
    behave.moderation = () => textReply(verdict);
    const { json } = await run();
    assert.equal(json.results[0].code, 'moderation_rejected', verdict);
    assert.equal(uploads().length, 0, `must not upload: ${verdict}`);
    assert.equal(rpcCalls('finish_advertising_job_success').length, 0);
    assert.equal(rpcCalls('finish_advertising_job_failure')[0].args._retryable, true);
  }
});

test('if the safety review cannot run or cannot be read, nothing is published', async () => {
  for (const [label, moderation] of [
    ['review service down', () => reply({ error: { message: 'unavailable' } }, 503)],
    ['unreadable verdict', () => textReply('Looks fine to me!')],
    ['verdict missing the safe field', () => textReply('{"contains_text":false}')],
  ] as const) {
    reset();
    behave.moderation = moderation;
    const { json } = await run();
    assert.equal(uploads().length, 0, label);
    assert.equal(rpcCalls('finish_advertising_job_success').length, 0, label);
    assert.equal(json.results[0].status, 'retry', label);
  }
});

test('a file that is not a suitable image is rejected before any review spend or upload', async () => {
  for (const bad of [Buffer.from('<html>'.repeat(6000)), png(600, 250), png(900, 1600), Buffer.alloc(100)]) {
    reset();
    behave.image = () => imageReply(bad);
    const { json } = await run();
    assert.equal(json.results[0].code, 'invalid_image');
    assert.equal(uploads().length, 0);
    assert.equal(calls.fetch.some((f) => JSON.stringify(f.body ?? '').includes('ad-image reviewer')), false);
  }
});

test('AI wording with prices, discounts or claims is replaced by vetted template wording', async () => {
  for (const copy of [
    '{"headline":"Save 50% on phones","description":"Browse phones and accessories from a shop on the marketplace."}',
    '{"headline":"Free delivery today","description":"Genuine certified phones with a warranty guarantee at the best price."}',
    'not json',
  ]) {
    reset();
    behave.text = () => textReply(copy);
    const { json } = await run();
    assert.equal(json.results[0].copy_source, 'template', copy);
    const a = rpcCalls('finish_advertising_job_success')[0].args;
    assert.doesNotMatch(`${a._headline} ${a._description}`, /[0-9%]|free|guarantee|warranty|genuine|certified|best price/i);
    assert.deepEqual(a._flags, ['template_copy']);
  }
});

test('if the wording service fails the banner is still created with template wording', async () => {
  behave.text = () => reply({ error: { message: 'boom' } }, 500);
  const { json } = await run();
  assert.equal(json.results[0].status, 'succeeded');
  assert.equal(json.results[0].copy_source, 'template');
});

test('a missing AI key or Cloudinary config fails once, without calling any provider', async () => {
  delete env.OPENAI_API_KEY;
  let r = await run();
  assert.equal(r.json.results[0].code, 'not_configured');
  assert.equal(rpcCalls('finish_advertising_job_failure')[0].args._retryable, false);
  assert.equal(calls.fetch.length, 0);
  env.OPENAI_API_KEY = OPENAI_KEY; delete env.CLOUDINARY_API_SECRET;
  reset();
  r = await run();
  assert.equal(r.json.results[0].code, 'not_configured');
  assert.equal(calls.fetch.length, 0, 'no AI money is spent when uploads cannot work');
});

test('falls back to the next image model when the first is not found', async () => {
  behave.image = (model) => model === 'gpt-image-2' ? reply({ error: { message: 'model not found' } }, 404) : imageReply(png(2100, 900));
  const { json } = await run();
  assert.equal(json.results[0].status, 'succeeded');
  assert.equal(rpcCalls('finish_advertising_job_success')[0].args._model, 'gpt-image-1.5@1536x1024');
});

test('AD_IMAGE_MODEL overrides the defaults and bad names are refused', async () => {
  env.AD_IMAGE_MODEL = 'my-custom-image-model';
  await run();
  assert.ok(calls.fetch.some((f) => f.body?.model === 'my-custom-image-model'));
  env.AD_IMAGE_MODEL = '../../evil?x=';
  reset();
  const { json } = await run();
  assert.equal(json.results[0].code, 'not_configured');
  assert.equal(calls.fetch.length, 0);
});

test('retries on rate limits and outages, but not on bad credentials', async () => {
  for (const [status, retryable, code] of [[429, true, 'provider_rate_limited'], [503, true, 'provider_unavailable'], [401, false, 'provider_auth'], [403, false, 'provider_auth']] as const) {
    reset();
    behave.image = () => reply({ error: { message: 'x' } }, status);
    const { json } = await run();
    assert.equal(json.results[0].code, code);
    assert.equal(rpcCalls('finish_advertising_job_failure')[0].args._retryable, retryable, `HTTP ${status}`);
    assert.equal(uploads().length, 0);
  }
});

test('a provider error that echoes the API key never reaches the database', async () => {
  behave.image = () => reply({ error: { message: `Incorrect API key provided: ${OPENAI_KEY}. Bearer ${OPENAI_KEY}` } }, 400);
  await run();
  assert.doesNotMatch(JSON.stringify(calls.rpc), /sk-proj|FAKEKEY/);
});

test('a network error (whose text could contain the request URL) is stored without the key', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: any, init: any) => {
    if (String(url).includes('api.openai.com')) throw new TypeError(`fetch failed for ${url}`);
    return realFetch(url, init);
  }) as typeof fetch;
  try {
    const { json } = await run();
    assert.equal(json.results[0].code, 'provider_network');
    assert.doesNotMatch(JSON.stringify(calls.rpc), /sk-proj|FAKEKEY/);
  } finally { globalThis.fetch = realFetch; }
});

test('a Cloudinary failure is recorded as a retryable failure and nothing is marked successful', async () => {
  behave.cloudinary = () => reply({ error: { message: 'nope' } }, 500);
  const { json } = await run();
  assert.equal(json.results[0].status, 'retry');
  assert.equal(rpcCalls('finish_advertising_job_success').length, 0);
});

test('a job whose campaign already ended is cancelled without any AI spend', async () => {
  fixtures.vendor_advertising_campaigns.status = 'expired';
  const { json } = await run();
  assert.deepEqual(json.results[0], { job: JOB.id, status: 'cancelled' });
  assert.equal(calls.fetch.length, 0);
  assert.ok(calls.updates.some((u) => u.table === 'advertising_generation_jobs' && u.v.status === 'cancelled'));
  reset();
  fixtures.vendor_advertising_campaigns.status = 'generating';
  fixtures.vendor_advertising_campaigns.end_date = new Date(Date.now() - 1000).toISOString();
  assert.equal((await run()).json.results[0].status, 'cancelled');
  assert.equal(calls.fetch.length, 0);
});

test('an empty queue (or an admin usage limit, which makes claim return nothing) does no work', async () => {
  claimQueue = [];
  const { json } = await run();
  assert.equal(json.processed, 0);
  assert.equal(calls.fetch.length, 0);
});

test('processes at most the requested number of jobs per call', async () => {
  claimQueue = [{ ...JOB }, { ...JOB, id: 'job-2' }, { ...JOB, id: 'job-3' }];
  const { json } = await run({ Authorization: `Bearer ${SERVICE}` }, { max: 2 });
  assert.equal(json.processed, 2);
  assert.equal(claimQueue.length, 1);
  claimQueue = Array.from({ length: 20 }, (_, i) => ({ ...JOB, id: `j${i}` }));
  assert.ok((await run({ Authorization: `Bearer ${SERVICE}` }, { max: 999 })).json.processed <= 5, 'hard cap of 5 per call');
});

test('expires finished campaigns each time it runs', async () => {
  await run();
  assert.equal(rpcCalls('expire_advertising_campaigns').length, 1);
});

test('a wide size the model refuses falls back to the standard size, then succeeds', async () => {
  const sizes: string[] = [];
  const orig = behave.image;
  globalThis.fetch = ((f) => (async (url: any, init: any) => {
    if (String(url).endsWith('/images/generations')) sizes.push(JSON.parse(init.body).size);
    return f(url, init);
  }) as typeof fetch)(globalThis.fetch);
  let n = 0;
  behave.image = () => (++n === 1 ? reply({ error: { message: 'invalid size' } }, 400) : orig('x', n));
  const { json } = await run();
  assert.equal(json.results[0].status, 'succeeded');
  assert.deepEqual(sizes.slice(-2), ['2016x864', '1536x1024']);
  assert.equal(rpcCalls('finish_advertising_job_success')[0].args._model, 'gpt-image-2@1536x1024');
});

test('an exhausted OpenAI quota is not retried', async () => {
  behave.image = () => reply({ error: { message: 'You exceeded your quota', code: 'insufficient_quota' } }, 429);
  const { json } = await run();
  assert.equal(json.results[0].code, 'provider_quota');
  assert.equal(rpcCalls('finish_advertising_job_failure')[0].args._retryable, false);
});

// Makes a small thumbnail (400 px) for products that were added before thumbnails existed, and saves its link
// in products.thumb_url. Product cards then load the small file instead of the full photo.
// Needs Node 18+ and the image library "sharp":   npm i --no-save sharp
// Run supabase/migrations/20261023090000_scale_5m.sql and 20261024090000_scale_5m_cleanup.sql first.
//
//   SUPABASE_URL=https://xxxx.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=<service_role key, never put it in the website> \
//   node scripts/backfill-thumbnails.mjs
//
// Optional:
//   DRY_RUN=1       read one batch and report what it would do, write nothing
//   LIMIT=1000      stop after this many products (try a small number first)
//   BATCH=200       products read per round          CONCURRENCY=8   photos processed at the same time
//
// Safe to stop and re-run: only products without a thumbnail are picked up, so it carries on where it stopped
// (photos that failed are tried again next run). Thumbnails are stored in the vendor-assets bucket under thumbs/.
// When it has finished, drop the helper index:  DROP INDEX IF EXISTS public.idx_products_needs_thumb;

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. See the top of this file.');
  process.exit(1);
}
let sharp;
try { ({ default: sharp } = await import('sharp')); } catch {
  console.error('This script needs the "sharp" package. Run:  npm i --no-save sharp');
  process.exit(1);
}

const BASE = SUPABASE_URL.replace(/\/$/, '');
const H = { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` };
const BUCKET = 'vendor-assets';
const BATCH = Math.max(1, Number(process.env.BATCH) || 200);
const CONCURRENCY = Math.max(1, Number(process.env.CONCURRENCY) || 8);
const LIMIT = Number(process.env.LIMIT) || 0;
const DRY = process.env.DRY_RUN === '1';
const THUMB = 400;
const MAX_INPUT_BYTES = 25 * 1024 * 1024;

async function readBatch(afterId) {
  const url = `${BASE}/rest/v1/products?select=id,image_url&thumb_url=is.null&image_url=not.is.null` +
    `&id=gt.${afterId}&order=id.asc&limit=${BATCH}`;
  const res = await fetch(url, { headers: H });
  if (!res.ok) throw new Error(`Reading products failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function saveBatch(rows) {
  if (!rows.length) return;
  const res = await fetch(`${BASE}/rest/v1/rpc/set_product_thumbnails`, {
    method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ _rows: rows }),
  });
  if (!res.ok) throw new Error(`Saving thumbnail links failed: ${res.status} ${await res.text()}`);
}

// Returns the thumbnail link for one product, or null when the photo cannot be used (reason in `why`).
async function makeThumb(p) {
  if (!/^https?:\/\//i.test(p.image_url)) return { skip: 'not a web link' };
  const src = await fetch(p.image_url, { signal: AbortSignal.timeout(20_000) });
  if (!src.ok) throw new Error(`download ${src.status}`);
  if (!(src.headers.get('content-type') || '').startsWith('image/')) return { skip: 'not an image' };
  if (Number(src.headers.get('content-length')) > MAX_INPUT_BYTES) return { skip: 'file too big' };
  const input = Buffer.from(await src.arrayBuffer());
  const image = sharp(input, { failOn: 'none', limitInputPixels: 100_000_000 });
  const meta = await image.metadata();
  // Already small: the original is as good as a thumbnail, so point at it and move on.
  if ((meta.width ?? 0) <= THUMB && (meta.height ?? 0) <= THUMB && input.length <= 40_000) return { url: p.image_url };

  const out = await image
    .rotate()                                   // honour the phone's orientation
    .flatten({ background: '#ffffff' })         // cards have a white background; PNG transparency becomes white
    .resize({ width: THUMB, height: THUMB, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 75, mozjpeg: true })
    .toBuffer();
  if (DRY) return { url: `${BASE}/storage/v1/object/public/${BUCKET}/thumbs/${p.id}.jpg`, bytes: out.length };

  const up = await fetch(`${BASE}/storage/v1/object/${BUCKET}/thumbs/${p.id}.jpg`, {
    method: 'POST',
    headers: { ...H, 'Content-Type': 'image/jpeg', 'x-upsert': 'true', 'cache-control': 'max-age=31536000' },
    body: out,
  });
  if (!up.ok) throw new Error(`upload ${up.status} ${await up.text()}`);
  return { url: `${BASE}/storage/v1/object/public/${BUCKET}/thumbs/${p.id}.jpg`, bytes: out.length };
}

let done = 0, skipped = 0, failed = 0, processed = 0;
let afterId = '00000000-0000-0000-0000-000000000000';
const started = Date.now();

while (!LIMIT || processed < LIMIT) {
  let batch = await readBatch(afterId);
  if (!batch.length) break;
  afterId = batch[batch.length - 1].id;
  if (LIMIT) batch = batch.slice(0, Math.max(0, LIMIT - processed));
  processed += batch.length;

  const results = [];
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batch.length) }, async () => {
    while (next < batch.length) {
      const p = batch[next++];
      try {
        const r = await makeThumb(p);
        if (r.url) { results.push({ id: p.id, thumb_url: r.url }); done++; } else { skipped++; }
      } catch (e) {
        failed++; console.warn(`  failed ${p.id}: ${e.message}`);
      }
    }
  }));

  if (!DRY) await saveBatch(results);
  const mins = (Date.now() - started) / 60000;
  console.log(`${DRY ? '[dry run] ' : ''}processed ${processed}  (thumbnails ${done}, skipped ${skipped}, failed ${failed})  ` +
    `${(processed / Math.max(mins, 0.01)).toFixed(0)} per minute`);
  if (DRY) break;
}
console.log(`Finished. Thumbnails: ${done}, skipped: ${skipped}, failed: ${failed}.` +
  (failed ? ' Re-run to retry the failed ones.' : ''));

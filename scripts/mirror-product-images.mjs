// Saves a copy of every product image in YOUR OWN Storage, so the pictures survive even if they are
// later removed from the website they came from. Then it points each product at the saved copies.
//
// Needs Node 18+ (nothing to install). Run it AFTER the 4 SQL files have added the products:
//
//   SUPABASE_URL=https://xxxx.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=<service_role key, never put it in the website> \
//   node scripts/mirror-product-images.mjs
//
// Optional settings:
//   STORE_NAME="YOMI DEV VENTURES"   which store's products to process (this is the default)
//   SOURCE_HOSTS=host1,host2         only images from these hosts are copied (default: the Technocrat bucket)
//   DRY_RUN=1                        look at everything and report, but download/upload/change nothing
//   CONCURRENCY=6                    pictures handled at the same time
//
// How it keeps things safe:
//   * A product is switched to the saved copy ONLY after that copy was uploaded and checked
//     (the saved file is fetched back and its size compared). Otherwise the product keeps its old link.
//   * Each different picture is saved once, even when several products share it.
//   * Safe to stop and run again: pictures already saved are recognised and skipped; failures are retried.
//   * Nothing is ever deleted. The original links are listed in image-mirror-report.csv.
// Afterwards, run scripts/backfill-thumbnails.mjs to make the small card pictures from the saved copies.

import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. See the top of this file.');
  process.exit(1);
}
const BASE = SUPABASE_URL.replace(/\/$/, '');
const H = { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` };
const BUCKET = 'vendor-assets';
const STORE = (process.env.STORE_NAME || 'YOMI DEV VENTURES').trim();
const SOURCE_HOSTS = (process.env.SOURCE_HOSTS || 'technocratblessingcomputers.fra1.digitaloceanspaces.com')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
const CONCURRENCY = Math.max(1, Number(process.env.CONCURRENCY) || 6);
const DRY = process.env.DRY_RUN === '1';
const MAX_BYTES = 25 * 1024 * 1024;
const EXT_TYPE = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif' };

async function rest(path, init = {}) {
  const res = await fetch(`${BASE}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init.headers || {}) } });
  if (!res.ok) throw new Error(`${init.method || 'GET'} ${path.split('?')[0]} failed: ${res.status} ${await res.text()}`);
  return res;
}

async function findVendor() {
  const res = await rest(`vendors?select=id,store_name&store_name=ilike.${encodeURIComponent(STORE)}`);
  const rows = (await res.json()).filter(v => v.store_name.trim().toLowerCase() === STORE.toLowerCase());
  if (rows.length !== 1) throw new Error(`Expected exactly one store named "${STORE}", found ${rows.length}.`);
  return rows[0].id;
}

async function loadProducts(vendorId) {
  const all = [];
  for (let offset = 0; ; offset += 500) {
    const res = await rest(`products?select=id,slug,image_url,images&vendor_id=eq.${vendorId}&order=id.asc&limit=500&offset=${offset}`);
    const page = await res.json();
    all.push(...page);
    if (page.length < 500) return all;
  }
}

// A link into our own Storage is never a source (so a saved copy is never copied again).
const isSource = u => { try { return !u.startsWith(`${BASE}/storage/`) && SOURCE_HOSTS.includes(new URL(u).host.toLowerCase()); } catch { return false; } };
const extOf = u => { const m = new URL(u).pathname.match(/\.(jpe?g|png|webp|gif|avif)$/i); return m ? m[1].toLowerCase().replace('jpeg', 'jpg') : 'jpg'; };
function sniff(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.slice(0, 4).toString('latin1') === '\x89PNG') return 'image/png';
  if (buf.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  if (buf.slice(0, 3).toString('latin1') === 'GIF') return 'image/gif';
  if (buf.slice(4, 12).toString('latin1').startsWith('ftypavif')) return 'image/avif';
  return null;
}

async function exists(url) {
  try { const r = await fetch(url, { method: 'HEAD' }); return r.ok; } catch { return false; }
}

async function download(url) {
  let last;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (!res.ok) throw new Error(`download ${res.status}`);
      const declared = Number(res.headers.get('content-length'));
      if (declared > MAX_BYTES) throw new Error('file too big');
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > MAX_BYTES) throw new Error('file too big');
      const type = sniff(buf) || ((res.headers.get('content-type') || '').startsWith('image/') ? res.headers.get('content-type').split(';')[0] : null);
      if (!type) throw new Error('not an image');
      return { buf, type };
    } catch (e) { last = e; if (/not an image|too big|download 404|download 403|download 410/.test(e.message)) break; await new Promise(r => setTimeout(r, 800 * attempt)); }
  }
  throw last;
}

async function saveOne(entry) {
  if (await exists(entry.publicUrl)) { entry.status = 'already saved'; entry.ok = true; return; }
  if (DRY) { entry.status = 'would save'; entry.ok = false; return; }
  try {
    const { buf, type } = await download(entry.source);
    const up = await fetch(`${BASE}/storage/v1/object/${BUCKET}/${entry.path}`, {
      method: 'POST', headers: { ...H, 'Content-Type': type || EXT_TYPE[entry.ext] || 'image/jpeg', 'x-upsert': 'true', 'cache-control': 'max-age=31536000' }, body: buf,
    });
    if (!up.ok) throw new Error(`upload ${up.status} ${await up.text()}`);
    const back = await fetch(entry.publicUrl);                          // fetch the saved copy back and compare sizes
    if (!back.ok) throw new Error(`saved copy not readable (${back.status})`);
    const got = Buffer.from(await back.arrayBuffer()).length;
    if (got !== buf.length) throw new Error(`saved copy is ${got} bytes, expected ${buf.length}`);
    entry.bytes = buf.length; entry.status = 'saved'; entry.ok = true;
  } catch (e) { entry.status = `FAILED: ${e.message}`; entry.ok = false; }
}

const vendorId = await findVendor();
const products = await loadProducts(vendorId);
console.log(`Store "${STORE}": ${products.length} products.${DRY ? '  (dry run: nothing will be changed)' : ''}`);

// every different source picture, once
const plan = new Map();
const usedBy = new Map();
for (const p of products) {
  for (const u of [p.image_url, ...(p.images || [])].filter(Boolean)) {
    if (!isSource(u)) continue;
    if (!plan.has(u)) {
      const key = createHash('sha1').update(u).digest('hex').slice(0, 16);
      const ext = extOf(u); const path = `${vendorId}/products/mirror-${key}.${ext}`;
      plan.set(u, { source: u, ext, path, publicUrl: `${BASE}/storage/v1/object/public/${BUCKET}/${path}`, status: 'pending', ok: false, bytes: '' });
    }
    usedBy.set(u, (usedBy.get(u) || new Set()).add(p.id));
  }
}
console.log(`${plan.size} different pictures to save (some are shared by several products).`);

const queue = [...plan.values()]; let done = 0;
await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
  while (queue.length) {
    const e = queue.shift(); await saveOne(e); done++;
    if (done % 25 === 0 || done === plan.size) console.log(`  ${done}/${plan.size} pictures handled`);
  }
}));

// switch each product to the saved copies (only the ones that were saved and checked)
let changed = 0, unchanged = 0;
for (const p of products) {
  const swap = u => (u && plan.get(u)?.ok ? plan.get(u).publicUrl : u);
  const image_url = swap(p.image_url); const images = (p.images || []).map(swap);
  const same = image_url === p.image_url && images.every((u, i) => u === p.images[i]);
  if (same) { unchanged++; continue; }
  if (DRY) { changed++; continue; }
  await rest(`products?id=eq.${p.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ image_url, images }) });
  changed++;
}

const q = s => `"${String(s).replace(/"/g, '""')}"`;
const lines = ['source_url,status,saved_copy_url,bytes,used_by_products', ...[...plan.values()].map(e => [q(e.source), q(e.status), q(e.ok ? e.publicUrl : ''), e.bytes, usedBy.get(e.source).size].join(','))];
writeFileSync('image-mirror-report.csv', lines.join('\n') + '\n');
const count = s => [...plan.values()].filter(e => e.status === s).length;
const failed = [...plan.values()].filter(e => e.status.startsWith('FAILED')).length;
console.log(`\nFinished. Saved now: ${count('saved')}, already saved: ${count('already saved')}, failed: ${failed}${DRY ? `, would save: ${count('would save')}` : ''}.`);
console.log(`Products switched to saved copies: ${changed}. Left as they were: ${unchanged}.`);
if (failed) console.log('Some pictures could not be saved (see image-mirror-report.csv). Those products still use their original link. Run the script again later to retry.');
console.log('Details: image-mirror-report.csv');
process.exit(failed ? 2 : 0);

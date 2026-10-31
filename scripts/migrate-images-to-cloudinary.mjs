// Copies existing product photos (old Supabase Storage links or other websites) to Cloudinary and points the products at the copies.
// Needs Node 18+ and the Cloudinary library:   npm i --no-save cloudinary
//
//   SUPABASE_URL=https://xxxx.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=<service_role key, never put it in the website> \
//   CLOUDINARY_CLOUD_NAME=... CLOUDINARY_API_KEY=... CLOUDINARY_API_SECRET=... \
//   node scripts/migrate-images-to-cloudinary.mjs
//
// Optional:
//   DRY_RUN=1          list what would be uploaded; uploads nothing, changes nothing (try this first)
//   LIMIT=50           stop after this many products (start small)
//   BATCH=100          products read per round         CONCURRENCY=4   photos uploaded at the same time
//   RETRY_FAILED=1     only products whose photos failed in an earlier run
//   ONLY_PRODUCT=<id>  only this one product (retry a single product)
//   STATE_FILE=...     resume file   (default scripts/cloudinary-migration-state.json)
//   REPORT_FILE=...    CSV report    (default scripts/cloudinary-migration-report.csv)
//
// Safety:
//   * Nothing is ever deleted. The old files stay in Supabase Storage; every old link is written to the CSV report (rollback = put them back).
//   * A product is changed ONLY when every one of its photos reached Cloudinary. Otherwise it keeps all its old links untouched.
//   * The update only applies if the product has not been edited since it was read (guard on updated_at), and it touches only image_url and images.
//     Name, price, stock, description, specs, thumb_url and vendor are never written.
//   * Photo order and the main photo (image_url) are kept: position 0 is the main photo, then images[] in order.
//   * Safe to stop and re-run: finished uploads are remembered in the state file, and each photo's Cloudinary name is derived from
//     its source link, so a restart can never create a duplicate. Products already on Cloudinary are skipped.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
const DRY = process.env.DRY_RUN === '1';
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) { console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. See the top of this file.'); process.exit(1); }
let cloudinary = null;
if (!DRY) {
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) { console.error('Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET.'); process.exit(1); }
  try { const mod = await import('cloudinary'); cloudinary = mod.v2 ?? mod.default?.v2 ?? mod.default; } catch { console.error('This script needs the "cloudinary" package. Run:  npm i --no-save cloudinary'); process.exit(1); }
  cloudinary.config({ cloud_name: CLOUDINARY_CLOUD_NAME, api_key: CLOUDINARY_API_KEY, api_secret: CLOUDINARY_API_SECRET, secure: true });
}

const BASE = SUPABASE_URL.replace(/\/$/, '');
const H = { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' };
const BATCH = Math.max(1, Number(process.env.BATCH) || 100);
const CONCURRENCY = Math.max(1, Number(process.env.CONCURRENCY) || 4);
const LIMIT = Number(process.env.LIMIT) || 0;
const STATE_FILE = process.env.STATE_FILE || 'scripts/cloudinary-migration-state.json';
const REPORT_FILE = process.env.REPORT_FILE || 'scripts/cloudinary-migration-report.csv';
const ONLY = process.env.ONLY_PRODUCT || '';
const RETRY_FAILED = process.env.RETRY_FAILED === '1';
const FORMATS = 'jpg,jpeg,png,webp,gif,avif';

// state: { uploaded: { "<vendor>|<sourceUrl>": {url, publicId} }, failed: { "<productId>": { reason, at } }, migrated: { "<productId>": time } }
const state = existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, 'utf8')) : { uploaded: {}, failed: {}, migrated: {} };
state.uploaded ??= {}; state.failed ??= {}; state.migrated ??= {};
const saveState = () => { if (!DRY) writeFileSync(STATE_FILE, JSON.stringify(state, null, 1)); };
const csv = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
if (!DRY && !existsSync(REPORT_FILE)) writeFileSync(REPORT_FILE, 'time,product_id,vendor_id,position,status,source_url,cloudinary_url,public_id,error\n');
const report = (row) => { if (!DRY) appendFileSync(REPORT_FILE, [new Date().toISOString(), row.product, row.vendor, row.pos, row.status, row.src, row.url, row.publicId, row.error].map(csv).join(',') + '\n'); };

const isCloudinary = u => { try { return new URL(u).hostname === 'res.cloudinary.com'; } catch { return false; } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function readBatch(afterId) {
  const q = new URLSearchParams({ select: 'id,vendor_id,image_url,images,updated_at', order: 'id.asc', limit: String(BATCH) });
  if (afterId) q.set('id', `gt.${afterId}`);
  if (ONLY) q.set('id', `eq.${ONLY}`);
  const res = await fetch(`${BASE}/rest/v1/products?${q}`, { headers: H });
  if (!res.ok) throw new Error(`Reading products failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function uploadOne(vendor, src) {
  const key = `${vendor}|${src}`;
  if (state.uploaded[key]) return { ...state.uploaded[key], reused: true };
  // The Cloudinary name comes from the source link, so the same photo always maps to the same file (no duplicates on restart).
  const publicId = `marketplace/vendors/${vendor}/products/m${createHash('sha1').update(src).digest('hex').slice(0, 20)}`;
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const r = await cloudinary.uploader.upload(src, { public_id: publicId, overwrite: false, resource_type: 'image', allowed_formats: FORMATS });
      const out = { url: r.secure_url, publicId: r.public_id };
      state.uploaded[key] = out; saveState();
      return out;
    } catch (e) {
      lastErr = e?.error?.message || e?.message || String(e);
      if (/invalid|not allowed|unsupported|404|not found|blocked/i.test(lastErr)) break; // retrying will not help
      await sleep(1000 * attempt);
    }
  }
  throw new Error(lastErr);
}

async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } }));
  return out;
}

const totals = { products: 0, alreadyOnCloudinary: 0, noImages: 0, migrated: 0, failed: 0, skippedChanged: 0, photosUploaded: 0, photosReused: 0, wouldUpload: 0 };

async function processProduct(p) {
  const sources = [p.image_url, ...(p.images ?? [])];               // position 0 = main photo
  const todo = sources.map((src, pos) => ({ src, pos })).filter(x => x.src);
  if (!todo.length) { totals.noImages++; return; }
  if (todo.every(x => isCloudinary(x.src))) { totals.alreadyOnCloudinary++; return; }
  const vendor = p.vendor_id || 'unassigned';

  if (DRY) {
    const n = todo.filter(x => !isCloudinary(x.src)).length;
    totals.wouldUpload += n;
    console.log(`[dry] ${p.id}: ${n} photo(s) would move to Cloudinary`);
    return;
  }

  const results = [];
  let failure = null;
  for (const { src, pos } of todo) {
    if (isCloudinary(src)) { results.push({ pos, url: src }); continue; }
    if (!/^https:\/\//i.test(src)) { failure = `position ${pos}: not an https link`; report({ product: p.id, vendor, pos, status: 'failed', src, error: failure }); break; }
    try {
      const r = await uploadOne(vendor, src);
      r.reused ? totals.photosReused++ : totals.photosUploaded++;
      results.push({ pos, url: r.url });
      report({ product: p.id, vendor, pos, status: r.reused ? 'reused' : 'uploaded', src, url: r.url, publicId: r.publicId });
    } catch (e) { failure = `position ${pos}: ${e.message}`; report({ product: p.id, vendor, pos, status: 'failed', src, error: e.message }); break; }
  }
  if (failure) {
    state.failed[p.id] = { reason: failure, at: new Date().toISOString() }; saveState();
    totals.failed++; console.warn(`FAILED ${p.id}: ${failure}  (product left unchanged)`);
    return;
  }

  // Rebuild image_url + images in the same order, then write only if the product was not edited meanwhile.
  const byPos = new Map(results.map(r => [r.pos, r.url]));
  const newMain = p.image_url ? byPos.get(0) : null;
  const newExtras = (p.images ?? []).map((src, i) => (src ? byPos.get(i + 1) : null)).filter(Boolean);
  const patch = {}; if (p.image_url) patch.image_url = newMain; if ((p.images ?? []).length) patch.images = newExtras;
  if (Object.values(patch).some(v => v === undefined || (Array.isArray(v) && v.length !== (p.images ?? []).filter(Boolean).length))) {
    state.failed[p.id] = { reason: 'incomplete result, not saved', at: new Date().toISOString() }; saveState(); totals.failed++; return;
  }
  const res = await fetch(`${BASE}/rest/v1/products?id=eq.${p.id}&updated_at=eq.${encodeURIComponent(p.updated_at)}`, {
    method: 'PATCH', headers: { ...H, Prefer: 'return=representation' }, body: JSON.stringify(patch),
  });
  if (!res.ok) { state.failed[p.id] = { reason: `database update failed (${res.status})`, at: new Date().toISOString() }; saveState(); totals.failed++; console.warn(`FAILED ${p.id}: database update ${res.status}`); return; }
  if (!(await res.json()).length) { totals.skippedChanged++; console.warn(`SKIPPED ${p.id}: edited while migrating. Run again to pick it up.`); return; }
  delete state.failed[p.id]; state.migrated[p.id] = new Date().toISOString(); saveState();
  totals.migrated++;
}

let after = null, seen = 0;
const failedIds = new Set(Object.keys(state.failed));
console.log(`${DRY ? 'DRY RUN. ' : ''}Starting. Report: ${REPORT_FILE}  State: ${STATE_FILE}`);
outer: while (true) {
  const rows = await readBatch(after);
  if (!rows.length) break;
  after = rows[rows.length - 1].id;
  const wanted = rows.filter(p => !state.migrated[p.id] && (!RETRY_FAILED || failedIds.has(p.id)));
  const slice = LIMIT ? wanted.slice(0, Math.max(0, LIMIT - seen)) : wanted;
  seen += slice.length; totals.products += slice.length;
  await pool(slice, CONCURRENCY, p => processProduct(p).catch(e => { totals.failed++; state.failed[p.id] = { reason: String(e.message || e), at: new Date().toISOString() }; saveState(); console.warn(`FAILED ${p.id}: ${e.message}`); }));
  console.log(`…${seen} products checked`);
  if ((LIMIT && seen >= LIMIT) || ONLY) break outer;
}
console.log('\nSummary', totals, `\nStill failed: ${Object.keys(state.failed).length}`);
for (const [id, f] of Object.entries(state.failed)) console.log(`  ${id}: ${f.reason}`);

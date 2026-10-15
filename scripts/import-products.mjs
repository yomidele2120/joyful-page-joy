// Copies categories + products (and their images) from your OLD Supabase project
// (Lovable Cloud) into your NEW one. Needs Node 18+. No packages to install.
//
//   OLD_URL=https://dvjxavjuwwcpcpcrlsjf.supabase.co \
//   OLD_ANON_KEY=<anon key from the OLD .env> \
//   NEW_URL=https://cgyzhkeliomwxwrpmnlh.supabase.co \
//   NEW_SERVICE_ROLE_KEY=<service_role key of the NEW project> \
//   node scripts/import-products.mjs
//
// Optional:
//   NEW_VENDOR_ID=<uuid>   attach every imported product to this supplier in the new project
//                          (old vendor ids do not exist there; without it vendor_id is left empty)
//   COPY_IMAGES=0          keep image links pointing at the old project instead of copying files
//   DRY_RUN=1              only read and report, write nothing
//
// Safe to re-run: products are matched on their slug and updated, not duplicated.

const { OLD_URL, OLD_ANON_KEY, NEW_URL, NEW_SERVICE_ROLE_KEY, NEW_VENDOR_ID } = process.env;
const COPY_IMAGES = process.env.COPY_IMAGES !== '0';
const DRY = process.env.DRY_RUN === '1';

for (const [k, v] of Object.entries({ OLD_URL, OLD_ANON_KEY, NEW_URL, NEW_SERVICE_ROLE_KEY })) {
  if (!v) { console.error(`Missing ${k}. See the top of this file.`); process.exit(1); }
}
const oldBase = OLD_URL.replace(/\/$/, '');
const newBase = NEW_URL.replace(/\/$/, '');
const oldH = { apikey: OLD_ANON_KEY, Authorization: `Bearer ${OLD_ANON_KEY}` };
const newH = { apikey: NEW_SERVICE_ROLE_KEY, Authorization: `Bearer ${NEW_SERVICE_ROLE_KEY}` };

async function readAll(table, order = 'id') {
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const res = await fetch(`${oldBase}/rest/v1/${table}?select=*&order=${order}&limit=1000&offset=${offset}`, { headers: oldH });
    if (!res.ok) throw new Error(`Reading old ${table} failed: ${res.status} ${await res.text()}`);
    const page = await res.json();
    rows.push(...page);
    if (page.length < 1000) break;
  }
  return rows;
}

async function upsert(table, rows, onConflict) {
  for (let i = 0; i < rows.length; i += 50) {
    const res = await fetch(`${newBase}/rest/v1/${table}?on_conflict=${onConflict}`, {
      method: 'POST',
      headers: { ...newH, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(rows.slice(i, i + 50)),
    });
    if (!res.ok) throw new Error(`Writing ${table} failed: ${res.status} ${await res.text()}`);
  }
}

// ---- images: copy files from the old project's storage into the new one
const copied = new Map();
let imgOk = 0, imgFail = 0;
async function moveImage(url) {
  if (!url || !COPY_IMAGES) return url;
  const marker = `${oldBase}/storage/v1/object/public/`;
  if (!url.startsWith(marker)) return url;          // external link or data: leave as is
  if (copied.has(url)) return copied.get(url);
  const path = decodeURIComponent(url.slice(marker.length).split('?')[0]); // bucket/folder/file.ext
  const [bucket, ...rest] = path.split('/');
  const objectPath = rest.join('/');
  const newUrl = `${newBase}/storage/v1/object/public/${path}`;
  try {
    const src = await fetch(url);
    if (!src.ok) throw new Error(`download ${src.status}`);
    const buf = Buffer.from(await src.arrayBuffer());
    const up = await fetch(`${newBase}/storage/v1/object/${bucket}/${objectPath.split('/').map(encodeURIComponent).join('/')}`, {
      method: 'POST',
      headers: { ...newH, 'Content-Type': src.headers.get('content-type') || 'application/octet-stream', 'x-upsert': 'true' },
      body: buf,
    });
    if (!up.ok) throw new Error(`upload ${up.status} ${await up.text()}`);
    imgOk++; copied.set(url, newUrl); return newUrl;
  } catch (e) {
    imgFail++; console.warn(`  image not copied (${e.message}): ${url}`);
    copied.set(url, url); return url;               // keep the old link so the image still shows
  }
}

// ---- 1. categories
console.log('Reading old categories and products...');
const oldCats = await readAll('categories');
const oldProducts = await readAll('products');
console.log(`Found ${oldCats.length} categories and ${oldProducts.length} products.`);
if (DRY) { console.log('DRY_RUN=1: nothing written.'); process.exit(0); }

const catRows = [];
for (const c of oldCats) {
  catRows.push({
    name: c.name, slug: c.slug, description: c.description ?? null,
    image_url: await moveImage(c.image_url), sort_order: c.sort_order ?? null,
  });
}
await upsert('categories', catRows, 'slug');

const newCatsRes = await fetch(`${newBase}/rest/v1/categories?select=id,slug`, { headers: newH });
const newCats = await newCatsRes.json();
const idBySlug = new Map(newCats.map(c => [c.slug, c.id]));
const oldIdToNew = new Map(oldCats.map(c => [c.id, idBySlug.get(c.slug)]));

// category parents (second pass, now that every category has a new id)
for (const c of oldCats) {
  if (!c.parent_id) continue;
  const parent = oldIdToNew.get(c.parent_id);
  const self = oldIdToNew.get(c.id);
  if (!parent || !self) continue;
  await fetch(`${newBase}/rest/v1/categories?id=eq.${self}`, {
    method: 'PATCH', headers: { ...newH, 'Content-Type': 'application/json' }, body: JSON.stringify({ parent_id: parent }),
  });
}
console.log('Categories done.');

// ---- 2. products
const out = [];
for (const p of oldProducts) {
  const images = Array.isArray(p.images) ? await Promise.all(p.images.map(moveImage)) : null;
  out.push({
    name: p.name, slug: p.slug, description: p.description ?? null,
    price: p.price, compare_at_price: p.compare_at_price ?? null,
    image_url: await moveImage(p.image_url), images,
    category_id: oldIdToNew.get(p.category_id) ?? null,
    vendor_id: NEW_VENDOR_ID || null,
    brand: p.brand ?? null, sku: p.sku ?? null,
    stock_quantity: p.stock_quantity ?? 0,
    is_active: p.is_active ?? true, is_featured: p.is_featured ?? false, badge: p.badge ?? null,
    moq: p.moq ?? 1, unit: p.unit ?? 'Piece',
    price_tiers: p.price_tiers ?? [], specs: p.specs ?? {}, video_url: p.video_url ?? null,
  });
}
await upsert('products', out, 'slug');

console.log(`Products done: ${out.length} imported.`);
if (COPY_IMAGES) console.log(`Images copied: ${imgOk}${imgFail ? `, ${imgFail} could not be copied (old links kept)` : ''}.`);

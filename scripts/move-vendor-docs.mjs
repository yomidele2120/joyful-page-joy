// One-time script: moves existing vendor verification documents out of the PUBLIC
// "vendor-assets" bucket into the PRIVATE "vendor-docs" bucket.
//
// Run it once, AFTER the security_hardening migration:
//   SUPABASE_URL=https://xxxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=your_service_role_key \
//     node scripts/move-vendor-docs.mjs
//
// The service role key is a secret. Use it only in your own terminal, never in the website code.
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.');
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });

const { data: rows, error } = await sb
  .from('vendor_private')
  .select('vendor_id, verification_document_path')
  .not('verification_document_path', 'is', null);
if (error) { console.error(error.message); process.exit(1); }

let moved = 0, skipped = 0;
for (const row of rows) {
  const path = row.verification_document_path;
  if (/^https?:/i.test(path)) { console.log('skip (full URL, check by hand):', path); skipped++; continue; }

  const { error: copyErr } = await sb.storage.from('vendor-assets').copy(path, path, { destinationBucket: 'vendor-docs' });
  if (copyErr) { console.log('skip (not found or already moved):', path, '-', copyErr.message); skipped++; continue; }

  const { error: rmErr } = await sb.storage.from('vendor-assets').remove([path]);
  if (rmErr) console.log('copied but could not delete the public copy:', path, '-', rmErr.message);
  else { console.log('moved:', path); moved++; }
}
console.log(`Done. Moved ${moved}, skipped ${skipped}.`);

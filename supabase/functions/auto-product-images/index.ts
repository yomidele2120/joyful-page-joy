// Makes a picture for products that have none, for vendors an admin switched on (see 20261116080000_auto_product_images.sql).
// Server-to-server only: authenticate with the service-role key or x-ad-worker-secret (same secret as ad-process-jobs). Schedule it
// every 10 minutes. Platform pays for these pictures; the database enforces a daily cap.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { generateSquareArt, moderateImage, promptIsAllowed, ProviderError } from '../_shared/adAI.ts';
import { inspectImage } from '../_shared/adBannerCore.ts';
import { cloudinaryConfigured, uploadProductImage } from '../_shared/cloudinary.ts';
import { checkLink, productState } from '../_shared/imageCheck.ts';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length || a.length === 0) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0;
}
function authorized(req: Request): boolean {
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''; const secret = Deno.env.get('AD_WORKER_SECRET') ?? '';
  const bearer = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, ''); const header = req.headers.get('x-ad-worker-secret') ?? '';
  return (service.length > 0 && safeEqual(bearer, service)) || (secret.length >= 16 && safeEqual(header, secret));
}

// A neutral studio picture: the product TYPE, never a brand, logo or text, because an invented brand mark would be misleading.
function buildPrompt(p: { name: string; brand: string | null; category: string | null; description: string }): string {
  const what = [p.category, p.name].filter(Boolean).join(': ').slice(0, 160);
  return `Clean studio product photograph on a plain light background, soft even lighting, square composition. Subject: a generic, unbranded version of this product type: ${what}. ` +
    (p.description ? `Context from the seller: ${p.description.slice(0, 200)}. ` : '') +
    'Rules: no text, no letters, no numbers, no logos, no brand names, no watermarks, no people, no packaging with writing. Show the product type clearly and honestly.';
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!authorized(req)) return json({ error: 'Unauthorized' }, 401);
  if (!cloudinaryConfigured()) return json({ error: 'Cloudinary is not configured' }, 500);
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  let body: { max?: number } = {}; try { body = await req.json(); } catch { /* empty body is fine */ }
  // 0. find pictures that no longer load (only for switched-on vendors); a product whose pictures are ALL broken is queued below
  let checked = 0;
  try {
    const { data: toCheck } = await admin.rpc('claim_auto_image_checks', { _max: 15 });
    for (const c of (toCheck ?? []) as { product_id: string; urls: string[] }[]) {
      const state = productState(await Promise.all(c.urls.map((u) => checkLink(u))));
      await admin.rpc('record_auto_image_check', { _product: c.product_id, _urls: c.urls, _status: state });
      checked++;
    }
  } catch { /* checking is best effort; making pictures below still runs */ }
  const { data: jobs, error } = await admin.rpc('claim_auto_product_images', { _max: Math.min(Math.max(Number(body?.max) || 3, 1), 5) });
  if (error) return json({ error: 'claim_failed' }, 500);
  const started = Date.now(); const results: Record<string, unknown>[] = [];
  for (const j of (jobs ?? []) as any[]) {
    const id = String(j.product_id);
    if (Date.now() - started > 100_000) { await admin.rpc('fail_auto_product_image', { _product: id, _code: 'out_of_time', _retry: true }); results.push({ id, status: 'requeued' }); continue; }
    try {
      const prompt = buildPrompt(j);
      if (!(await promptIsAllowed(prompt))) { await admin.rpc('fail_auto_product_image', { _product: id, _code: 'prompt_blocked', _retry: false }); results.push({ id, status: 'blocked' }); continue; }
      const art = await generateSquareArt(prompt);
      if (!inspectImage(art.bytes).ok) throw new ProviderError('Unusable image', 'bad_image', true);
      const review = await moderateImage(art.base64, art.mime);
      if (!review.safe || review.contains_text || review.contains_logo) { await admin.rpc('fail_auto_product_image', { _product: id, _code: 'image_blocked', _retry: true }); results.push({ id, status: 'rejected' }); continue; }
      const up = await uploadProductImage(art.bytes, art.mime, String(j.vendor_id), `ai-${id}`);
      const { data: saved, error: saveError } = await admin.rpc('finish_auto_product_image', { _product: id, _url: up.url });
      if (saveError) throw new Error('save_failed');
      results.push({ id, status: saved ? 'done' : 'skipped_has_image' });
    } catch (e) {
      const code = e instanceof ProviderError ? e.code : 'unexpected';
      const retry = e instanceof ProviderError ? e.retryable : true;
      await admin.rpc('fail_auto_product_image', { _product: id, _code: code, _retry: retry });
      results.push({ id, status: 'failed', code });
    }
  }
  return json({ processed: results.length, checked, results });
});

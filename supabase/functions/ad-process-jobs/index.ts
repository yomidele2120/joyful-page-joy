// Banner-generation worker. Server-to-server only: it is called by verify-supplier-subscription / paystack-webhook
// right after a payment is verified, and by a schedule as a safety net. It is NOT callable with a user's login.
//
//   Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>     or     x-ad-worker-secret: <AD_WORKER_SECRET>
//
// For each queued job: build a text-free art prompt from real shop data -> generate artwork with OpenAI -> check the
// file really is a suitable image -> have a second model review it for safety, text and logos -> write headline and
// description (AI, validated; vetted templates as fallback) -> upload the artwork to Cloudinary -> record the result.
// The campaign is then activated or sent for admin approval by the database, according to the admin's setting.
// Nothing here runs while visitors browse the homepage.

import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  detectArtCategory, buildImagePrompt, pickVariant, isVariant, variantKey, inspectImage, moderationDecision, estimateCostUsd,
  type ProductForAd,
} from '../_shared/adBannerCore.ts';
import { generateBannerArt, generateCopy, moderateImage, ProviderError, textModel } from '../_shared/adAI.ts';
import { cloudinaryConfigured, uploadAdArtwork } from '../_shared/cloudinary.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length || a.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function authorized(req: Request): boolean {
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const secret = Deno.env.get('AD_WORKER_SECRET') ?? '';
  const bearer = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const header = req.headers.get('x-ad-worker-secret') ?? '';
  return (service.length > 0 && safeEqual(bearer, service)) || (secret.length >= 16 && safeEqual(header, secret));
}

async function sha256Hex(text: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

type Admin = ReturnType<typeof createClient>;

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!authorized(req)) return json({ error: 'Unauthorized' }, 401);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  let body: { max?: number } = {};
  try { body = await req.json(); } catch { /* an empty body is fine */ }
  const max = Math.min(Math.max(Number(body?.max) || 2, 1), 5);
  const started = Date.now();

  // Keep stored statuses in step with reality whenever the worker runs (public reads never depend on this).
  try { await admin.rpc('expire_advertising_campaigns'); } catch { /* non-fatal */ }

  const results: Record<string, unknown>[] = [];
  for (let i = 0; i < max; i++) {
    if (Date.now() - started > 90_000) break;   // stay well inside the function time limit
    const { data: job, error } = await admin.rpc('claim_advertising_job', { _worker: 'edge' });
    if (error) { results.push({ error: 'claim_failed' }); break; }
    if (!job) break;                            // queue empty, or an admin usage limit has been reached
    results.push(await processJob(admin, job as Record<string, any>));
  }
  return json({ processed: results.length, results });
});

async function processJob(admin: Admin, job: Record<string, any>): Promise<Record<string, unknown>> {
  const jobId = String(job.id);
  let imageCalled = false;
  let textCalls = 0;
  let visionCalls = 0;
  let imageCost = 0.04;

  const cost = () => estimateCostUsd(imageCalled ? imageCost : 0, textCalls, visionCalls);

  try {
    if (!Deno.env.get('OPENAI_API_KEY')) throw new ProviderError('OPENAI_API_KEY is not configured in Supabase Edge Function secrets.', 'not_configured', false);
    if (!cloudinaryConfigured()) throw new ProviderError('Cloudinary is not configured in Supabase Edge Function secrets.', 'not_configured', false);

    const { data: campaign } = await admin.from('vendor_advertising_campaigns')
      .select('id, vendor_id, campaign_type, status, end_date, custom_headline, custom_description, target_product_ids')
      .eq('id', job.campaign_id).maybeSingle();
    if (!campaign) throw new ProviderError('The campaign no longer exists.', 'campaign_missing', false);
    if (['expired', 'cancelled', 'rejected'].includes(campaign.status) || new Date(campaign.end_date) <= new Date()) {
      await admin.from('advertising_generation_jobs')
        .update({ status: 'cancelled', finished_at: new Date().toISOString(), locked_at: null, error: 'Campaign ended before the job ran.' })
        .eq('id', jobId);
      return { job: jobId, status: 'cancelled' };
    }

    const { data: vendor } = await admin.from('vendors')
      .select('store_name, store_description, business_type, product_categories').eq('id', campaign.vendor_id).maybeSingle();
    if (!vendor) throw new ProviderError('The vendor no longer exists.', 'vendor_missing', false);

    const { data: settings } = await admin.from('advertising_settings').select('ai_cost_per_image_usd').eq('id', true).maybeSingle();
    if (settings?.ai_cost_per_image_usd != null) imageCost = Number(settings.ai_cost_per_image_usd);

    // Real shop data: the products being promoted, or the shop's newest listed products.
    const productQuery = admin.from('products').select('name, category_id').eq('vendor_id', campaign.vendor_id).eq('is_active', true).eq('is_public', true);
    const { data: productRows } = campaign.campaign_type === 'product_promotion' && (campaign.target_product_ids ?? []).length
      ? await productQuery.in('id', campaign.target_product_ids).limit(8)
      : await productQuery.order('created_at', { ascending: false }).limit(8);
    const categoryIds = [...new Set((productRows ?? []).map((p: any) => p.category_id).filter(Boolean))];
    const categoryNames = new Map<string, string>();
    if (categoryIds.length) {
      const { data: cats } = await admin.from('categories').select('id, name').in('id', categoryIds);
      for (const c of cats ?? []) categoryNames.set(c.id, c.name);
    }
    const products: ProductForAd[] = (productRows ?? []).map((p: any) => ({ name: p.name, categoryName: categoryNames.get(p.category_id) ?? null }));

    const vendorForAd = {
      storeName: vendor.store_name, storeDescription: vendor.store_description,
      businessType: vendor.business_type, categories: vendor.product_categories ?? [],
    };
    const category = detectArtCategory(vendorForAd, products);
    // Only generic category names go into the picture prompt (never product or brand names, never the shop name).
    const subjects = [...new Set(products.map((p) => p.categoryName).filter((n): n is string => !!n))].slice(0, 3);
    const vendorMessage = [campaign.custom_headline, campaign.custom_description].filter(Boolean).join('. ') || vendor.store_description || null;
    // A different look every time: avoid the looks of the newest banners in this category (best effort; no failure if the lookup fails).
    const { data: recentRows } = await admin.from('vendor_advertising_banners').select('generation_metadata')
      .eq('art_category', category).order('created_at', { ascending: false }).limit(12);
    const recent = (recentRows ?? []).map((r: any) => r?.generation_metadata?.variant).filter(isVariant);
    const variant = pickVariant(category, `${jobId}:${job.attempts ?? 0}:${crypto.randomUUID()}`, recent);
    const prompt = buildImagePrompt({ category, vendorHint: vendorMessage, subjects, variant });
    const promptHash = await sha256Hex(prompt);

    // 1. artwork
    const art = await generateBannerArt(prompt);
    imageCalled = true;

    // 2. is it really a usable image?
    const info = inspectImage(art.bytes);
    if (!info.ok || !info.mime) throw new ProviderError(`Generated image rejected: ${info.reason ?? 'invalid'}.`, 'invalid_image', true);

    // 3. safety review (throws if the review cannot run, so nothing unreviewed is ever published)
    visionCalls++;
    const review = await moderateImage(art.base64, info.mime);
    const decision = moderationDecision(review);
    if (!decision.pass) throw new ProviderError(`Image failed review: ${decision.flags.join(', ')}.`, 'moderation_rejected', true);

    // 4. wording (AI, validated; vetted template fallback)
    textCalls++;
    const copy = await generateCopy(vendorForAd, category, vendorMessage, String(campaign.vendor_id));

    // 5. store the artwork
    const uploaded = await uploadAdArtwork(art.bytes, info.mime, campaign.vendor_id, campaign.id, jobId.slice(0, 8));

    // 6. record it; the database decides between going live and waiting for admin approval
    const { error: finishError } = await admin.rpc('finish_advertising_job_success', {
      _job: jobId, _image_url: uploaded.url, _public_id: uploaded.publicId, _width: info.width, _height: info.height,
      _headline: copy.copy.headline, _description: copy.copy.description, _art_category: category,
      _provider: 'openai', _model: art.model, _prompt_hash: promptHash,
      _meta: {
        image_model: art.model, text_model: copy.model ?? textModel(), copy_source: copy.source, copy_note: copy.note ?? null,
        attempt: job.attempts, kind: job.kind, subjects, image_bytes: info.bytes, image_size: `${info.width}x${info.height}`,
        aspect_requested: '21:9', variant, variant_key: variantKey(variant), moderation: review, estimated_cost_is_estimate: true,
      },
      _cost: cost(),
      _flags: copy.source === 'template' ? ['template_copy'] : [],
    });
    if (finishError) throw new Error(`Recording the banner failed: ${finishError.message}`);
    return { job: jobId, status: 'succeeded', category, copy_source: copy.source };
  } catch (e) {
    const known = e instanceof ProviderError ? e : null;
    const message = (e instanceof Error ? e.message : 'Unknown error').slice(0, 300);
    const { data: outcome } = await admin.rpc('finish_advertising_job_failure', {
      _job: jobId, _error: message, _code: known?.code ?? 'internal_error', _retryable: known ? known.retryable : true, _cost: cost(),
    });
    return { job: jobId, status: outcome ?? 'failed', code: known?.code ?? 'internal_error' };
  }
}

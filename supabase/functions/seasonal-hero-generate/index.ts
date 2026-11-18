// Monthly seasonal hero banners. Paints five text-free pictures with the AI (three slider slides, two side tiles), checks each
// one with the safety review, stores them in Cloudinary and publishes them as hero flyers. The words on the banners come from
// the fixed list in _shared/seasonalHeroCore.ts and are drawn by the website; the AI never writes them.
//
// One call paints at most `max` pictures (default 1) so it stays inside the platform's time limit; the run remembers what is
// finished, so repeated calls (the schedule, or the admin button) complete the set. When all five are done they are published
// in one step. Calls: the service-role key, the AD_WORKER_SECRET header (schedule), or a signed-in admin (the button).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { inspectImage, isVariant, moderationDecision, pickVariant, variantKey, type Variant } from '../_shared/adBannerCore.ts';
import { generateBannerArt, moderateImage, ProviderError, withAiContext, setAiContext } from '../_shared/adAI.ts';
import { cloudinaryConfigured, uploadSeasonalArt } from '../_shared/cloudinary.ts';
import { allCopySafe, buildSeasonalPrompt, croppedUrl, heroSlots, isSeasonKey, seasonKey, type HeroSlot } from '../_shared/seasonalHeroCore.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-ad-worker-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const MAX_FAILURES = 12;

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length || a.length === 0) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function caller(req: Request): Promise<{ ok: boolean; admin: boolean; userId: string | null }> {
  const bearer = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const secret = Deno.env.get('AD_WORKER_SECRET') ?? '';
  const header = req.headers.get('x-ad-worker-secret') ?? '';
  if ((service && safeEqual(bearer, service)) || (secret.length >= 16 && safeEqual(header, secret))) return { ok: true, admin: false, userId: null };
  if (!bearer) return { ok: false, admin: false, userId: null };
  const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: `Bearer ${bearer}` } } });
  const { data: claims } = await userClient.auth.getClaims(bearer);
  const userId = claims?.claims?.sub;
  if (!userId) return { ok: false, admin: false, userId: null };
  const { data: isAdmin } = await userClient.rpc('has_role', { _user_id: userId, _role: 'admin' });
  return { ok: !!isAdmin, admin: !!isAdmin, userId: String(userId) };
}

Deno.serve((req: Request) => withAiContext({ feature: 'seasonal_hero' }, () => handle(req)));

async function handle(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return reply({ error: 'Method not allowed' }, 405);
  const who = await caller(req);
  if (!who.ok) return reply({ error: 'Unauthorized' }, 401);
  setAiContext({ userId: who.userId });

  const body = await req.json().catch(() => ({})) as { season?: string; force?: boolean; max?: number };
  const season = body.season ?? seasonKey(new Date());
  if (!isSeasonKey(season)) return reply({ error: 'Bad season. Use YYYY-MM.' }, 400);
  const force = who.admin && body.force === true;           // only a signed-in admin can redo a finished month
  const max = Math.min(2, Math.max(1, Math.floor(Number(body.max) || 1)));

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data: begun, error: beginError } = await admin.rpc('seasonal_hero_begin', { _season: season, _force: force });
  if (beginError) return reply({ error: 'Could not start the run.', detail: beginError.message.slice(0, 200) }, 500);
  if (begun?.status !== 'started') return reply({ status: begun?.status ?? 'unknown', season, error: begun?.error ?? undefined });

  const run: string = begun.run;
  const done: any[] = Array.isArray(begun.done) ? begun.done : [];
  const slots = heroSlots(season);
  const pending = slots.filter((s) => !done.some((d) => d.slot === s.slot)).slice(0, max);

  if (pending.length) {
    // Set-up problems stop the run at once, with a clear message, instead of burning attempts.
    if (!Deno.env.get('OPENAI_API_KEY')) return fail(admin, run, 'OPENAI_API_KEY is not configured in Supabase Edge Function secrets.');
    if (!cloudinaryConfigured()) return fail(admin, run, 'Cloudinary secrets are not configured in Supabase Edge Function secrets.');

    // Looks used by last months' banners and by this month's finished ones, so no two banners look alike.
    const { data: lastRuns } = await admin.from('seasonal_hero_runs').select('slots').neq('season_key', season).order('season_key', { ascending: false }).limit(2);
    const history: Variant[] = [...done, ...(lastRuns ?? []).flatMap((r: any) => r.slots ?? [])].map((d: any) => d?.variant).filter(isVariant).reverse();
    const chosen: Variant[] = [];
    const plan = pending.map((slot) => { const v = pickVariant('general', `${season}:${slot.slot}:${crypto.randomUUID()}`, [...chosen, ...history]); chosen.unshift(v); return { slot, v }; });

    const { data: settings } = await admin.from('advertising_settings').select('ai_cost_per_image_usd').eq('id', true).maybeSingle();
    const imageCost = settings?.ai_cost_per_image_usd != null ? Number(settings.ai_cost_per_image_usd) : 0.1;

    const results = await Promise.allSettled(plan.map(({ slot, v }) => paint(admin, run, season, slot, v, imageCost)));
    let failures = 0; let lastError = '';
    results.forEach((r) => { if (r.status === 'rejected') { failures++; lastError = r.reason instanceof Error ? r.reason.message : String(r.reason); } });
    if (failures) {
      const quota = results.some((r) => r.status === 'rejected' && r.reason instanceof ProviderError && !r.reason.retryable);
      let total = 0;
      for (let i = 0; i < failures; i++) total = (await admin.rpc('seasonal_hero_note_failure', { _run: run, _error: lastError, _cost: 0 })).data ?? total;
      if (quota || total >= MAX_FAILURES) return fail(admin, run, lastError || 'Too many failed attempts.');
    }
  }

  // Everything painted? Then publish.
  const { data: after } = await admin.from('seasonal_hero_runs').select('slots, failures, error').eq('id', run).maybeSingle();
  const finished: any[] = after?.slots ?? [];
  if (finished.length < slots.length) return reply({ status: 'progress', season, done: finished.length, total: slots.length, failures: after?.failures ?? 0, last_error: after?.error ?? null });

  const copy = allCopySafe();
  if (!copy.ok) return fail(admin, run, 'The fixed banner wording failed the safety rules.');
  const items = slots.map((s) => {
    const f = finished.find((d) => d.slot === s.slot);
    return { slot: s.slot, placement: s.placement, title: s.title, image_url: croppedUrl(f.url, s.ratio, s.width),
             headline: s.copy.h, subline: s.copy.s, cta_label: s.copy.c, link_url: s.link, sort_order: s.sortOrder };
  });
  const { data: published, error: publishError } = await admin.rpc('seasonal_hero_publish', { _run: run, _season: season, _items: items });
  if (publishError) return fail(admin, run, `Publishing failed: ${publishError.message}`);
  return reply({ status: 'published', season, published: !!published?.published, total: slots.length });
}

async function paint(admin: any, run: string, season: string, slot: HeroSlot, variant: Variant, imageCost: number) {
  const art = await generateBannerArt(buildSeasonalPrompt(slot, variant));
  const info = inspectImage(art.bytes);
  if (!info.ok || !info.mime) throw new ProviderError(`Generated image rejected: ${info.reason ?? 'invalid'}.`, 'invalid_image', true);
  const review = await moderateImage(art.base64, info.mime);          // throws if the review cannot run: nothing unchecked is ever kept
  const decision = moderationDecision(review);
  if (!decision.pass) throw new ProviderError(`Image failed review: ${decision.flags.join(', ')}.`, 'moderation_rejected', true);
  const up = await uploadSeasonalArt(art.bytes, info.mime, season, slot.slot);
  const { error } = await admin.rpc('seasonal_hero_save_slot', {
    _run: run, _cost: imageCost,
    _slot: { slot: slot.slot, url: up.url, public_id: up.publicId, variant, variant_key: variantKey(variant), model: art.model },
  });
  if (error) throw new Error(`Saving the picture failed: ${error.message}`);
}

async function fail(admin: any, run: string, message: string) {
  await admin.rpc('seasonal_hero_fail', { _run: run, _error: message });
  return reply({ status: 'failed', error: message.slice(0, 300) });
}

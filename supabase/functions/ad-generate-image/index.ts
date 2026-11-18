// Vendor-triggered AI ad image. The vendor's own login is required.
//   1. vendor_start_ai_image (database): checks plan, limits and balance and DEDUCTS the price in one locked step.
//   2. check the description, generate the image with OpenAI, have the safety reviewer look at it, save it privately.
//   3. any failure at all -> the database refunds the price once. A crash is covered by refund_stuck_ai_images().
// OPENAI_API_KEY stays in this server code; the browser never sees it.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { generateSquareArt, moderateImage, promptIsAllowed, ProviderError, withAiContext, setAiContext } from '../_shared/adAI.ts';
import { inspectImage, SQUARE_IMAGE } from '../_shared/adBannerCore.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// The vendor's words are wrapped in fixed rules so the picture is a clean, text-free, brand-free product or lifestyle image.
const wrap = (p: string) =>
  `Photorealistic advertising photograph, square composition, clean and well lit. Subject described by the shop owner: "${p}". ` +
  'Rules: no text, no letters, no numbers, no logos, no watermarks, no brand names, no real or famous people, no recognisable celebrities, ' +
  'no sale stickers or price tags. Show the subject honestly and attractively.';

Deno.serve((req: Request) => withAiContext({ feature: 'ad_ai_image' }, () => handle(req)));

async function handle(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return reply({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return reply({ error: 'Please sign in again.' }, 401);
  const url = Deno.env.get('SUPABASE_URL')!;
  const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
  const { data: claims, error: claimsError } = await userClient.auth.getClaims(authHeader.replace(/^Bearer\s+/i, ''));
  if (claimsError || !claims?.claims?.sub) return reply({ error: 'Please sign in again.' }, 401);
  setAiContext({ userId: String(claims.claims.sub) });

  const body = await req.json().catch(() => ({}));
  const prompt = typeof body?.prompt === 'string' ? body.prompt : '';

  // 1. charge (this also enforces plan, limits and balance)
  const { data: started, error: startError } = await userClient.rpc('vendor_start_ai_image', { _prompt: prompt });
  if (startError || !started?.id) return reply({ error: startError?.message || 'Could not start.' }, 400);
  const id = String(started.id);

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const fail = async (code: string, message: string, status = 502) => {
    await admin.rpc('finish_ai_image_failure', { _id: id, _code: code });
    return reply({ error: message, refunded: true }, status);
  };

  try {
    // 2a. the description itself
    if (!(await promptIsAllowed(prompt))) return await fail('prompt_blocked', 'That description cannot be used. The charge was refunded.', 422);
    // 2b. make the image, check it is a real image, and have it reviewed (an AI-made face is allowed; text, logos and unsafe content are not)
    const art = await generateSquareArt(wrap(prompt.trim()));
    const info = inspectImage(art.bytes, SQUARE_IMAGE);
    if (!info.ok) return await fail('bad_image', 'The image was not usable. The charge was refunded.');
    const review = await moderateImage(art.base64, art.mime);
    if (!review.safe || review.contains_text || review.contains_logo) {
      return await fail('image_blocked', 'The image did not pass the safety review, so it was not kept. The charge was refunded. Try describing it differently.', 422);
    }
    // 2c. save privately in the vendor's own folder
    const { data: v } = await admin.from('ad_ai_images').select('vendor_id').eq('id', id).maybeSingle();
    if (!v) return await fail('missing_job', 'Something went wrong. The charge was refunded.');
    const path = `${v.vendor_id}/ai-${crypto.randomUUID()}.jpg`;
    const up = await admin.storage.from('ad-creatives').upload(path, art.bytes, { contentType: 'image/jpeg', upsert: false });
    if (up.error) return await fail('storage_failed', 'The image could not be saved. The charge was refunded.');
    const { data: ok, error: finishError } = await admin.rpc('finish_ai_image_success', { _id: id, _path: path });
    if (finishError || !ok) {
      await admin.storage.from('ad-creatives').remove([path]);
      return await fail('finish_failed', 'Something went wrong. The charge was refunded.');
    }
    return reply({ ok: true, id, path, size: art.bytes.length, balance_kobo: started.balance_kobo });
  } catch (e) {
    const code = e instanceof ProviderError ? e.code : 'unexpected';
    return await fail(code, 'The image service had a problem. The charge was refunded. Please try again.');
  }
}

// AI product assistant. Browser -> this function (with the user's login) -> OpenAI. The key never reaches the browser.
//   { action: 'listing', product: {name, description, categoryName, attributes, tags}, vendorProductNames?: string[] }
//   { action: 'search', text: 'red running shoes under 20000' }
// An admin must switch the feature on (ai_feature_settings) and per-user daily limits apply (ai_assist_settings).
// Results are only suggestions: nothing is saved to a product here.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { askText, ProviderError } from '../_shared/adAI.ts';
import { buildListingPrompt, buildSearchPrompt, findDuplicates, parseListing, parseSearch } from '../_shared/aiProductCore.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return reply({ error: 'Method not allowed' }, 405);
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return reply({ error: 'Please sign in.' }, 401);
  const url = Deno.env.get('SUPABASE_URL')!;
  const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
  const { data: claims, error: claimsError } = await userClient.auth.getClaims(authHeader.replace(/^Bearer\s+/i, ''));
  const userId = claims?.claims?.sub;
  if (claimsError || !userId) return reply({ error: 'Please sign in.' }, 401);

  const body = await req.json().catch(() => ({}));
  const action = body?.action;
  if (action !== 'listing' && action !== 'search') return reply({ error: 'Unknown action' }, 400);
  if (!Deno.env.get('OPENAI_API_KEY')) return reply({ error: 'The AI service is not configured yet.' }, 503);

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data: logId, error: gateError } = await admin.rpc('ai_assist_begin', { _user: userId, _feature: action });
  if (gateError) return reply({ error: gateError.message.slice(0, 200) }, 429);

  const finish = (status: string, model: string | null, note: string | null) =>
    admin.rpc('ai_assist_finish', { _id: logId, _status: status, _model: model ?? '', _note: note ?? '' });

  try {
    const { data: catRows } = await admin.from('categories').select('name').limit(300);
    const categories = (catRows ?? []).map((c: any) => String(c.name));

    if (action === 'listing') {
      const p = body.product ?? {};
      if (typeof p.name !== 'string' || p.name.trim().length < 2) { await finish('blocked', null, 'no name'); return reply({ error: 'Enter a product name first.' }, 400); }
      const draft = { name: p.name, description: typeof p.description === 'string' ? p.description : null, categoryName: typeof p.categoryName === 'string' ? p.categoryName : null,
        attributes: p.attributes && typeof p.attributes === 'object' ? Object.fromEntries(Object.entries(p.attributes).slice(0, 12).map(([k, v]) => [k, String(v)])) : null,
        tags: Array.isArray(p.tags) ? p.tags.map(String) : null };
      const { system, user } = buildListingPrompt(draft, categories);
      const { text, model } = await askText(system, user, 900);
      const parsed = parseListing(text, draft, categories);
      if (!parsed.ok) { await finish('failed', model, 'unusable answer'); return reply({ error: 'The assistant could not produce a safe suggestion. Try adding more detail.' }, 422); }
      // Duplicate check against this vendor's own listings (names come from the database, not from the browser).
      const { data: vendor } = await admin.from('vendors').select('id').eq('user_id', userId).maybeSingle();
      const { data: mine } = vendor ? await admin.from('products').select('id, name').eq('vendor_id', vendor.id).limit(500) : { data: [] };
      const duplicates = findDuplicates(draft.name, (mine ?? []).filter((m: any) => m.id !== body.productId));
      await finish('succeeded', model, parsed.dropped.length ? `dropped: ${parsed.dropped.join(',')}`.slice(0, 300) : null);
      return reply({ suggestion: parsed.listing, dropped: parsed.dropped, duplicates, note: 'Suggestions only. Check every detail before saving.' });
    }

    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (text.length < 2) { await finish('blocked', null, 'empty'); return reply({ error: 'Type what you are looking for.' }, 400); }
    const { system, user } = buildSearchPrompt(text, categories);
    const { text: out, model } = await askText(system, user, 300);
    await finish('succeeded', model, null);
    return reply({ filters: parseSearch(out, text, categories) });
  } catch (e) {
    const known = e instanceof ProviderError ? e : null;
    await finish('failed', null, known?.code ?? 'internal_error');
    const quota = known?.code === 'provider_quota';
    return reply({ error: quota ? 'The AI service is temporarily unavailable.' : 'The assistant could not answer right now. Please try again.' }, 502);
  }
});

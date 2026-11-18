import { AsyncLocalStorage } from 'node:async_hooks';
// Server-side OpenAI calls for advertising banners (Deno edge functions only).
// The key is read from the OPENAI_API_KEY secret here and nowhere else. It is sent only in the Authorization header
// to api.openai.com, is never returned to a browser, and is never placed in an error message, database row or log line.
//
// Env (all optional except OPENAI_API_KEY):
//   AD_IMAGE_MODEL      image model id, or a comma-separated list tried in order when a model is "not found"
//                       (default: gpt-image-2, gpt-image-1.5). gpt-image-1 was shut down by OpenAI on 2026-10-23.
//   AD_IMAGE_QUALITY    low | medium | high   (default medium)
//   AD_TEXT_MODEL       model for banner wording (default gpt-6-luna)
//   AD_MODERATION_MODEL model for the image safety review; must accept image input (default = AD_TEXT_MODEL)
// Model names change. Check OpenAI's current model list and set these if a default stops working.

import {
  buildCopyPrompt, classifyProviderStatus, MODERATION_PROMPT, parseCopyResponse, parseModerationResponse, templateCopy,
  type ArtCategory, type Copy, type ModerationResult, type VendorForAd,
} from './adBannerCore.ts';

export class ProviderError extends Error {
  code: string;
  retryable: boolean;
  constructor(message: string, code: string, retryable: boolean) {
    super(message);
    this.code = code;
    this.retryable = retryable;
  }
}

const API = 'https://api.openai.com/v1';

// ---- Cost ledger -----------------------------------------------------------------------------------------------
// Every request to OpenAI is booked in ai_cost_ledger (database function record_ai_usage). The database works out the
// cost and the 2x service charge; this file only reports what happened. Booking can never break the AI feature itself.
export interface AiContext { feature?: string; userId?: string | null; vendorId?: string | null }
const als = new AsyncLocalStorage<AiContext>();
/** Runs a request handler with its own context object, so concurrent requests never mix up who asked. */
export const withAiContext = <T>(init: AiContext, fn: () => Promise<T>): Promise<T> => als.run({ ...init }, fn);
/** Fills in who/what is behind the AI calls that follow (user and vendor are known only after sign-in or a lookup). */
export const setAiContext = (patch: AiContext) => { const c = als.getStore(); if (c) Object.assign(c, patch); };

const SERVICE_BY_PATH: Record<string, string> = { '/images/generations': 'image_generation', '/moderations': 'prompt_moderation', '/responses': 'text_generation' };

async function bookUsage(key: string, service: string, model: string | null, status: 'succeeded' | 'failed', data: any) {
  const url = Deno.env.get('SUPABASE_URL'); const svc = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !svc) return;
  const c = als.getStore() ?? {};
  const body = JSON.stringify({
    _key: key, _service: service, _feature: c.feature ?? null, _model: model, _status: status,
    _user: c.userId ?? null, _vendor: c.vendorId ?? null,
    _input_tokens: Number.isFinite(data?.usage?.input_tokens) ? data.usage.input_tokens : null,
    _output_tokens: Number.isFinite(data?.usage?.output_tokens) ? data.usage.output_tokens : null,
    _images: service === 'image_generation' && Array.isArray(data?.data) ? data.data.length : 0,
  });
  for (let attempt = 0; attempt < 2; attempt++) {     // same key on the retry, so a repeat can never double-book
    try {
      const res = await fetch(`${url}/rest/v1/rpc/record_ai_usage`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', apikey: svc, Authorization: `Bearer ${svc}` }, body, signal: AbortSignal.timeout(8000),
      });
      if (res.ok) return;
    } catch { /* try once more */ }
  }
  console.error('ai ledger: could not record request', key.slice(0, 12));
}
const DEFAULT_IMAGE_MODELS = ['gpt-image-2', 'gpt-image-1.5'];
const DEFAULT_TEXT_MODEL = 'gpt-6-luna';
const MODEL_PATTERN = /^[a-zA-Z0-9._-]+$/;

function apiKey(): string {
  const k = Deno.env.get('OPENAI_API_KEY');
  if (!k) throw new ProviderError('OPENAI_API_KEY is not configured in Supabase Edge Function secrets.', 'not_configured', false);
  return k;
}

export function imageModels(): string[] {
  const configured = (Deno.env.get('AD_IMAGE_MODEL') ?? '').split(',').map((m) => m.trim()).filter(Boolean);
  const list = configured.length ? configured : DEFAULT_IMAGE_MODELS;
  for (const m of list) if (!MODEL_PATTERN.test(m)) throw new ProviderError('AD_IMAGE_MODEL contains unsupported characters.', 'not_configured', false);
  return list;
}
export function textModel(): string {
  const m = Deno.env.get('AD_TEXT_MODEL') ?? DEFAULT_TEXT_MODEL;
  if (!MODEL_PATTERN.test(m)) throw new ProviderError('AD_TEXT_MODEL contains unsupported characters.', 'not_configured', false);
  return m;
}
function moderationModel(): string {
  const m = Deno.env.get('AD_MODERATION_MODEL') ?? textModel();
  if (!MODEL_PATTERN.test(m)) throw new ProviderError('AD_MODERATION_MODEL contains unsupported characters.', 'not_configured', false);
  return m;
}
function imageQuality(): string {
  const q = (Deno.env.get('AD_IMAGE_QUALITY') ?? 'medium').toLowerCase();
  return ['low', 'medium', 'high'].includes(q) ? q : 'medium';
}

/** Removes anything that looks like an API key from text before it is stored or logged. */
function scrub(text: string): string {
  return text.replace(/sk-[A-Za-z0-9_-]{16,}/g, '[hidden]').replace(/Bearer\s+\S+/gi, 'Bearer [hidden]').slice(0, 300);
}

async function post(path: string, body: unknown, timeoutMs: number, service?: string): Promise<any> {
  const svc = service ?? SERVICE_BY_PATH[path] ?? 'text_generation';
  const model = typeof (body as any)?.model === 'string' ? (body as any).model : null;
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey()}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    if (e instanceof ProviderError) throw e;
    // Deliberately no error text from the network error itself.
    await bookUsage(`net_${crypto.randomUUID()}`, svc, model, 'failed', null);
    throw new ProviderError('The request to the AI provider failed or timed out.', 'provider_network', true);
  }
  const requestId = res.headers.get('x-request-id') || `gen_${crypto.randomUUID()}`;
  if (!res.ok) {
    await bookUsage(requestId, svc, model, 'failed', null);
    const kind = classifyProviderStatus(res.status);
    let detail = ''; let providerCode = '';
    try {
      const j = await res.json();
      detail = scrub(String(j?.error?.message ?? ''));
      providerCode = String(j?.error?.code ?? '');
    } catch { /* ignore */ }
    // A request OpenAI's own safety system refused is worth a fresh attempt; a billing/quota stop is not.
    if (providerCode === 'insufficient_quota' || providerCode === 'billing_hard_limit_reached') {
      throw new ProviderError(`OpenAI account has no remaining quota${detail ? `: ${detail}` : ''}`, 'provider_quota', false);
    }
    if (providerCode === 'moderation_blocked') {
      throw new ProviderError('OpenAI blocked the request with its own safety system.', 'provider_blocked', true);
    }
    throw new ProviderError(`AI provider returned HTTP ${res.status}${detail ? `: ${detail}` : ''}`, kind.code, kind.retryable);
  }
  const out = await res.json();
  await bookUsage(requestId, svc, model, 'succeeded', out);
  return out;
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Text from a Responses API reply. */
function outputText(data: any): string {
  if (typeof data?.output_text === 'string') return data.output_text;
  return (data?.output ?? []).flatMap((o: any) => o?.content ?? []).map((c: any) => (typeof c?.text === 'string' ? c.text : '')).join('');
}

export interface GeneratedArt { bytes: Uint8Array; base64: string; mime: string; model: string }

// Newer models accept custom wide sizes (about 21:9); older ones only the standard sizes. We always crop with
// Cloudinary afterwards, so 3:2 is an acceptable fallback.
const WIDE = '2016x864';
const STANDARD = '1536x1024';
const supportsCustomSize = (model: string) => /^gpt-image-(2|3)/.test(model);

/** Generates text-free banner artwork as a JPEG. */
export async function generateBannerArt(prompt: string): Promise<GeneratedArt> {
  let lastError: ProviderError | null = null;
  for (const model of imageModels()) {
    const sizes = supportsCustomSize(model) ? [WIDE, STANDARD] : [STANDARD];
    try {
      let data: any; let used = '';
      for (let i = 0; i < sizes.length; i++) {
        try {
          data = await post('/images/generations', {
            model, prompt, n: 1, size: sizes[i], quality: imageQuality(), output_format: 'jpeg', output_compression: 90,
          }, 120_000);
          used = sizes[i];
          break;
        } catch (e) {
          // A size the model refuses: try the next size. Anything else is handled below.
          if (e instanceof ProviderError && e.code === 'provider_rejected_request' && i < sizes.length - 1) continue;
          throw e;
        }
      }
      const b64 = data?.data?.[0]?.b64_json;
      if (typeof b64 !== 'string' || !b64) throw new ProviderError('The AI provider returned no image.', 'provider_no_image', true);
      return { bytes: base64ToBytes(b64), base64: b64, mime: 'image/jpeg', model: `${model}@${used}` };
    } catch (e) {
      if (e instanceof ProviderError && e.code === 'provider_model_not_found') { lastError = e; continue; }   // try the next model
      throw e;
    }
  }
  throw lastError ?? new ProviderError('No image model is available. Set AD_IMAGE_MODEL.', 'provider_model_not_found', false);
}

/** AI-written headline + description. Anything invalid or unsafe falls back to vetted template copy; this never fails the job. */
export async function generateCopy(
  vendor: VendorForAd, category: ArtCategory, vendorMessage: string | null, seed: string,
): Promise<{ copy: Copy; source: 'ai' | 'template'; model: string | null; note?: string }> {
  const model = textModel();
  try {
    const { system, user } = buildCopyPrompt(vendor, category, vendorMessage);
    const data = await post('/responses', { model, instructions: system, input: user, max_output_tokens: 400 }, 30_000);
    const checked = parseCopyResponse(outputText(data));
    if (checked.ok && checked.copy) return { copy: checked.copy, source: 'ai', model };
    return { copy: templateCopy(category, seed), source: 'template', model, note: checked.reasons.join('; ') };
  } catch (e) {
    return { copy: templateCopy(category, seed), source: 'template', model, note: e instanceof ProviderError ? e.code : 'copy_error' };
  }
}

/**
 * Safety review of a generated image. If the review itself cannot run or cannot be understood this THROWS (retryable),
 * so an image that was never checked is never published.
 */
export async function moderateImage(base64: string, mime: string): Promise<ModerationResult> {
  const data = await post('/responses', {
    model: moderationModel(),
    instructions: MODERATION_PROMPT,
    input: [{ role: 'user', content: [
      { type: 'input_text', text: 'Review this advertising image.' },
      { type: 'input_image', image_url: `data:${mime};base64,${base64}` },
    ] }],
    max_output_tokens: 400,
  }, 60_000, 'image_review');
  const parsed = parseModerationResponse(outputText(data));
  if (!parsed) throw new ProviderError('The image safety review returned an unreadable answer.', 'moderation_unavailable', true);
  return parsed;
}

/** Plain text answer from the text model (used by the product assistant). Throws ProviderError on failure. */
export async function askText(system: string, user: string, maxTokens = 900): Promise<{ text: string; model: string }> {
  const model = textModel();
  const data = await post('/responses', { model, instructions: system, input: user, max_output_tokens: maxTokens }, 40_000);
  return { text: outputText(data), model };
}

/** Square ad image from a vendor's own description. Same models, key and safety rules as the banner artwork. */
export async function generateSquareArt(prompt: string): Promise<GeneratedArt> {
  let lastError: ProviderError | null = null;
  for (const model of imageModels()) {
    try {
      const data = await post('/images/generations', {
        model, prompt, n: 1, size: '1024x1024', quality: imageQuality(), output_format: 'jpeg', output_compression: 90,
      }, 120_000);
      const b64 = data?.data?.[0]?.b64_json;
      if (typeof b64 !== 'string' || !b64) throw new ProviderError('The AI provider returned no image.', 'provider_no_image', true);
      return { bytes: base64ToBytes(b64), base64: b64, mime: 'image/jpeg', model: `${model}@1024x1024` };
    } catch (e) {
      if (e instanceof ProviderError && e.code === 'provider_model_not_found') { lastError = e; continue; }
      throw e;
    }
  }
  throw lastError ?? new ProviderError('No image model is available. Set AD_IMAGE_MODEL.', 'provider_model_not_found', false);
}

/** Checks a vendor's description with OpenAI's moderation endpoint BEFORE any image is made. Throws if it cannot run (fail closed). */
export async function promptIsAllowed(text: string): Promise<boolean> {
  const data = await post('/moderations', { model: 'omni-moderation-latest', input: text }, 20_000);
  const r = data?.results?.[0];
  if (!r || typeof r.flagged !== 'boolean') throw new ProviderError('The prompt safety check returned an unreadable answer.', 'moderation_unavailable', true);
  return !r.flagged;
}

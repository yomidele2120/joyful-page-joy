// POST /api/cloudinary   { action: 'sign', vendor_id, count }  ->  { slots: [...] }
//                        { action: 'delete', urls: [...] }     ->  { deleted, skipped }
//                        { action: 'mirror', urls: [...] }     ->  { results: [{ url, mirrored }] }  copies borrowed https images into Cloudinary
// Self-contained on purpose (no relative imports, no SDK): only node:crypto and fetch, so it cannot fail to resolve on Vercel.
// Secrets come from Vercel env vars CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET and never leave the server.
import { createHash, randomBytes } from 'node:crypto';

interface Req { method?: string; body?: unknown; headers: Record<string, string | string[] | undefined> }
interface Res { status(code: number): Res; setHeader(name: string, value: string): Res; json(body: unknown): void }

const ROOT = 'marketplace/vendors';
const FORMATS = 'jpg,jpeg,png,webp,gif,avif';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
const sha1 = (s: string) => createHash('sha1').update(s).digest('hex');

// ---- config -------------------------------------------------------------------------------------------------------
const cld = () => {
  const name = (process.env.CLOUDINARY_CLOUD_NAME || '').trim();
  const key = (process.env.CLOUDINARY_API_KEY || '').trim();
  const secret = (process.env.CLOUDINARY_API_SECRET || '').trim();
  return name && key && secret ? { name, key, secret } : null;
};
const sbBase = () => (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim().replace(/\/$/, '');
const sbAnon = () => (process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '').trim();

// ---- Supabase: who is calling? (uses the caller's own token, so Row Level Security applies) ----------------------------
const sb = (path: string, token: string, init: RequestInit = {}) =>
  fetch(`${sbBase()}${path}`, {
    ...init, signal: AbortSignal.timeout(6000),
    headers: { apikey: sbAnon(), Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers as object) },
  });

interface Caller { userId: string; token: string; vendorId: string | null; isAdmin: boolean }
async function authenticate(req: Req): Promise<Caller | null> {
  const token = one(req.headers.authorization).replace(/^Bearer\s+/i, '');
  if (!token || !sbBase() || !sbAnon()) return null;
  try {
    const u = await sb('/auth/v1/user', token);
    if (!u.ok) return null;
    const user = (await u.json()) as { id?: string };
    if (!isUuid(user.id)) return null;
    const [v, a] = await Promise.all([
      sb(`/rest/v1/vendors?user_id=eq.${user.id}&select=id&limit=1`, token),
      sb('/rest/v1/rpc/has_role', token, { method: 'POST', body: JSON.stringify({ _user_id: user.id, _role: 'admin' }) }).catch(() => null),
    ]);
    const vendors = v.ok ? ((await v.json()) as { id: string }[]) : [];
    const isAdmin = a && a.ok ? (await a.json()) === true : false;
    return { userId: user.id, token, vendorId: vendors[0]?.id ?? null, isAdmin };
  } catch { return null; }
}

// ---- best-effort rate limit (per server instance) ------------------------------------------------------------------------
const hits = new Map<string, number[]>();
function rateLimited(key: string, max: number): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter(t => now - t < 60_000);
  recent.push(now); hits.set(key, recent);
  return recent.length > max;
}

// ---- Cloudinary URL parsing (same rules as src/lib/cloudinaryUrl.ts) -------------------------------------------------------
const TRANSFORM = /^[a-z]{1,4}_[^/,]+(,[a-z]{1,4}_[^/,]+)*$/i;
function ownPublicId(url: string, cloudName: string): string | null {
  let u: URL; try { u = new URL(url); } catch { return null; }
  if (u.protocol !== 'https:' || u.hostname !== 'res.cloudinary.com') return null;
  const parts = u.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  if (parts.length < 4 || parts[0] !== cloudName || parts[1] !== 'image' || parts[2] !== 'upload') return null;
  let rest = parts.slice(3);
  while (rest.length > 1 && TRANSFORM.test(rest[0])) rest = rest.slice(1);
  if (rest.length > 1 && /^v\d+$/.test(rest[0])) rest = rest.slice(1);
  rest[rest.length - 1] = rest[rest.length - 1].replace(/\.[a-z0-9]{2,5}$/i, '');
  const id = rest.join('/');
  return id.startsWith(`${ROOT}/`) ? id : null;
}

// ---- handler ------------------------------------------------------------------------------------------------------------
export default async function handler(req: Req, res: Res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Method not allowed' }); }
    const c = cld();
    if (!c) return res.status(503).json({ error: 'Photo uploads are not set up yet: the Cloudinary keys are missing on the server.' });
    if (!sbBase() || !sbAnon()) return res.status(503).json({ error: 'Server is missing the Supabase URL or key.' });

    const caller = await authenticate(req);
    if (!caller) return res.status(401).json({ error: 'Please sign in again.' });

    const body = (typeof req.body === 'string' ? safeParse(req.body) : req.body) as Record<string, unknown> | null;
    if (body?.action === 'sign') return sign(res, c, caller, body);
    if (body?.action === 'delete') return del(res, c, caller, body);
    if (body?.action === 'mirror') return mirror(res, c, caller, body);
    return res.status(400).json({ error: 'Unknown action.' });
  } catch (e) {
    console.error('cloudinary api error', e instanceof Error ? e.message : e); // never log secrets
    return res.status(500).json({ error: 'Photo service error. Please try again.' });
  }
}

function sign(res: Res, c: NonNullable<ReturnType<typeof cld>>, caller: Caller, body: Record<string, unknown>) {
  const count = Number(body.count ?? 1);
  if (!Number.isInteger(count) || count < 1 || count > 12) return res.status(400).json({ error: 'Invalid number of photos.' });
  // A vendor may only upload into their own folder; admins may name a vendor. A vendor id from anyone else is never trusted.
  const vendorId = caller.isAdmin && isUuid(body.vendor_id) ? body.vendor_id : caller.vendorId;
  if (!vendorId || (body.vendor_id && body.vendor_id !== vendorId)) return res.status(403).json({ error: 'You can only upload photos for your own store.' });
  if (rateLimited(`sign:${caller.userId}`, 60)) return res.status(429).json({ error: 'Too many uploads. Wait a minute and try again.' });

  const slots = Array.from({ length: count }, () => {
    const public_id = `${ROOT}/${vendorId}/products/${Date.now().toString(36)}${randomBytes(6).toString('hex')}`;
    const timestamp = Math.round(Date.now() / 1000);
    // Cloudinary signature: sorted "key=value" pairs joined by &, then the secret, SHA-1.
    const signature = sha1(`allowed_formats=${FORMATS}&public_id=${public_id}&timestamp=${timestamp}${c.secret}`);
    return { cloud_name: c.name, api_key: c.key, public_id, timestamp, signature, allowed_formats: FORMATS, upload_url: `https://api.cloudinary.com/v1_1/${c.name}/image/upload` };
  });
  return res.status(200).json({ slots });
}

async function del(res: Res, c: NonNullable<ReturnType<typeof cld>>, caller: Caller, body: Record<string, unknown>) {
  if (rateLimited(`del:${caller.userId}`, 60)) return res.status(429).json({ error: 'Too many requests. Try again shortly.' });
  const urls = Array.isArray(body.urls) ? [...new Set((body.urls as unknown[]).filter((u): u is string => typeof u === 'string'))].slice(0, 30) : [];
  if (!urls.length) return res.status(400).json({ error: 'No photos given.' });

  const deleted: string[] = [];
  const skipped: { url: string; reason: string }[] = [];
  for (const url of urls) {
    const publicId = ownPublicId(url, c.name);
    if (!publicId) { skipped.push({ url, reason: 'not a marketplace photo' }); continue; }
    const mine = caller.vendorId && publicId.startsWith(`${ROOT}/${caller.vendorId}/products/`);
    if (!mine && !caller.isAdmin) { skipped.push({ url, reason: 'not yours' }); continue; }
    if (await stillUsed(url, caller.token)) { skipped.push({ url, reason: 'still used by a product' }); continue; }
    try {
      const timestamp = Math.round(Date.now() / 1000);
      const signature = sha1(`invalidate=true&public_id=${publicId}&timestamp=${timestamp}${c.secret}`);
      const form = new URLSearchParams({ public_id: publicId, invalidate: 'true', timestamp: String(timestamp), api_key: c.key, signature });
      const r = await fetch(`https://api.cloudinary.com/v1_1/${c.name}/image/destroy`, { method: 'POST', body: form, signal: AbortSignal.timeout(10_000) });
      const j = (await r.json().catch(() => ({}))) as { result?: string };
      (r.ok && (j.result === 'ok' || j.result === 'not found')) ? deleted.push(url) : skipped.push({ url, reason: 'delete failed' });
    } catch { skipped.push({ url, reason: 'delete failed' }); }
  }
  return res.status(200).json({ deleted, skipped });
}

// Saves a copy of images that live on other websites (or the old Supabase bucket) in the caller's own Cloudinary folder.
// Cloudinary downloads the picture itself, so this server never fetches arbitrary addresses. A failure just returns null for that image
// and the caller keeps the original link: a product is never blocked by a slow or dead source.
async function mirror(res: Res, c: NonNullable<ReturnType<typeof cld>>, caller: Caller, body: Record<string, unknown>) {
  const vendorId = caller.isAdmin && isUuid(body.vendor_id) ? body.vendor_id : caller.vendorId ?? (caller.isAdmin ? 'platform' : null);
  if (!vendorId) return res.status(403).json({ error: 'You can only save photos for your own store.' });
  if (rateLimited(`mirror:${caller.userId}`, 60)) return res.status(429).json({ error: 'Too many requests. Try again shortly.' });
  const urls = Array.isArray(body.urls) ? [...new Set((body.urls as unknown[]).filter((u): u is string => typeof u === 'string'))].slice(0, 12) : [];
  if (!urls.length) return res.status(400).json({ error: 'No images given.' });

  const results = await Promise.all(urls.map(async (url) => {
    let u: URL; try { u = new URL(url); } catch { return { url, mirrored: null }; }
    if (u.protocol !== 'https:' || u.hostname === 'res.cloudinary.com' || url.length > 2000) return { url, mirrored: null };
    const public_id = `${ROOT}/${vendorId}/products/m${sha1(url).slice(0, 20)}`; // same source link -> same file, so no duplicates
    const timestamp = Math.round(Date.now() / 1000);
    const signature = sha1(`allowed_formats=${FORMATS}&public_id=${public_id}&timestamp=${timestamp}${c.secret}`);
    const form = new FormData();
    form.append('file', url); form.append('api_key', c.key); form.append('timestamp', String(timestamp));
    form.append('signature', signature); form.append('public_id', public_id); form.append('allowed_formats', FORMATS);
    try {
      const r = await fetch(`https://api.cloudinary.com/v1_1/${c.name}/image/upload`, { method: 'POST', body: form, signal: AbortSignal.timeout(25_000) });
      const j = (await r.json().catch(() => ({}))) as { secure_url?: string };
      return { url, mirrored: r.ok && typeof j.secure_url === 'string' ? j.secure_url : null };
    } catch { return { url, mirrored: null }; }
  }));
  return res.status(200).json({ results });
}

// Fails safe: when unsure whether another product uses the photo, it is kept.
async function stillUsed(url: string, token: string): Promise<boolean> {
  try {
    const q = encodeURIComponent(`"${url}"`);
    const r = await sb(`/rest/v1/products?or=(image_url.eq.${q},thumb_url.eq.${q},images.cs.{${q}})&select=id&limit=1`, token);
    if (!r.ok) return true;
    return ((await r.json()) as unknown[]).length > 0;
  } catch { return true; }
}

function safeParse(s: string) { try { return JSON.parse(s); } catch { return null; } }

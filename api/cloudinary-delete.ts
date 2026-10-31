// POST /api/cloudinary-delete  { urls: string[] }  ->  { deleted, skipped }
// Removes photos from Cloudinary after the product row stopped using them. Never trusts the browser:
//   * only photos in OUR account under marketplace/vendors/<caller's vendor id>/ are deletable (admins: any vendor);
//   * a photo that any product still references is skipped, so shared images are never removed.
import { vendorFolder } from '../src/lib/cloudinaryUrl';
import { authenticate, rateLimited, supabaseFetch, type Req, type Res } from './_lib/auth';
import { cloudinaryEnv, destroyImage, ownPublicId } from './_lib/cloudinary';

export default async function handler(req: Req, res: Res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Method not allowed' }); }
  if (!cloudinaryEnv()) return res.status(503).json({ error: 'Photo storage is not set up yet.' });

  const caller = await authenticate(req);
  if (!caller) return res.status(401).json({ error: 'Please sign in again.' });
  if (rateLimited(`del:${caller.userId}`, 60)) return res.status(429).json({ error: 'Too many requests. Try again shortly.' });

  const body = (typeof req.body === 'string' ? safeParse(req.body) : req.body) as { urls?: unknown } | null;
  const urls = Array.isArray(body?.urls) ? [...new Set((body!.urls as unknown[]).filter((u): u is string => typeof u === 'string'))].slice(0, 30) : [];
  if (!urls.length) return res.status(400).json({ error: 'No photos given.' });

  const deleted: string[] = [];
  const skipped: { url: string; reason: string }[] = [];
  for (const url of urls) {
    const publicId = ownPublicId(url);
    if (!publicId) { skipped.push({ url, reason: 'not a marketplace photo' }); continue; }
    const mine = caller.vendorId && publicId.startsWith(`${vendorFolder(caller.vendorId)}/`);
    if (!mine && !caller.isAdmin) { skipped.push({ url, reason: 'not yours' }); continue; }
    if (await stillUsed(url, caller.token)) { skipped.push({ url, reason: 'still used by a product' }); continue; }
    try { (await destroyImage(publicId)) ? deleted.push(url) : skipped.push({ url, reason: 'delete failed' }); }
    catch { skipped.push({ url, reason: 'delete failed' }); }
  }
  return res.status(200).json({ deleted, skipped });
}

// Products are publicly readable, so the caller's token can check every product. Fails safe: when unsure, the photo is kept.
async function stillUsed(url: string, token: string): Promise<boolean> {
  try {
    const q = encodeURIComponent(`"${url}"`);
    const r = await supabaseFetch(`/rest/v1/products?or=(image_url.eq.${q},thumb_url.eq.${q},images.cs.{${q}})&select=id&limit=1`, token);
    if (!r.ok) return true;
    return ((await r.json()) as unknown[]).length > 0;
  } catch { return true; }
}

function safeParse(s: string) { try { return JSON.parse(s); } catch { return null; } }

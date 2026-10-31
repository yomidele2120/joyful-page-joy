// POST /api/cloudinary-sign  { vendor_id, count }  ->  { slots: [{ public_id, timestamp, signature, ... }] }
// Gives a signed, single-use-looking upload ticket per photo. The folder is fixed to the caller's own vendor folder.
import { randomBytes } from 'node:crypto';
import { vendorFolder } from '../src/lib/cloudinaryUrl';
import { authenticate, isUuid, rateLimited, type Req, type Res } from './_lib/auth';
import { cloudinaryEnv, signUpload } from './_lib/cloudinary';

export default async function handler(req: Req, res: Res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Method not allowed' }); }
  if (!cloudinaryEnv()) return res.status(503).json({ error: 'Photo uploads are not set up yet. Please contact support.' });

  const caller = await authenticate(req);
  if (!caller) return res.status(401).json({ error: 'Please sign in again.' });

  const body = (typeof req.body === 'string' ? safeParse(req.body) : req.body) as { vendor_id?: unknown; count?: unknown } | null;
  const count = Number(body?.count ?? 1);
  if (!Number.isInteger(count) || count < 1 || count > 12) return res.status(400).json({ error: 'Invalid number of photos.' });

  // A vendor may only upload into their own folder. Admins (bulk tools) may name a vendor; the id is never trusted from anyone else.
  const vendorId = caller.isAdmin && isUuid(body?.vendor_id) ? (body!.vendor_id as string) : caller.vendorId;
  if (!vendorId || (body?.vendor_id && body.vendor_id !== vendorId)) return res.status(403).json({ error: 'You can only upload photos for your own store.' });

  if (rateLimited(`sign:${caller.userId}`, 60)) return res.status(429).json({ error: 'Too many uploads. Wait a minute and try again.' });

  const folder = vendorFolder(vendorId);
  const slots = Array.from({ length: count }, () => signUpload(`${folder}/${Date.now().toString(36)}${randomBytes(6).toString('hex')}`));
  return res.status(200).json({ slots });
}

function safeParse(s: string) { try { return JSON.parse(s); } catch { return null; } }

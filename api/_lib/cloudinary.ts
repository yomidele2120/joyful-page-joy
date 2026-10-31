// Server-only Cloudinary service. Reads CLOUDINARY_* from Vercel environment variables (never VITE_*, never sent to the browser).
import { v2 as cloudinary } from 'cloudinary';
import { CLOUDINARY_ROOT, parseCloudinaryUrl } from '../../src/lib/cloudinaryUrl';

export const ALLOWED_FORMATS = 'jpg,jpeg,png,webp,gif,avif';

let configured = false;
export function cloudinaryEnv() {
  const cloud_name = process.env.CLOUDINARY_CLOUD_NAME;
  const api_key = process.env.CLOUDINARY_API_KEY;
  const api_secret = process.env.CLOUDINARY_API_SECRET;
  if (!cloud_name || !api_key || !api_secret) return null;
  if (!configured) { cloudinary.config({ cloud_name, api_key, api_secret, secure: true }); configured = true; }
  return { cloud_name, api_key };
}

/** Signs one upload. The browser must send exactly these parameters, so it cannot choose another folder or format. */
export function signUpload(publicId: string) {
  const env = cloudinaryEnv();
  if (!env) throw new Error('Cloudinary is not configured');
  const timestamp = Math.round(Date.now() / 1000); // Cloudinary rejects signatures older than about an hour
  const params = { allowed_formats: ALLOWED_FORMATS, public_id: publicId, timestamp };
  const signature = cloudinary.utils.api_sign_request(params, process.env.CLOUDINARY_API_SECRET as string);
  return {
    cloud_name: env.cloud_name, api_key: env.api_key, public_id: publicId, timestamp, signature,
    allowed_formats: ALLOWED_FORMATS, upload_url: `https://api.cloudinary.com/v1_1/${env.cloud_name}/image/upload`,
  };
}

/** The public ID of a photo in OUR Cloudinary account, or null for any other link. */
export function ownPublicId(url: string): string | null {
  const env = cloudinaryEnv();
  const p = parseCloudinaryUrl(url);
  if (!env || !p || p.cloudName !== env.cloud_name || p.resourceType !== 'image') return null;
  return p.publicId.startsWith(`${CLOUDINARY_ROOT}/`) ? p.publicId : null;
}

/** Deletes one image (and the cached transformed copies). Resolves to true when it is gone, including when it was already gone. */
export async function destroyImage(publicId: string): Promise<boolean> {
  const r = await cloudinary.uploader.destroy(publicId, { invalidate: true, resource_type: 'image' });
  return r.result === 'ok' || r.result === 'not found';
}

// Browser side of the Cloudinary upload. The API secret never reaches the browser: this asks our own /api/cloudinary
// for a short-lived signature, then sends the photo straight to Cloudinary. Deleting also goes through our server.
import { supabase } from '@/integrations/supabase/client';
import { isCloudinaryUrl } from '@/lib/cloudinaryUrl';

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];

export interface UploadedImage { url: string; publicId: string }
interface Slot { cloud_name: string; api_key: string; public_id: string; timestamp: number; signature: string; allowed_formats: string; upload_url: string }

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Please sign in again to upload photos.');
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function api<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try { res = await fetch(path, { method: 'POST', headers: await authHeader(), body: JSON.stringify(body) }); }
  catch (e) { if (e instanceof Error && e.message.startsWith('Please sign in')) throw e; throw new Error('No connection. Check your internet and try again.'); }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `Request failed (${res.status})`);
  return json as T;
}

/** Throws a plain-language error when the file should not be uploaded. */
export function validateImageFile(file: Blob & { name?: string }) {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) throw new Error('Only JPG, PNG, WebP, GIF or AVIF photos can be uploaded.');
  if (file.size > MAX_UPLOAD_BYTES) throw new Error('That photo is larger than 10 MB. Choose a smaller one.');
  if (file.size === 0) throw new Error('That photo is empty.');
}

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

async function sendToCloudinary(file: Blob, slot: Slot): Promise<UploadedImage> {
  const form = new FormData();
  form.append('file', file);
  form.append('api_key', slot.api_key);
  form.append('timestamp', String(slot.timestamp));
  form.append('signature', slot.signature);
  form.append('public_id', slot.public_id);
  form.append('allowed_formats', slot.allowed_formats);
  const res = await fetch(slot.upload_url, { method: 'POST', body: form });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg: string = json?.error?.message || '';
    const err = new Error(/stale request|expired/i.test(msg) ? 'EXPIRED' : msg || `Upload failed (${res.status})`) as Error & { retry?: boolean };
    err.retry = res.status >= 500 || res.status === 429;
    throw err;
  }
  if (typeof json.secure_url !== 'string' || typeof json.public_id !== 'string') throw new Error('The image service sent an unexpected reply.');
  return { url: json.secure_url, publicId: json.public_id };
}

/**
 * Uploads photos for one vendor. Each file gets its own signature. Network problems and 5xx replies are retried twice,
 * an expired signature is replaced once. Nothing is returned for a failed photo: the error is thrown so no broken link is saved.
 */
export async function uploadProductImages(vendorId: string, files: Blob[]): Promise<UploadedImage[]> {
  if (!files.length) return [];
  files.forEach(validateImageFile);
  const getSlots = () => api<{ slots: Slot[] }>('/api/cloudinary', { action: 'sign', vendor_id: vendorId, count: files.length }).then(r => r.slots);
  let slots = await getSlots();
  return Promise.all(files.map(async (file, i) => {
    let slot = slots[i];
    let lastErr: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try { return await sendToCloudinary(file, slot); }
      catch (e: any) {
        lastErr = e;
        if (e?.message === 'EXPIRED') { slot = (await getSlots())[0]; continue; }
        if (e instanceof TypeError || e?.retry) { await wait(600 * (attempt + 1)); continue; }  // network error or server busy
        throw e;
      }
    }
    throw new Error(lastErr instanceof TypeError ? 'No connection. Check your internet and try again.' : 'The photo could not be uploaded. Please try again.');
  }));
}

/**
 * Removes photos from Cloudinary. Call this AFTER the product row no longer points at them. Only Cloudinary links are sent;
 * old Supabase and external links are ignored. A failure is only logged: the product is already saved and a leftover
 * file is harmless (the server also refuses to delete a photo another product still uses).
 */
export async function deleteCloudinaryImages(urls: (string | null | undefined)[]): Promise<void> {
  const list = [...new Set(urls.filter((u): u is string => !!u && isCloudinaryUrl(u)))];
  if (!list.length) return;
  try { await api('/api/cloudinary', { action: 'delete', urls: list }); }
  catch (e) { console.warn('Could not remove old photos from Cloudinary', e); }
}

/**
 * Saves a copy of images that are hosted elsewhere (borrowed links, old Supabase links) in Cloudinary, so they survive if the
 * original site removes them. Returns the Cloudinary link for each, or the ORIGINAL link when it could not be copied: a product
 * is never blocked or left without a picture because of this.
 */
export async function mirrorExternalImages(vendorId: string | null, urls: (string | null | undefined)[]): Promise<Record<string, string>> {
  const todo = [...new Set(urls.filter((u): u is string => !!u && /^https:\/\//i.test(u) && !isCloudinaryUrl(u)))].slice(0, 12);
  const out: Record<string, string> = {};
  if (!todo.length) return out;
  try {
    const { results } = await api<{ results: { url: string; mirrored: string | null }[] }>('/api/cloudinary', { action: 'mirror', ...(vendorId ? { vendor_id: vendorId } : {}), urls: todo });
    for (const r of results) if (r.mirrored) out[r.url] = r.mirrored;
  } catch (e) { console.warn('Could not save a copy of the image to Cloudinary', e); }
  return out;
}

// Vercel serverless function: link-preview page for a shared video (/feed?post=ID).
// vercel.json sends only link-preview robots here; everyone else gets the normal app.
import { buildShareHtml, type SharePost } from '../src/lib/shareOg';

interface Req { query?: Record<string, string | string[] | undefined>; headers: Record<string, string | string[] | undefined> }
interface Res { status(code: number): Res; setHeader(name: string, value: string): Res; send(body: string): void }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const header = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

async function loadPost(id: string): Promise<SharePost | null> {
  const base = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!base || !key || !UUID.test(id)) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    // Same public read the app itself does: only active posts are visible to anonymous visitors.
    const url = `${base}/rest/v1/posts?id=eq.${id}&is_active=eq.true&select=id,caption,thumbnail_url,image_urls,media_type,vendors(store_name),products(name)&limit=1`;
    const res = await fetch(url, { headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: controller.signal });
    if (!res.ok) return null;
    const rows = (await res.json()) as SharePost[];
    return rows[0] ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req: Req, res: Res) {
  const raw = req.query?.id;
  const id = String(Array.isArray(raw) ? raw[0] : raw ?? '');
  const proto = header(req.headers['x-forwarded-proto']) || 'https';
  const host = header(req.headers['x-forwarded-host']) || header(req.headers.host);
  const origin = host ? `${proto}://${host}` : '';

  const post = await loadPost(id);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  // Robots re-ask now and then; a short cache keeps the database quiet if a video goes viral.
  res.setHeader('Cache-Control', post ? 'public, s-maxage=300, stale-while-revalidate=3600' : 'public, s-maxage=60');
  res.status(200).send(buildShareHtml(post, origin));
}

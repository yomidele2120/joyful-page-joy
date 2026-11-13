import { buildProductPreviewHtml, type ProductSeoInput } from '../src/lib/productSeo.js';

interface Req { method?: string; query?: Record<string, string | string[] | undefined> }
interface Res { status(code: number): Res; setHeader(name: string, value: string): Res; send(body: string): void }

interface ProductRow extends Omit<ProductSeoInput, 'category_name' | 'vendor_name'> {
  categories?: { name?: string | null } | null;
  vendors?: { store_name?: string | null } | null;
}

async function loadPublicProduct(slug: string): Promise<ProductSeoInput | null> {
  const base = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!base || !key) throw new Error('Public Supabase configuration is missing');

  const url = new URL('/rest/v1/products', base);
  url.search = new URLSearchParams({
    select: 'name,slug,description,price,image_url,images,brand,sku,stock_quantity,is_public,is_preorder,preorder_approved,preorder_status,categories(name),vendors(store_name)',
    slug: `eq.${slug}`,
    is_public: 'eq.true',
    limit: '1',
  }).toString();
  const response = await fetch(url, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(4000),
  });
  if (!response.ok) return null;
  const rows = await response.json() as ProductRow[];
  const row = rows[0];
  if (!row) return null;
  return {
    ...row,
    category_name: row.categories?.name ?? null,
    vendor_name: row.vendors?.store_name ?? null,
  };
}

export default async function handler(req: Req, res: Res) {
  if (req.method && req.method !== 'GET') return res.status(405).send('Method not allowed');
  const rawSlug = req.query?.slug;
  const slug = String(Array.isArray(rawSlug) ? rawSlug[0] : rawSlug ?? '');
  if (!/^[a-z0-9][a-z0-9-]{0,159}$/i.test(slug)) return res.status(404).send('Product not found');

  try {
    const product = await loadPublicProduct(slug);
    if (!product) return res.status(404).send('Product not found');
    const configuredSite = process.env.SITE_URL?.replace(/\/$/, '');
    const siteUrl = configuredSite && /^https:\/\/[^/]+$/i.test(configuredSite)
      ? configuredSite
      : 'https://www.ithubafrica.com';
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600');
    return res.status(200).send(buildProductPreviewHtml(product, siteUrl));
  } catch {
    return res.status(503).send('Product preview is temporarily unavailable');
  }
}
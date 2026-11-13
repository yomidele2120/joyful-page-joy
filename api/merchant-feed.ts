import { buildGoogleMerchantFeed, type MerchantFeedProduct } from '../src/lib/productFeed.js';

interface Req { method?: string; query?: Record<string, string | string[] | undefined> }
interface Res { status(code: number): Res; setHeader(name: string, value: string): Res; send(body: string): void }

interface ProductRow extends Omit<MerchantFeedProduct, 'category_name'> {
  categories?: { name?: string | null } | null;
}

const PAGE_SIZE = 500;
const SITE_URL = (process.env.SITE_URL || 'https://www.ithubafrica.com').replace(/\/$/, '');

async function loadPage(page: number): Promise<MerchantFeedProduct[]> {
  const base = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!base || !key) throw new Error('Public Supabase configuration is missing');

  const url = new URL('/rest/v1/products', base);
  url.search = new URLSearchParams({
    select: 'id,slug,name,description,price,image_url,brand,specs,stock_quantity,is_preorder,preorder_approved,preorder_status,preorder_release_date,vendor_id,categories(name)',
    is_public: 'eq.true',
    order: 'id.asc',
  }).toString();
  const first = page * PAGE_SIZE;
  const response = await fetch(url, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Range: `${first}-${first + PAGE_SIZE - 1}`,
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error('Could not load products');
  const rows = await response.json() as ProductRow[];
  return rows.map(({ categories, ...row }) => ({ ...row, category_name: categories?.name ?? null }));
}

export default async function handler(req: Req, res: Res) {
  if (req.method && req.method !== 'GET') return res.status(405).send('Method not allowed');
  const rawPage = req.query?.page;
  const page = Number(Array.isArray(rawPage) ? rawPage[0] : rawPage ?? 0);
  if (!Number.isSafeInteger(page) || page < 0 || page > 9999) return res.status(400).send('Invalid page');

  try {
    const products = await loadPage(page);
    res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600');
    return res.status(200).send(buildGoogleMerchantFeed(products, SITE_URL));
  } catch {
    return res.status(503).send('Product feed is temporarily unavailable');
  }
}
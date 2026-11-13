interface Req { method?: string; query?: Record<string, string | string[] | undefined> }
interface Res { status(code: number): Res; setHeader(name: string, value: string): Res; send(body: string): void }
interface ProductRow { slug: string; updated_at: string }
interface CategoryRow { slug: string }

const PAGE_SIZE = 1000;
const SITE_URL = (process.env.SITE_URL || 'https://www.ithubafrica.com').replace(/\/$/, '');
const xmlEscape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

function publicSupabase() {
  const base = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!base || !key) throw new Error('Public Supabase configuration is missing');
  return { base, key };
}

async function productCount(): Promise<number> {
  const { base, key } = publicSupabase();
  const url = new URL('/rest/v1/products', base);
  url.search = new URLSearchParams({ select: 'id', is_public: 'eq.true' }).toString();
  const response = await fetch(url, {
    method: 'HEAD',
    headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: 'count=exact', Range: '0-0' },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error('Could not count public products');
  const total = response.headers.get('content-range')?.split('/').at(-1);
  const count = Number(total);
  if (!Number.isSafeInteger(count) || count < 0) throw new Error('Product count unavailable');
  return count;
}

async function loadProducts(page: number): Promise<ProductRow[]> {
  const { base, key } = publicSupabase();
  const url = new URL('/rest/v1/products', base);
  url.search = new URLSearchParams({
    select: 'slug,updated_at',
    is_public: 'eq.true',
    order: 'id.asc',
  }).toString();
  const first = page * PAGE_SIZE;
  const response = await fetch(url, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Range: `${first}-${first + PAGE_SIZE - 1}` },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error('Could not load sitemap products');
  return await response.json() as ProductRow[];
}

async function loadCategories(): Promise<CategoryRow[]> {
  const { base, key } = publicSupabase();
  const url = new URL('/rest/v1/categories', base);
  url.search = new URLSearchParams({ select: 'slug', order: 'sort_order.asc', limit: '1000' }).toString();
  const response = await fetch(url, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error('Could not load sitemap categories');
  return await response.json() as CategoryRow[];
}

function urlset(urls: { loc: string; lastmod?: string }[]) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(({ loc, lastmod }) => `<url><loc>${xmlEscape(loc)}</loc>${lastmod ? `<lastmod>${xmlEscape(lastmod)}</lastmod>` : ''}</url>`).join('\n')}\n</urlset>`;
}

export default async function handler(req: Req, res: Res) {
  if (req.method && req.method !== 'GET') return res.status(405).send('Method not allowed');
  const rawSection = req.query?.section;
  const section = String(Array.isArray(rawSection) ? rawSection[0] : rawSection ?? 'index');
  const rawPage = req.query?.page;
  const page = Number(Array.isArray(rawPage) ? rawPage[0] : rawPage ?? 0);
  if (!Number.isSafeInteger(page) || page < 0) return res.status(400).send('Invalid page');

  try {
    let xml: string;
    if (section === 'static') {
      const staticPaths = ['/', '/products', '/about', '/contact', '/faq', '/terms', '/privacy-policy', '/cookie-policy', '/shipping-policy', '/returns-policy', '/seller-agreement', '/dispute-resolution'];
        const staticPaths = ['/', '/products', '/about', '/contact', '/faq', '/terms', '/privacy-policy', '/cookie-policy', '/shipping-policy', '/returns-policy', '/seller-agreement', '/bnpl-terms', '/preorder-policy', '/dispute-resolution'];
        if (!Number.isSafeInteger(page) || page < 0 || page > 9999) return res.status(400).send('Invalid page');
      const categories = await loadCategories();
      xml = urlset([
        ...staticPaths.map(path => ({ loc: `${SITE_URL}${path}` })),
        ...categories.map(category => ({ loc: `${SITE_URL}/category/${encodeURIComponent(category.slug)}` })),
      ]);
    } else if (section === 'products') {
      const products = await loadProducts(page);
      xml = urlset(products.map(product => ({
        loc: `${SITE_URL}/product/${encodeURIComponent(product.slug)}`,
        lastmod: product.updated_at,
      })));
    } else if (section === 'index') {
      const count = await productCount();
      const pages = Math.ceil(count / PAGE_SIZE);
      xml = `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n<sitemap><loc>${xmlEscape(`${SITE_URL}/static-sitemap.xml`)}</loc></sitemap>\n${Array.from({ length: pages }, (_, index) => `<sitemap><loc>${xmlEscape(`${SITE_URL}/product-sitemap.xml?page=${index}`)}</loc></sitemap>`).join('\n')}\n</sitemapindex>`;
    } else {
      return res.status(400).send('Unknown sitemap section');
    }
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).send(xml);
  } catch {
    return res.status(503).send('Sitemap is temporarily unavailable');
  }
}
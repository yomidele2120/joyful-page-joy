import { productAvailability } from './productSeo.js';

export interface MerchantFeedProduct {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  brand: string | null;
  specs: unknown;
  stock_quantity: number;
  is_preorder: boolean;
  preorder_approved: boolean;
  preorder_status: string;
  preorder_release_date: string | null;
  vendor_id: string | null;
  category_name: string | null;
}

const xmlEscape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const textOnly = (value: string) => value.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();
const urlIsHttps = (value: string | null): value is string => !!value && /^https:\/\/\S+$/i.test(value);

function specValue(specs: unknown, key: string): string | null {
  if (!specs || typeof specs !== 'object' || Array.isArray(specs)) return null;
  const entry = Object.entries(specs as Record<string, unknown>).find(([name]) => name.trim().toLowerCase() === key);
  return typeof entry?.[1] === 'string' && entry[1].trim() ? entry[1].trim() : null;
}

function feedItem(product: MerchantFeedProduct, origin: string): string | null {
  const title = textOnly(product.name).slice(0, 150);
  const description = textOnly(product.description ?? '').slice(0, 5000);
  const price = Number(product.price);
  if (!product.id || !title || !description || !Number.isFinite(price) || price <= 0 || !urlIsHttps(product.image_url)) return null;

  const availability = productAvailability(product);
  const releaseDate = product.preorder_release_date;
  if (availability === 'preorder' && (!releaseDate || !/^\d{4}-\d{2}-\d{2}$/.test(releaseDate))) return null;

  const siteUrl = origin.replace(/\/$/, '');
  const productUrl = `${siteUrl}/product/${encodeURIComponent(product.slug)}`;
  const condition = specValue(product.specs, 'condition')?.toLowerCase();
  const gtinRaw = specValue(product.specs, 'gtin')?.replace(/[\s-]/g, '');
  const gtin = gtinRaw && /^(\d{8}|\d{12,14})$/.test(gtinRaw) ? gtinRaw : null;
  const mpn = specValue(product.specs, 'mpn');
  const validCondition = condition && ['new', 'used', 'refurbished'].includes(condition) ? condition : null;
  const fields: [string, string | null][] = [
    ['id', product.id],
    ['title', title],
    ['description', description],
    ['link', productUrl],
    ['image_link', product.image_url],
    ['availability', availability],
    ['price', `${price.toFixed(2)} NGN`],
    ['brand', product.brand?.trim() || null],
    ['gtin', gtin],
    ['mpn', mpn],
    ['condition', validCondition],
    ['product_type', product.category_name],
    ['external_seller_id', product.vendor_id],
    ['availability_date', availability === 'preorder' ? `${releaseDate}T00:00+0100` : null],
  ];
  return `<item>\n${fields.filter(([, value]) => value).map(([name, value]) => `  <g:${name}>${xmlEscape(value!)}</g:${name}>`).join('\n')}\n</item>`;
}

export function buildGoogleMerchantFeed(products: MerchantFeedProduct[], origin: string): string {
  const items = products.map(product => feedItem(product, origin)).filter((item): item is string => !!item);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">\n<channel>\n<title>IT Hub Africa product feed</title>\n<link>${xmlEscape(origin.replace(/\/$/, ''))}</link>\n<description>Public products listed on IT Hub Africa</description>\n${items.join('\n')}\n</channel>\n</rss>`;
}
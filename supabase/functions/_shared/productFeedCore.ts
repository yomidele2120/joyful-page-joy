// Turns marketplace products into rows for a TikTok catalog feed. Pure functions, no network: tested with
//   node --test supabase/functions/_shared/productFeedCore.test.ts
// TikTok requires: sku_id, title, description, availability, condition, price, link, image_link, brand.
// Price is "1500.00 NGN". Image links must end in .jpg or .png.

// The columns, in the same order as TikTok's own catalog template (tiktok_catalog_template.csv). Columns we have no data for stay empty.
export const FEED_COLUMNS = [
  'sku_id', 'title', 'description', 'availability', 'condition', 'price', 'link', 'image_link', 'brand', 'video_link',
  'additional_image_link', 'age_group', 'color', 'gender', 'item_group_id', 'google_product_category', 'material', 'pattern',
  'product_type', 'sale_price', 'sale_price_effective_date', 'shipping', 'shipping_weight', 'gtin', 'mpn', 'size', 'tax',
  'ios_url', 'ios_app_store_id', 'ios_app_name', 'iPhone_url', 'iPhone_app_store_id', 'iPhone_app_name', 'iPad_url',
  'iPad_app_store_id', 'iPad_app_name', 'android_url', 'android_package', 'android_app_name',
  'custom_label_0', 'custom_label_1', 'custom_label_2', 'custom_label_3', 'custom_label_4',
] as const;
export type FeedRow = Record<(typeof FEED_COLUMNS)[number], string>;

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? v as Obj : {});
const first = (v: unknown): Obj => obj(Array.isArray(v) ? v[0] : v);

export const cleanText = (v: unknown): string =>
  String(v ?? '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();

/** A public Cloudinary picture as an https link that ends in .jpg or .png (Cloudinary converts by file ending). Null if unusable. */
export function feedImage(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  let url: URL;
  try { url = new URL(value.trim()); } catch { return null; }
  if (url.protocol !== 'https:' || url.hostname !== 'res.cloudinary.com' || !url.pathname.split('/')[1]) return null;
  url.search = ''; url.hash = '';
  const lower = url.pathname.toLowerCase();
  if (/\.(jpe?g|png)$/.test(lower)) return url.toString();
  url.pathname = url.pathname.replace(/\.[a-z0-9]{2,5}$/i, '') + '.jpg';   // no ending, or webp/avif/gif: ask for a jpg
  return url.toString();
}

function availability(p: Obj): string {
  const preorder = Boolean(p.is_preorder) && Boolean(p.preorder_approved) && String(p.preorder_status ?? '').toLowerCase() === 'open';
  if (preorder) return 'preorder';
  return Number(p.stock_quantity ?? 0) > 0 ? 'in stock' : 'out of stock';
}

function condition(specs: Obj): string {
  const c = cleanText(specs.condition).toLowerCase();
  return c === 'used' || c === 'refurbished' ? c : 'new';
}

/** One feed row, or null when the product cannot be listed (not public, not approved, no price, no usable picture, no link). */
export function buildFeedRow(p: Obj, opts: { siteUrl: string; currency?: string }): FeedRow | null {
  const vendor = first(p.vendors);
  if (!p.is_public || p.is_active === false || !vendor.is_approved) return null;
  const price = Number(p.price);
  const title = cleanText(p.name).slice(0, 500);
  const slug = cleanText(p.slug);
  const image = feedImage(p.image_url) ?? (Array.isArray(p.images) ? p.images.map(feedImage).find(Boolean) ?? null : null);
  if (!(price > 0) || !title || !slug || !image) return null;

  const site = opts.siteUrl.replace(/\/+$/, '');
  const specs = obj(p.specs);
  const extra = (Array.isArray(p.images) ? p.images : []).map(feedImage).filter((u): u is string => !!u && u !== image).slice(0, 10);
  const gtin = cleanText(specs.gtin).replace(/[\s_-]/g, '');
  const blank = Object.fromEntries(FEED_COLUMNS.map((c) => [c, ''])) as FeedRow;
  return {
    ...blank,
    sku_id: String(p.id).slice(0, 100),
    title,
    description: (cleanText(p.description) || title).slice(0, 10000),
    availability: availability(p),
    condition: condition(specs),
    price: `${price.toFixed(2)} ${opts.currency ?? 'NGN'}`,
    link: `${site}/product/${encodeURIComponent(slug)}`,
    image_link: image,
    brand: (cleanText(p.brand) || cleanText(vendor.store_name) || 'ITHUB AFRICA').slice(0, 150),
    // TikTok's template writes this as one quoted, comma-separated list, so we do the same.
    additional_image_link: extra.length ? `"${extra.join(',')}"` : '',
    product_type: cleanText(obj(p.categories).name),
    gtin: /^(\d{8}|\d{12,14})$/.test(gtin) ? gtin : '',
    mpn: cleanText(specs.mpn),
  };
}

const csvCell = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** The whole feed as CSV (default) or TSV. */
export function toFeedText(rows: FeedRow[], format: 'csv' | 'tsv' = 'csv'): string {
  if (format === 'tsv') {
    const flat = (v: string) => v.replace(/[\t\r\n]+/g, ' ');
    return [FEED_COLUMNS.join('\t'), ...rows.map((r) => FEED_COLUMNS.map((c) => flat(r[c])).join('\t'))].join('\n') + '\n';
  }
  return [FEED_COLUMNS.join(','), ...rows.map((r) => FEED_COLUMNS.map((c) => csvCell(r[c])).join(','))].join('\r\n') + '\r\n';
}

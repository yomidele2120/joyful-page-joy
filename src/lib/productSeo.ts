import { escapeHtml, SITE_NAME } from './shareOg';

export interface ProductSeoInput {
  name: string;
  slug: string;
  description: string | null;
  price: number;
  image_url: string | null;
  images: string[] | null;
  brand: string | null;
  sku: string | null;
  stock_quantity: number;
  is_public: boolean | null;
  is_preorder: boolean;
  preorder_approved: boolean;
  preorder_status: string;
  category_name: string | null;
  vendor_name: string | null;
}

export interface ProductSeoDescriptor {
  title: string;
  description: string;
  canonicalUrl: string;
  imageUrl: string | null;
  robots: 'index,follow' | 'noindex,nofollow';
  structuredData: Record<string, unknown> | null;
}

const plainText = (value: string) => value.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();
const absoluteHttpsUrl = (value: string | null | undefined) => typeof value === 'string' && /^https:\/\/\S+$/i.test(value) ? value : null;

export type ProductAvailability = 'in_stock' | 'out_of_stock' | 'preorder';

export function productAvailability(product: Pick<ProductSeoInput, 'stock_quantity' | 'is_preorder' | 'preorder_approved' | 'preorder_status'>): ProductAvailability {
  if (product.is_preorder) return product.preorder_approved && product.preorder_status === 'open' ? 'preorder' : 'out_of_stock';
  return product.stock_quantity > 0 ? 'in_stock' : 'out_of_stock';
}

export function buildProductSeo(product: ProductSeoInput, origin: string): ProductSeoDescriptor {
  const siteUrl = origin.replace(/\/$/, '');
  const canonicalUrl = `${siteUrl}/product/${encodeURIComponent(product.slug)}`;
  const title = `${product.name} | IT Hub Africa`;
  const description = plainText(product.description ?? '').slice(0, 300)
    || `View ${product.name} and its current availability on IT Hub Africa.`;
  const imageUrl = absoluteHttpsUrl(product.image_url)
    ?? product.images?.map(absoluteHttpsUrl).find((image): image is string => !!image)
    ?? null;
  const availability = {
    in_stock: 'https://schema.org/InStock',
    out_of_stock: 'https://schema.org/OutOfStock',
    preorder: 'https://schema.org/PreOrder',
  }[productAvailability(product)];
  const price = Number(product.price);
  const structuredData = product.is_public && Number.isFinite(price) && price >= 0 ? {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description,
    url: canonicalUrl,
    ...(imageUrl ? { image: [imageUrl] } : {}),
    ...(product.brand?.trim() ? { brand: { '@type': 'Brand', name: product.brand.trim() } } : {}),
    ...(product.sku?.trim() ? { sku: product.sku.trim() } : {}),
    ...(product.category_name ? { category: product.category_name } : {}),
    offers: {
      '@type': 'Offer',
      url: canonicalUrl,
      priceCurrency: 'NGN',
      price: String(price),
      availability,
      ...(product.vendor_name ? { seller: { '@type': 'Organization', name: product.vendor_name } } : {}),
    },
  } : null;

  return {
    title,
    description,
    canonicalUrl,
    imageUrl,
    robots: product.is_public ? 'index,follow' : 'noindex,nofollow',
    structuredData,
  };
}

export function serializeProductStructuredData(value: Record<string, unknown>): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

export function buildProductPreviewHtml(product: ProductSeoInput, origin: string): string {
  const seo = buildProductSeo(product, origin);
  const title = escapeHtml(seo.title);
  const description = escapeHtml(seo.description);
  const canonical = escapeHtml(seo.canonicalUrl);
  const image = seo.imageUrl ? `<meta property="og:image" content="${escapeHtml(seo.imageUrl)}">\n<meta name="twitter:image" content="${escapeHtml(seo.imageUrl)}">` : '';
  const structuredData = seo.structuredData
    ? `<script type="application/ld+json">${serializeProductStructuredData(seo.structuredData)}</script>`
    : '';
  const price = Number(product.price);
  const priceText = Number.isFinite(price) ? `NGN ${price.toLocaleString('en-NG')}` : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${title}</title>
<meta name="description" content="${description}">
<meta name="robots" content="${seo.robots}">
<link rel="canonical" href="${canonical}">
<meta property="og:site_name" content="${SITE_NAME}">
<meta property="og:type" content="product">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${canonical}">
${image}
<meta name="twitter:card" content="${seo.imageUrl ? 'summary_large_image' : 'summary'}">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${description}">
${structuredData}
</head>
<body>
<main>
<h1>${title}</h1>
${seo.imageUrl ? `<img src="${escapeHtml(seo.imageUrl)}" alt="${title}">` : ''}
<p>${description}</p>
${priceText ? `<p>${escapeHtml(priceText)}</p>` : ''}
${product.vendor_name ? `<p>${escapeHtml(product.vendor_name)}</p>` : ''}
<a href="${canonical}">View product on ${SITE_NAME}</a>
</main>
</body>
</html>`;
}
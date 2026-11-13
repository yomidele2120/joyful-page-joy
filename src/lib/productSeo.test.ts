import { describe, expect, it } from 'vitest';
import { buildProductPreviewHtml, buildProductSeo, serializeProductStructuredData, type ProductSeoInput } from './productSeo';

const product: ProductSeoInput = {
  name: 'HP Laptop',
  slug: 'hp-laptop',
  description: '<p>Reliable <strong>laptop</strong> for work.</p>',
  price: 250000,
  image_url: 'https://res.cloudinary.com/shop/laptop.jpg',
  images: [],
  brand: 'HP',
  sku: 'HP-15',
  stock_quantity: 3,
  is_public: true,
  is_preorder: false,
  preorder_approved: false,
  preorder_status: 'open',
  category_name: 'Computers',
  vendor_name: 'Example Shop',
};

describe('product SEO data', () => {
  it('uses the database price, public URL, seller and actual stock state', () => {
    const seo = buildProductSeo(product, 'https://ithubafrica.com/');
    expect(seo.canonicalUrl).toBe('https://ithubafrica.com/product/hp-laptop');
    expect(seo.description).toBe('Reliable laptop for work.');
    expect(seo.structuredData?.offers).toMatchObject({
      price: '250000',
      priceCurrency: 'NGN',
      availability: 'https://schema.org/InStock',
      seller: { name: 'Example Shop' },
    });
  });

  it('uses preorder state and does not invent identifiers or condition', () => {
    const seo = buildProductSeo({ ...product, is_preorder: true, preorder_approved: true }, 'https://ithubafrica.com');
    const schema = seo.structuredData ?? {};
    expect(schema.offers).toMatchObject({ availability: 'https://schema.org/PreOrder' });
    expect(schema).not.toHaveProperty('gtin');
    expect(schema).not.toHaveProperty('mpn');
    expect(schema).not.toHaveProperty('itemCondition');
  });

  it('does not index private products and safely serializes vendor-provided markup', () => {
    const seo = buildProductSeo({ ...product, is_public: false, name: '</script><img src=x>' }, 'https://ithubafrica.com');
    expect(seo.robots).toBe('noindex,nofollow');
    expect(seo.structuredData).toBeNull();
    expect(serializeProductStructuredData({ name: '</script>' })).not.toContain('</script>');
  });

  it('renders escaped, database-backed product metadata for crawler previews', () => {
    const html = buildProductPreviewHtml({ ...product, name: '<img src=x onerror=alert(1)>' }, 'https://ithubafrica.com');
    expect(html).toContain('<meta property="og:type" content="product">');
    expect(html).toContain('"price":"250000"');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
  });
});
import { describe, expect, it } from 'vitest';
import { buildGoogleMerchantFeed, type MerchantFeedProduct } from './productFeed';

const product: MerchantFeedProduct = {
  id: 'product-1',
  slug: 'camera-1',
  name: 'Camera <strong>Pro</strong>',
  description: 'A camera &amp; lens',
  price: 180000,
  image_url: 'https://res.cloudinary.com/shop/camera.jpg',
  brand: 'Sample Brand',
  specs: { condition: 'new', gtin: '123456789012' },
  stock_quantity: 2,
  is_preorder: false,
  preorder_approved: false,
  preorder_status: 'open',
  preorder_release_date: null,
  vendor_id: 'vendor-1',
  category_name: 'Cameras',
};

describe('Google Merchant Center product feed', () => {
  it('exports database-backed values as escaped RSS items', () => {
    const xml = buildGoogleMerchantFeed([product], 'https://www.ithubafrica.com');
    expect(xml).toContain('<g:id>product-1</g:id>');
    expect(xml).toContain('<g:title>Camera Pro</g:title>');
    expect(xml).toContain('<g:price>180000.00 NGN</g:price>');
    expect(xml).toContain('<g:availability>in_stock</g:availability>');
    expect(xml).toContain('<g:gtin>123456789012</g:gtin>');
    expect(xml).toContain('<g:external_seller_id>vendor-1</g:external_seller_id>');
    expect(xml).toContain('camera-1');
  });

  it('does not fabricate missing condition or identifiers and omits incomplete products', () => {
    const xml = buildGoogleMerchantFeed([{ ...product, specs: {}, brand: null }], 'https://www.ithubafrica.com');
    expect(xml).not.toContain('<g:condition>');
    expect(xml).not.toContain('<g:gtin>');
    expect(xml).not.toContain('<g:mpn>');
    expect(buildGoogleMerchantFeed([{ ...product, description: '' }], 'https://www.ithubafrica.com')).not.toContain('<item>');
  });

  it('requires an availability date for preorder products', () => {
    const xml = buildGoogleMerchantFeed([{ ...product, is_preorder: true, preorder_approved: true }], 'https://www.ithubafrica.com');
    expect(xml).not.toContain('<item>');
  });
});
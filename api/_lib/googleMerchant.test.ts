import { describe, expect, it } from 'vitest';
import {
  buildMerchantProductInput,
  classifyMerchantApproval,
  merchantEligibilityError,
  type MerchantProduct,
} from './googleMerchant';

const product: MerchantProduct = {
  id: 'b6f40348-95ad-45c6-9a9d-b825ffcaf012',
  name: 'ThinkPad Laptop',
  slug: 'thinkpad-laptop',
  description: 'A dependable laptop.',
  price: 250000,
  brand: 'Lenovo',
  image_url: 'https://res.cloudinary.com/ithub/image/upload/v1/products/laptop.jpg',
  stock_quantity: 3,
  vendor_id: '13f49711-e3e4-4a63-851d-534f491273b7',
  is_active: true,
  is_public: true,
  is_preorder: false,
  specs: {},
  vendors: { is_approved: true },
  categories: { name: 'Laptops' },
};

describe('Google Merchant product mapping', () => {
  it('accepts a complete public listing from an approved seller', () => {
    expect(merchantEligibilityError(product)).toBeNull();
  });

  it('excludes hidden, unapproved, incomplete, and non-Cloudinary listings', () => {
    expect(merchantEligibilityError({ ...product, is_active: false })).toMatch(/inactive/i);
    expect(merchantEligibilityError({ ...product, vendors: { is_approved: false } })).toMatch(/seller/i);
    expect(merchantEligibilityError({ ...product, brand: null })).toMatch(/brand/i);
    expect(merchantEligibilityError({ ...product, image_url: 'https://example.com/image.jpg' })).toMatch(/Cloudinary/i);
  });

  it('maps required Merchant API attributes and stock/price values', () => {
    const input = buildMerchantProductInput(product, {
      siteUrl: 'https://www.ithubafrica.com/',
      feedLabel: 'NG',
      contentLanguage: 'en',
      currencyCode: 'NGN',
    });

    expect(input.offerId).toBe(product.id);
    expect(input.productAttributes).toMatchObject({
      title: product.name,
      description: product.description,
      link: `https://www.ithubafrica.com/product/${product.slug}`,
      imageLink: product.image_url,
      availability: 'IN_STOCK',
      condition: 'NEW',
      brand: product.brand,
      productTypes: ['Laptops'],
      price: { amountMicros: '250000000000', currencyCode: 'NGN' },
    });
    expect(buildMerchantProductInput({ ...product, stock_quantity: 0 }, {
      siteUrl: 'https://www.ithubafrica.com',
      feedLabel: 'NG',
      contentLanguage: 'en',
      currencyCode: 'NGN',
    }).productAttributes.availability).toBe('OUT_OF_STOCK');
  });

  it('uses an explicit condition in the product specifications', () => {
    expect(buildMerchantProductInput({ ...product, specs: { condition: 'used' } }, {
      siteUrl: 'https://www.ithubafrica.com',
      feedLabel: 'NG',
      contentLanguage: 'en',
      currencyCode: 'NGN',
    }).productAttributes.condition).toBe('USED');
  });

  it('classifies Google approval and rejection states for the configured country', () => {
    expect(classifyMerchantApproval({ destinationStatuses: [{ approvedCountries: ['NG'] }] }, 'NG').status).toBe('approved');
    expect(classifyMerchantApproval({ destinationStatuses: [{ disapprovedCountries: ['NG'] }] }, 'NG').status).toBe('disapproved');
    expect(classifyMerchantApproval({ destinationStatuses: [{ pendingCountries: ['NG'] }] }, 'NG').status).toBe('pending');
  });
});

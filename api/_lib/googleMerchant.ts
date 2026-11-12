export interface MerchantProduct {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price: number;
  brand: string | null;
  image_url: string | null;
  stock_quantity: number;
  vendor_id?: string | null;
  is_active: boolean | null;
  is_public: boolean | null;
  is_preorder?: boolean | null;
  specs?: unknown;
  vendors?: { is_approved: boolean | null } | null;
  categories?: { name: string | null } | null;
}

export interface MerchantProductOptions {
  siteUrl: string;
  feedLabel: string;
  contentLanguage: string;
  currencyCode: string;
}

export function merchantEligibilityError(product: MerchantProduct): string | null {
  if (!product.is_active || product.is_public !== true) return 'The listing is inactive or hidden.';
  if (product.vendor_id && product.vendors?.is_approved !== true) return 'The seller is not approved.';
  if (product.is_preorder) return 'Preorder listings are not synchronized.';
  if (!product.name?.trim() || !product.description?.trim() || !product.brand?.trim()) {
    return 'A title, description, and brand are required.';
  }
  if (!Number.isFinite(Number(product.price)) || Number(product.price) <= 0) return 'Price must be greater than zero.';
  if (!Number.isFinite(Number(product.stock_quantity)) || Number(product.stock_quantity) < 0) return 'Stock quantity is invalid.';
  if (!product.slug?.trim()) return 'A product URL is unavailable.';

  try {
    const image = new URL(product.image_url ?? '');
    if (image.protocol !== 'https:' || image.hostname !== 'res.cloudinary.com' || !image.pathname.includes('/image/upload/')) {
      return 'A Cloudinary-hosted product image is required.';
    }
  } catch {
    return 'A valid Cloudinary-hosted product image is required.';
  }

  return null;
}

function productCondition(specs: unknown): 'NEW' | 'USED' | 'REFURBISHED' {
  if (!specs || typeof specs !== 'object' || Array.isArray(specs)) return 'NEW';
  const values = specs as Record<string, unknown>;
  const raw = String(values.condition ?? values.product_condition ?? '').trim().toUpperCase();
  if (raw === 'USED' || raw === 'REFURBISHED') return raw;
  return 'NEW';
}

export function buildMerchantProductInput(product: MerchantProduct, options: MerchantProductOptions) {
  const baseUrl = options.siteUrl.replace(/\/+$/, '');
  const amountMicros = Math.round(Number(product.price) * 1_000_000);
  const productTypes = product.categories?.name?.trim() ? [product.categories.name.trim()] : undefined;

  return {
    offerId: product.id,
    contentLanguage: options.contentLanguage,
    feedLabel: options.feedLabel,
    productAttributes: {
      title: product.name.trim().slice(0, 150),
      description: product.description!.trim().slice(0, 5000),
      link: `${baseUrl}/product/${encodeURIComponent(product.slug)}`,
      imageLink: product.image_url,
      availability: Number(product.stock_quantity) > 0 ? 'IN_STOCK' : 'OUT_OF_STOCK',
      price: { amountMicros: String(amountMicros), currencyCode: options.currencyCode },
      condition: productCondition(product.specs),
      brand: product.brand!.trim().slice(0, 70),
      ...(productTypes ? { productTypes } : {}),
    },
  };
}

export function classifyMerchantApproval(productStatus: unknown, feedLabel: string): {
  status: 'approved' | 'pending' | 'disapproved';
  issues: unknown[];
} {
  if (!productStatus || typeof productStatus !== 'object') return { status: 'pending', issues: [] };
  const value = productStatus as {
    destinationStatuses?: Array<{
      approvedCountries?: string[];
      pendingCountries?: string[];
      disapprovedCountries?: string[];
    }>;
    itemLevelIssues?: unknown[];
  };
  const destinations = value.destinationStatuses ?? [];
  const hasCountry = (countries: string[] | undefined) =>
    countries?.some((country) => country.toUpperCase() === feedLabel.toUpperCase()) ?? false;

  if (destinations.some((destination) => hasCountry(destination.disapprovedCountries))) {
    return { status: 'disapproved', issues: value.itemLevelIssues ?? [] };
  }
  if (destinations.some((destination) => hasCountry(destination.approvedCountries))) {
    return { status: 'approved', issues: value.itemLevelIssues ?? [] };
  }
  return { status: 'pending', issues: value.itemLevelIssues ?? [] };
}

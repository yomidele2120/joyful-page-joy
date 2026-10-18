// Pure rules for when Pay later may be advertised. No network or database access here.

export interface PublicFinance {
  bnpl_enabled: boolean;
  bnpl_min_order: number;
  bnpl_max_order: number;
  bnpl_fee_percent: number;
  bnpl_fee_bearer: 'platform' | 'supplier' | 'customer';
}

export const VAT_RATE = 0.075;

/**
 * Pay later may only be advertised for a product the supplier allowed AND whose price with VAT
 * (for its minimum order) sits inside the admin's limits. Quantity can change the total at checkout,
 * so the server re-checks everything when the order is created.
 */
export function bnplEligibleForPrice(
  product: { bnpl_eligible?: boolean | null; price: number; moq?: number | null },
  finance: PublicFinance | undefined,
  available: boolean,
): boolean {
  if (!available || !finance || !product.bnpl_eligible) return false;
  const total = Math.round(product.price * Math.max(1, Number(product.moq ?? 1)) * (1 + VAT_RATE));
  return total >= Number(finance.bnpl_min_order) && total <= Number(finance.bnpl_max_order);
}

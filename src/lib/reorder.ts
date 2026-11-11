export interface ReorderSuggestion {
  product_id: string; name: string; slug: string; image_url: string | null; price: number; price_tiers: unknown;
  moq: number; unit: string; times_ordered: number; last_quantity: number; last_ordered_at: string;
  usual_gap_days: number | null; days_since: number;
}

/** Why this product is suggested, in plain words. */
export function reorderReason(s: Pick<ReorderSuggestion, 'times_ordered' | 'usual_gap_days' | 'days_since'>): string {
  if (s.times_ordered > 1 && s.usual_gap_days) return `You usually order every ${s.usual_gap_days} days. Last ordered ${s.days_since} days ago.`;
  return `You ordered this ${s.days_since} days ago.`;
}

/** Quantity to put in the cart: what they bought last time, never below the supplier's minimum order. */
export const reorderQuantity = (s: Pick<ReorderSuggestion, 'last_quantity' | 'moq'>) => Math.max(1, Math.floor(s.last_quantity || 1), Math.floor(s.moq || 1));

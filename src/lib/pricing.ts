import type { Json } from '@/integrations/supabase/types';

// Quantity-based (tiered) pricing helpers.
//
// A product has a base `price` (the unit price from its MOQ upward) and an
// optional list of tiers: [{ min_qty: 10, price: 2600 }, ...]. The unit price
// for a quantity is the tier with the highest `min_qty` that has been
// reached, otherwise the base price. The database function `tier_price()`
// uses the exact same rule, so what the buyer sees is what they are charged.

export interface PriceTier {
  min_qty: number;
  price: number;
}

export interface PricedProduct {
  price: number;
  moq?: number | null;
  unit?: string | null;
  price_tiers?: Json | null;
}

export interface TierRow {
  from: number;
  to: number | null; // null = "and above"
  price: number;
}

export function parseTiers(raw: Json | null | undefined): PriceTier[] {
  if (!Array.isArray(raw)) return [];
  const tiers: PriceTier[] = [];
  for (const entry of raw) {
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      const min_qty = Number((entry as Record<string, Json>).min_qty);
      const price = Number((entry as Record<string, Json>).price);
      if (Number.isFinite(min_qty) && min_qty >= 1 && Number.isFinite(price) && price >= 0) {
        tiers.push({ min_qty: Math.floor(min_qty), price });
      }
    }
  }
  return tiers.sort((a, b) => a.min_qty - b.min_qty);
}

export function parseSpecs(raw: Json | null | undefined): [string, string][] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
  return Object.entries(raw as Record<string, Json>)
    .filter(([key, value]) => key.trim() && value !== null && value !== undefined && String(value).trim())
    .map(([key, value]) => [key, String(value)] as [string, string]);
}

export function getMoq(product: PricedProduct): number {
  const moq = Number(product.moq ?? 1);
  return Number.isFinite(moq) && moq >= 1 ? Math.floor(moq) : 1;
}

export function unitPriceFor(product: PricedProduct, quantity: number): number {
  const tiers = parseTiers(product.price_tiers);
  let price = product.price;
  for (const tier of tiers) {
    if (tier.min_qty <= quantity) price = tier.price;
  }
  return price;
}

// Cheapest and dearest unit price a buyer could see for this product.
export function priceRange(product: PricedProduct): { min: number; max: number } {
  const prices = [product.price, ...parseTiers(product.price_tiers).map(t => t.price)];
  return { min: Math.min(...prices), max: Math.max(...prices) };
}

// Table rows for the "1-9 pieces / 10-19 pieces / 20+ pieces" price block.
export function tierRows(product: PricedProduct): TierRow[] {
  const moq = getMoq(product);
  const breakpoints = [moq, ...parseTiers(product.price_tiers).map(t => t.min_qty).filter(q => q > moq)];
  const unique = [...new Set(breakpoints)].sort((a, b) => a - b);
  return unique.map((from, index) => ({
    from,
    to: index < unique.length - 1 ? unique[index + 1] - 1 : null,
    price: unitPriceFor(product, from),
  }));
}

export function formatQtyRange(row: TierRow, unit: string): string {
  const label = pluralUnit(unit);
  if (row.to === null) return `${row.from}+ ${label}`;
  if (row.from === row.to) return `${row.from} ${row.from === 1 ? unit : label}`;
  return `${row.from}-${row.to} ${label}`;
}

export function pluralUnit(unit: string): string {
  const u = unit.trim() || 'Piece';
  if (/s$/i.test(u) || /^(kg|g|l|ml|m|cm)$/i.test(u)) return u;
  return `${u}s`;
}

export function formatMoq(product: PricedProduct): string {
  const moq = getMoq(product);
  const unit = (product.unit || 'Piece').trim();
  return `${moq} ${moq === 1 ? unit : pluralUnit(unit)} (MOQ)`;
}

import { describe, expect, it } from 'vitest';
import { getMoq, tierRows, unitPriceFor } from '@/lib/pricing';

const product = { price: 1000, moq: 5, unit: 'Piece', price_tiers: [{ min_qty: 20, price: 900 }, { min_qty: 50, price: 800 }] };

describe('quantity pricing', () => {
  it('uses the base price from the MOQ and the highest tier reached', () => {
    expect(unitPriceFor(product, 5)).toBe(1000);
    expect(unitPriceFor(product, 19)).toBe(1000);
    expect(unitPriceFor(product, 20)).toBe(900);
    expect(unitPriceFor(product, 500)).toBe(800);
  });
  it('builds table rows that start at the MOQ', () => {
    const rows = tierRows(product);
    expect(rows[0]).toMatchObject({ from: 5, to: 19, price: 1000 });
    expect(rows[rows.length - 1]).toMatchObject({ from: 50, to: null, price: 800 });
  });
  it('treats a missing or invalid MOQ as 1', () => {
    expect(getMoq({ price: 1 })).toBe(1);
    expect(getMoq({ price: 1, moq: 0 })).toBe(1);
  });
});

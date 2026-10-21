import { describe, expect, it } from 'vitest';
import { getMoq, tierRows, unitPriceFor, validatePriceEdit } from '@/lib/pricing';

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

describe('validatePriceEdit', () => {
  const ok = { price: '1000', compare_at_price: '', tiers: [{ min_qty: '', price: '' }] };

  it('accepts a plain price and ignores empty bulk rows', () => {
    expect(validatePriceEdit(ok, 5)).toEqual({ ok: true, value: { price: 1000, compare_at_price: null, price_tiers: [] } });
  });
  it('rejects an empty, zero or non-numeric price', () => {
    for (const price of ['', '0', '-5', 'abc']) expect(validatePriceEdit({ ...ok, price }, 1).ok).toBe(false);
  });
  it('requires the old price to be higher than the price', () => {
    expect(validatePriceEdit({ ...ok, compare_at_price: '900' }, 1).ok).toBe(false);
    expect(validatePriceEdit({ ...ok, compare_at_price: '1200' }, 1)).toMatchObject({ ok: true, value: { compare_at_price: 1200 } });
  });
  it('sorts bulk prices and checks them against the minimum order', () => {
    const r = validatePriceEdit({ ...ok, tiers: [{ min_qty: '50', price: '800' }, { min_qty: '20', price: '900' }] }, 5);
    expect(r).toMatchObject({ ok: true, value: { price_tiers: [{ min_qty: 20, price: 900 }, { min_qty: 50, price: 800 }] } });
    expect(validatePriceEdit({ ...ok, tiers: [{ min_qty: '5', price: '900' }] }, 5).ok).toBe(false);
  });
  it('rejects half-filled, duplicate and rising bulk prices', () => {
    expect(validatePriceEdit({ ...ok, tiers: [{ min_qty: '10', price: '' }] }, 1).ok).toBe(false);
    expect(validatePriceEdit({ ...ok, tiers: [{ min_qty: '10', price: '900' }, { min_qty: '10', price: '800' }] }, 1).ok).toBe(false);
    expect(validatePriceEdit({ ...ok, tiers: [{ min_qty: '10', price: '1100' }] }, 1).ok).toBe(false);
    expect(validatePriceEdit({ ...ok, tiers: [{ min_qty: '10', price: '900' }, { min_qty: '20', price: '950' }] }, 1).ok).toBe(false);
  });
});

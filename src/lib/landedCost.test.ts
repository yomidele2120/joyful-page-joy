import { describe, expect, it } from 'vitest';
import { landedCost } from './landedCost';

const base = { unitPrice: 1000, quantity: 10, shipping: 0, dutyPercent: 0, vatPercent: 0, insurancePercent: 0, otherFees: 0 };

describe('landedCost', () => {
  it('is just the goods when nothing else is added', () => {
    const r = landedCost(base);
    expect(r.goods).toBe(10000); expect(r.total).toBe(10000); expect(r.perUnit).toBe(1000);
  });
  it('adds shipping, duty, insurance, VAT (on goods+shipping+duty) and other fees', () => {
    const r = landedCost({ unitPrice: 1000, quantity: 10, shipping: 2000, dutyPercent: 10, vatPercent: 7.5, insurancePercent: 1, otherFees: 500 });
    expect(r.duty).toBe(1000); expect(r.insurance).toBe(100);
    expect(r.vat).toBeCloseTo((10000 + 2000 + 1000) * 0.075);
    expect(r.total).toBeCloseTo(10000 + 2000 + 1000 + 100 + 975 + 500);
    expect(r.perUnit).toBeCloseTo(r.total / 10);
  });
  it('ignores negative, NaN and absurd input', () => {
    const r = landedCost({ unitPrice: 100, quantity: 0, shipping: -5, dutyPercent: NaN, vatPercent: 500, insurancePercent: -3, otherFees: Number.NaN });
    expect(r.goods).toBe(100); expect(r.shipping).toBe(0); expect(r.duty).toBe(0); expect(r.insurance).toBe(0);
    expect(r.vat).toBeCloseTo(100);   // VAT is capped at 100%
    expect(Number.isFinite(r.total)).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { bnplEligibleForPrice, type PublicFinance } from '@/lib/payLater';

const finance: PublicFinance = { bnpl_enabled: true, bnpl_min_order: 50000, bnpl_max_order: 500000, bnpl_fee_percent: 0, bnpl_fee_bearer: 'platform' };

describe('Pay later eligibility', () => {
  it('advertises an allowed product inside the limits', () => {
    expect(bnplEligibleForPrice({ bnpl_eligible: true, price: 100000 }, finance, true)).toBe(true);
  });
  it('never advertises a product the seller did not allow', () => {
    expect(bnplEligibleForPrice({ bnpl_eligible: false, price: 100000 }, finance, true)).toBe(false);
    expect(bnplEligibleForPrice({ bnpl_eligible: null, price: 100000 }, finance, true)).toBe(false);
  });
  it('never advertises when Pay later is unavailable or settings are unknown', () => {
    expect(bnplEligibleForPrice({ bnpl_eligible: true, price: 100000 }, finance, false)).toBe(false);
    expect(bnplEligibleForPrice({ bnpl_eligible: true, price: 100000 }, undefined, true)).toBe(false);
  });
  it('respects the minimum and maximum, counting VAT and the minimum order', () => {
    expect(bnplEligibleForPrice({ bnpl_eligible: true, price: 40000 }, finance, true)).toBe(false); // 43,000 with VAT
    expect(bnplEligibleForPrice({ bnpl_eligible: true, price: 47000 }, finance, true)).toBe(true);  // 50,525 with VAT
    expect(bnplEligibleForPrice({ bnpl_eligible: true, price: 470000 }, finance, true)).toBe(false); // 505,250 with VAT
    expect(bnplEligibleForPrice({ bnpl_eligible: true, price: 30000, moq: 3 }, finance, true)).toBe(true); // 96,750 with VAT
  });
});

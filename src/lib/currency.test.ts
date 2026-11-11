import { describe, expect, it } from 'vitest';
import { convertFromNgn, formatInCurrency } from './currency';

const rates = { NGN: 1, USD: 0.00065, AED: 0.0024 };

describe('currency display', () => {
  it('keeps Naira as is', () => {
    expect(convertFromNgn(1500, 'NGN', rates)).toBe(1500);
    expect(formatInCurrency(1500, 'NGN', rates)).toContain('1,500');
  });
  it('converts with the admin rate and marks it as an estimate', () => {
    expect(convertFromNgn(1_000_000, 'USD', rates)).toBeCloseTo(650);
    expect(formatInCurrency(1_000_000, 'USD', rates)).toMatch(/^≈ .*650/);
    expect(formatInCurrency(10_000, 'AED', rates)).toMatch(/^≈ .*24/);
  });
  it('falls back to Naira when a rate is missing or invalid', () => {
    expect(convertFromNgn(1000, 'USD', {})).toBeNull();
    expect(formatInCurrency(1000, 'USD', { USD: 0 })).toContain('1,000');
    expect(formatInCurrency(1000, 'AED', { AED: NaN })).not.toContain('≈');
  });
  it('shows cents for small amounts', () => {
    expect(formatInCurrency(1000, 'USD', rates)).toMatch(/0\.65/);
  });
});

import { describe, expect, it } from 'vitest';
import {
  MAX_PRODUCT_PAGES, PRODUCT_PAGE_SIZE, SUPPLIER_COUNT_CAP, cleanLike, formatProductCount, formatSupplierProductCount, pageCountFor, sortKeys, toPrefixQuery,
} from './productSearch';

describe('toPrefixQuery', () => {
  it('turns words into word-start matches', () => {
    expect(toPrefixQuery('iph 15')).toBe('iph:* & 15:*');
    expect(toPrefixQuery('  Samsung   Galaxy ')).toBe('samsung:* & galaxy:*');
  });
  it('keeps only letters and numbers so nothing typed can break the query', () => {
    expect(toPrefixQuery("usb-c (20W) & 'drop;--")).toBe('usb:* & c:* & 20w:* & drop:*');
    expect(toPrefixQuery('!!! ---')).toBeNull();
    expect(toPrefixQuery('')).toBeNull();
  });
  it('keeps non-English letters', () => {
    expect(toPrefixQuery('Ọjà')).toBe('ọjà:*');
  });
  it('limits the number of words', () => {
    expect((toPrefixQuery('a b c d e f g h') ?? '').split(' & ')).toHaveLength(6);
  });
});

describe('cleanLike', () => {
  it('removes wildcard and separator characters', () => {
    expect(cleanLike('50%_off*, (new)')).toBe('50 off new');
    expect(cleanLike('a\\b')).toBe('a b');
  });
});

describe('sortKeys', () => {
  it('always ends with the id so pages never repeat or skip rows', () => {
    for (const s of ['newest', 'price-low', 'price-high', 'moq-low', undefined] as const) {
      const keys = sortKeys(s);
      expect(keys[keys.length - 1].column).toBe('id');
    }
  });
  it('maps each option to the right column and direction', () => {
    expect(sortKeys('newest')[0]).toEqual({ column: 'created_at', ascending: false });
    expect(sortKeys('price-low')[0]).toEqual({ column: 'price_min', ascending: true });
    expect(sortKeys('price-high')[0]).toEqual({ column: 'price_min', ascending: false });
    expect(sortKeys('moq-low')[0]).toEqual({ column: 'moq', ascending: true });
  });
});

describe('pageCountFor', () => {
  it('rounds up and never returns less than one page', () => {
    expect(pageCountFor(0)).toEqual({ pageCount: 1, capped: false });
    expect(pageCountFor(24)).toEqual({ pageCount: 1, capped: false });
    expect(pageCountFor(25)).toEqual({ pageCount: 2, capped: false });
  });
  it('caps very large results and says so', () => {
    expect(pageCountFor(2_000_000)).toEqual({ pageCount: MAX_PRODUCT_PAGES, capped: true });
    expect(pageCountFor(MAX_PRODUCT_PAGES * PRODUCT_PAGE_SIZE)).toEqual({ pageCount: MAX_PRODUCT_PAGES, capped: false });
  });
});

describe('formatProductCount', () => {
  it('shows exact small counts and approximate large ones', () => {
    expect(formatProductCount(42)).toBe('42');
    expect(formatProductCount(1_998_400)).toMatch(/^About 1,998,400$/);
  });
});

describe('formatSupplierProductCount', () => {
  it('shows the real number below the cap and a "+" at the cap', () => {
    expect(formatSupplierProductCount(0)).toBe('0');
    expect(formatSupplierProductCount(SUPPLIER_COUNT_CAP - 1)).toBe('9999');
    expect(formatSupplierProductCount(SUPPLIER_COUNT_CAP)).toBe('10,000+');
  });
});

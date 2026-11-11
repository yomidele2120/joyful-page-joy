import { describe, expect, it } from 'vitest';
import { compareQuotes } from './quoteCompare';

const q = (id: string, unit_price: number, moq: number | null = null) => ({ id, unit_price, moq, lead_time: null });

describe('compareQuotes', () => {
  it('sorts by unit price, flags the lowest and totals for the requested quantity', () => {
    const r = compareQuotes([q('b', 1200), q('a', 1000), q('c', 1500)], 50);
    expect(r.map(x => x.quote.id)).toEqual(['a', 'b', 'c']);
    expect(r[0]).toMatchObject({ lowest: true, total: 50000, vsLowestPercent: 0 });
    expect(r[1]).toMatchObject({ lowest: false, vsLowestPercent: 20 });
    expect(r[2].vsLowestPercent).toBe(50);
  });
  it('flags quotes whose MOQ is above the requested quantity', () => {
    const r = compareQuotes([q('a', 10, 100), q('b', 12, 20)], 50);
    expect(r.find(x => x.quote.id === 'a')!.moqTooHigh).toBe(true);
    expect(r.find(x => x.quote.id === 'b')!.moqTooHigh).toBe(false);
  });
  it('handles ties, bad prices and empty lists', () => {
    expect(compareQuotes([q('a', 5), q('b', 5)], 1).every(x => x.lowest)).toBe(true);
    expect(compareQuotes([q('a', NaN)], 1)).toEqual([]);
    expect(compareQuotes([], 10)).toEqual([]);
  });
});

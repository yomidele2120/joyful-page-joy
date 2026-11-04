import { describe, expect, it } from 'vitest';
import { shuffleItems } from '@/lib/feed';

describe('shuffleItems', () => {
  it('shuffles a copy of the input without losing items', () => {
    const items = ['first', 'second', 'third'];
    const shuffled = shuffleItems(items, () => 0);

    expect(shuffled).toEqual(['second', 'third', 'first']);
    expect([...shuffled].sort()).toEqual([...items].sort());
    expect(items).toEqual(['first', 'second', 'third']);
  });

  it('returns an empty list for empty input', () => {
    expect(shuffleItems([])).toEqual([]);
  });
});

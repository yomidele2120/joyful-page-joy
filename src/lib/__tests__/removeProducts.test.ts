import { describe, expect, it } from 'vitest';
import { removeSummary } from '@/lib/removeProducts';

describe('removeSummary', () => {
  it('says plainly what was deleted', () => {
    expect(removeSummary({ deleted: 1, hidden: 0 })).toBe('1 product deleted.');
    expect(removeSummary({ deleted: 12, hidden: 0 })).toBe('12 products deleted.');
  });
  it('explains products that were hidden because they were ordered', () => {
    expect(removeSummary({ deleted: 0, hidden: 1 })).toContain('1 product hidden, not deleted');
    expect(removeSummary({ deleted: 3, hidden: 2 })).toBe('3 products deleted. 2 products hidden instead, because buyers have ordered them.');
  });
  it('never claims success when nothing happened', () => {
    expect(removeSummary({ deleted: 0, hidden: 0 })).toBe('Nothing was removed.');
  });
});

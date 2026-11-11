import { describe, expect, it } from 'vitest';
import { reorderQuantity, reorderReason } from './reorder';

describe('reorder helpers', () => {
  it('explains a repeat pattern or a single past order', () => {
    expect(reorderReason({ times_ordered: 3, usual_gap_days: 30, days_since: 40 })).toBe('You usually order every 30 days. Last ordered 40 days ago.');
    expect(reorderReason({ times_ordered: 1, usual_gap_days: null, days_since: 35 })).toBe('You ordered this 35 days ago.');
  });
  it('uses the last quantity but never less than the MOQ', () => {
    expect(reorderQuantity({ last_quantity: 30, moq: 10 })).toBe(30);
    expect(reorderQuantity({ last_quantity: 5, moq: 20 })).toBe(20);
    expect(reorderQuantity({ last_quantity: 0, moq: 0 })).toBe(1);
  });
});

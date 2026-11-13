import { describe, expect, it } from 'vitest';
import { summarizeAiSuggestions } from './aiProductSuggestions';

describe('summarizeAiSuggestions', () => {
  it('counts suggestions by status and totals without mutating input', () => {
    const rows = [
      { status: 'draft' },
      { status: 'review' },
      { status: 'approved' },
      { status: 'review' },
      { status: 'rejected' },
      { status: 'published' },
      { status: 'approved' },
    ];

    const result = summarizeAiSuggestions(rows);

    expect(result.total).toBe(7);
    expect(result.draft).toBe(1);
    expect(result.review).toBe(2);
    expect(result.approved).toBe(2);
    expect(result.rejected).toBe(1);
    expect(result.published).toBe(1);
    expect(rows).toHaveLength(7);
  });
});

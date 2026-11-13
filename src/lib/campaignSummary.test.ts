import { describe, expect, it } from 'vitest';
import { summarizeCampaigns } from './campaignSummary';

describe('summarizeCampaigns', () => {
  it('totals budget, spend and all campaign states', () => {
    const rows = [
      { status: 'draft', budget: 100, spend: 10 },
      { status: 'pending_review', budget: 200, spend: 50 },
      { status: 'approved', budget: 300, spend: 0 },
      { status: 'active', budget: 500, spend: 100 },
      { status: 'paused', budget: 400, spend: 60 },
      { status: 'rejected', budget: 100, spend: 0 },
      { status: 'ended', budget: 150, spend: 150 },
    ];

    const result = summarizeCampaigns(rows as any[]);

    expect(result.total).toBe(7);
    expect(result.draft).toBe(1);
    expect(result.pending_review).toBe(1);
    expect(result.approved).toBe(1);
    expect(result.active).toBe(1);
    expect(result.paused).toBe(1);
    expect(result.rejected).toBe(1);
    expect(result.ended).toBe(1);
    expect(result.total_budget).toBe(1750);
    expect(result.total_spend).toBe(370);
  });
});

export type CampaignStatus = 'draft' | 'pending_review' | 'approved' | 'active' | 'paused' | 'rejected' | 'ended';

export type CampaignSummary = {
  total: number;
  draft: number;
  pending_review: number;
  approved: number;
  active: number;
  paused: number;
  rejected: number;
  ended: number;
  total_budget: number;
  total_spend: number;
};

export function summarizeCampaigns(rows: Array<{ status?: string | null; budget?: number | string | null; spend?: number | string | null }>): CampaignSummary {
  const summary: CampaignSummary = {
    total: rows.length,
    draft: 0,
    pending_review: 0,
    approved: 0,
    active: 0,
    paused: 0,
    rejected: 0,
    ended: 0,
    total_budget: 0,
    total_spend: 0,
  };

  for (const row of rows) {
    const status = String(row.status ?? 'draft').toLowerCase() as CampaignStatus;
    const budget = Number(row.budget ?? 0);
    const spend = Number(row.spend ?? 0);

    summary.total_budget += Number.isFinite(budget) ? budget : 0;
    summary.total_spend += Number.isFinite(spend) ? spend : 0;

    if (status === 'draft') summary.draft += 1;
    else if (status === 'pending_review') summary.pending_review += 1;
    else if (status === 'approved') summary.approved += 1;
    else if (status === 'active') summary.active += 1;
    else if (status === 'paused') summary.paused += 1;
    else if (status === 'rejected') summary.rejected += 1;
    else if (status === 'ended') summary.ended += 1;
    else summary.draft += 1;
  }

  return summary;
}

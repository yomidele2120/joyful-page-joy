export type AiSuggestionStatus = 'draft' | 'review' | 'approved' | 'rejected' | 'published';

export type AiSuggestionSummary = {
  total: number;
  draft: number;
  review: number;
  approved: number;
  rejected: number;
  published: number;
};

export function summarizeAiSuggestions(rows: Array<{ status?: string | null }>): AiSuggestionSummary {
  const summary: AiSuggestionSummary = {
    total: rows.length,
    draft: 0,
    review: 0,
    approved: 0,
    rejected: 0,
    published: 0,
  };

  for (const row of rows) {
    const status = String(row.status ?? 'draft').toLowerCase() as AiSuggestionStatus;
    if (status in summary) {
      summary[status] += 1;
    } else {
      summary.draft += 1;
    }
  }

  return summary;
}

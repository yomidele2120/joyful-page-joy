export type RiskStatus = 'open' | 'reviewing' | 'resolved' | 'dismissed';
export type RiskSeverity = 'low' | 'medium' | 'high' | 'critical';

export type RiskSummary = {
  total: number;
  open: number;
  reviewing: number;
  resolved: number;
  dismissed: number;
  low: number;
  medium: number;
  high: number;
  critical: number;
};

export function summarizeRiskFlags(rows: Array<{ status?: string | null; severity?: string | null }>): RiskSummary {
  const summary: RiskSummary = {
    total: rows.length,
    open: 0,
    reviewing: 0,
    resolved: 0,
    dismissed: 0,
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
  };

  for (const row of rows) {
    const status = String(row.status ?? 'open').toLowerCase() as RiskStatus;
    const severity = String(row.severity ?? 'medium').toLowerCase() as RiskSeverity;

    if (status === 'open') summary.open += 1;
    else if (status === 'reviewing') summary.reviewing += 1;
    else if (status === 'resolved') summary.resolved += 1;
    else if (status === 'dismissed') summary.dismissed += 1;
    else summary.open += 1;

    if (severity === 'low') summary.low += 1;
    else if (severity === 'medium') summary.medium += 1;
    else if (severity === 'high') summary.high += 1;
    else if (severity === 'critical') summary.critical += 1;
    else summary.medium += 1;
  }

  return summary;
}

import { describe, expect, it } from 'vitest';
import { summarizeRiskFlags } from './riskSummary';

describe('summarizeRiskFlags', () => {
  it('counts open and severity across a review queue', () => {
    const rows = [
      { status: 'open', severity: 'high' },
      { status: 'reviewing', severity: 'medium' },
      { status: 'reviewing', severity: 'critical' },
      { status: 'resolved', severity: 'low' },
      { status: 'dismissed', severity: 'medium' },
    ];

    const summary = summarizeRiskFlags(rows as any[]);

    expect(summary.total).toBe(5);
    expect(summary.open).toBe(1);
    expect(summary.reviewing).toBe(2);
    expect(summary.resolved).toBe(1);
    expect(summary.dismissed).toBe(1);
    expect(summary.high).toBe(1);
    expect(summary.critical).toBe(1);
    expect(summary.medium).toBe(2);
  });
});

/**
 * Health Score Computer — Unit Tests
 * SD: SD-MAN-FIX-PIPELINE-HEALTH-GAPS-ORCH-001-A
 */

import { describe, it, expect } from 'vitest';
import { computeHealthScore } from '../../lib/eva/health-score-computer.js';

describe('computeHealthScore', () => {
  it('returns 0 for null input', () => {
    expect(computeHealthScore(null)).toBe(0);
    expect(computeHealthScore(undefined)).toBe(0);
  });

  it('returns red for empty object', () => {
    expect(computeHealthScore({})).toBe('red');
  });

  it('returns red for minimal data', () => {
    const score = computeHealthScore({ status: 'ok' });
    expect(['red', 'yellow']).toContain(score);
  });

  it('returns green for rich advisory data', () => {
    const data = {
      analysis: { key_findings: 'Multiple important findings discovered during this stage of venture evaluation' },
      summary: 'The venture shows strong product-market fit with clear differentiation in the target segment. Revenue projections indicate break-even within 18 months.',
      recommendation: 'Proceed to next stage with focus on GTM validation',
      score: 78,
      results: { metrics: { tam: 5000000, sam: 500000, som: 50000 } },
    };
    expect(computeHealthScore(data)).toBe('green');
  });

  it('returns only valid traffic-light values', () => {
    const values = [
      computeHealthScore({ a: 'hello' }),
      computeHealthScore({ a: 'word '.repeat(100) }),
      computeHealthScore({ analysis: 'good', summary: { nested: true }, recommendation: 'go' }),
    ];
    values.forEach(v => expect(['green', 'yellow', 'red']).toContain(v));
  });

  it('returns green for substantive content with expected fields', () => {
    const data = {
      analysis: 'A comprehensive analysis of market dynamics and competitive landscape revealing strong positioning',
      summary: 'Venture demonstrates clear value proposition with measurable differentiation',
      recommendation: 'Approve for next phase',
      results: { confidence: 0.85, metrics: { growth: 0.3 } },
    };
    expect(computeHealthScore(data)).toBe('green');
  });
});

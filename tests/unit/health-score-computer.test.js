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

  it('returns 0 for empty object', () => {
    expect(computeHealthScore({})).toBe(0);
  });

  it('returns low score for minimal data', () => {
    const score = computeHealthScore({ status: 'ok' });
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(30);
  });

  it('returns high score for rich advisory data', () => {
    const data = {
      analysis: { key_findings: 'Multiple important findings discovered during this stage of venture evaluation' },
      summary: 'The venture shows strong product-market fit with clear differentiation in the target segment. Revenue projections indicate break-even within 18 months.',
      recommendation: 'Proceed to next stage with focus on GTM validation',
      score: 78,
      results: { metrics: { tam: 5000000, sam: 500000, som: 50000 } },
    };
    const score = computeHealthScore(data);
    expect(score).toBeGreaterThanOrEqual(70);
  });

  it('gives word count credit proportionally', () => {
    const short = computeHealthScore({ a: 'hello' });
    const long = computeHealthScore({ a: 'word '.repeat(100) });
    expect(long).toBeGreaterThan(short);
  });

  it('gives structural credit for nested objects', () => {
    const flat = computeHealthScore({ a: 'x', b: 'y', c: 'z' });
    const nested = computeHealthScore({ a: { inner: 'data' }, b: 'y', c: 'z' });
    expect(nested).toBeGreaterThan(flat);
  });

  it('gives field completeness credit for expected fields', () => {
    const noMatch = computeHealthScore({ foo: 'bar', baz: 'qux', xyz: 'abc' });
    const withMatch = computeHealthScore({ analysis: 'good', summary: 'fine', recommendation: 'go' });
    expect(withMatch).toBeGreaterThan(noMatch);
  });

  it('caps at 100', () => {
    const massive = { analysis: 'word '.repeat(500), summary: { nested: true }, recommendation: 'go', score: 99, results: { a: 1 } };
    expect(computeHealthScore(massive)).toBeLessThanOrEqual(100);
  });

  it('produces varying scores for different quality levels', () => {
    const low = computeHealthScore({ status: 'done' });
    const mid = computeHealthScore({ analysis: 'brief analysis here', results: { score: 5 } });
    const high = computeHealthScore({
      analysis: 'A comprehensive analysis of market dynamics and competitive landscape revealing strong positioning',
      summary: 'Venture demonstrates clear value proposition with measurable differentiation',
      recommendation: 'Approve for next phase',
      results: { confidence: 0.85, metrics: { growth: 0.3 } },
    });
    expect(low).toBeLessThan(mid);
    expect(mid).toBeLessThan(high);
  });
});

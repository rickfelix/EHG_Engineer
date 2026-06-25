/**
 * FR-4 — executionFeasibility reuse credit
 * SD-LEO-INFRA-S3-SOFT-GATE-REDESIGN-001
 */
import { describe, it, expect } from 'vitest';
import { applyReuseCredit } from '../../../../lib/eva/stage-templates/analysis-steps/stage-03-hybrid-scoring.js';

describe('stage-03 executionFeasibility reuse credit (FR-4)', () => {
  it('no reuse signal -> unchanged', () => {
    expect(applyReuseCredit(45, false)).toBe(45);
    expect(applyReuseCredit(45, undefined)).toBe(45);
    expect(applyReuseCredit(45, 0)).toBe(45);
  });

  it('reuse=true scores higher than reuse=false (bounded credit)', () => {
    const withReuse = applyReuseCredit(45, true);
    const without = applyReuseCredit(45, false);
    expect(withReuse).toBeGreaterThan(without);
    expect(withReuse).toBe(55);
  });

  it('reuse intensity (0..1) scales the credit; intensity clamps to 1', () => {
    expect(applyReuseCredit(45, 0.5)).toBe(50);
    expect(applyReuseCredit(45, 1)).toBe(55);
    expect(applyReuseCredit(45, 2)).toBe(55);
  });

  it('clamps the credited score to [0,100]', () => {
    expect(applyReuseCredit(95, true)).toBe(100);
    expect(applyReuseCredit(100, true)).toBe(100);
  });

  it('bounded: reuse does NOT rescue an otherwise-failing venture', () => {
    expect(applyReuseCredit(20, true)).toBe(30);
    expect(applyReuseCredit(20, true)).toBeLessThan(55);
  });
});

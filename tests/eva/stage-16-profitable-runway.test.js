/**
 * Regression tests for SD-LEO-INFRA-S16-PROFITABLE-RUNWAY-CONTRACT-001
 *
 * Verifies that the S16 post-stage contract validator:
 * - ACCEPTS profitable ventures that emit { runway_months: null, runway_unbounded: true }
 * - Does NOT regress on short-runway ventures with a finite runway_months value
 */
import { describe, it, expect } from 'vitest';
import { validatePostStage } from '../../lib/eva/contracts/stage-contracts.js';

const PROMOTION_GATE_STUB = {
  decision: 'PROMOTE',
  score: 85,
};

describe('S16 post-stage contract — profitable runway sentinel', () => {
  it('accepts a profitable venture with null runway_months + runway_unbounded=true', () => {
    const profitableOutput = {
      runway_months: null,
      runway_unbounded: true,
      promotion_gate: PROMOTION_GATE_STUB,
    };
    const result = validatePostStage(16, profitableOutput);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('accepts a short-runway venture with finite runway_months (regression)', () => {
    const shortRunwayOutput = {
      runway_months: 4,
      runway_unbounded: false,
      promotion_gate: PROMOTION_GATE_STUB,
    };
    const result = validatePostStage(16, shortRunwayOutput);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects an S16 output missing promotion_gate entirely', () => {
    const missingGate = {
      runway_months: 12,
      runway_unbounded: false,
    };
    const result = validatePostStage(16, missingGate);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('promotion_gate'))).toBe(true);
  });

  it('JSON round-trip: null runway is explicit, not a lost Infinity', () => {
    const output = { runway_months: null, runway_unbounded: true };
    const serialized = JSON.stringify(output);
    const parsed = JSON.parse(serialized);
    expect(parsed.runway_months).toBeNull();
    expect(parsed.runway_unbounded).toBe(true);
  });
});

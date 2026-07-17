import { describe, it, expect } from 'vitest';
import {
  CRITERIA_WEIGHTS,
  PASS_FAIL_GATES,
  computeWeightedScore,
  checkPassFailGates,
  computeConfidenceAdjustedScore,
  scoreVenture,
} from '../../../lib/foresight/scoring/venture-score.js';

describe('CRITERIA_WEIGHTS', () => {
  it('sums to 100 across all 8 criteria (spec section 13)', () => {
    const total = Object.values(CRITERIA_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(total).toBe(100);
  });

  it('has exactly the 8 spec-named criteria', () => {
    expect(Object.keys(CRITERIA_WEIGHTS).sort()).toEqual(
      [
        'customer_pain',
        'ehg_agentic_advantage',
        'distribution_accessibility',
        'technical_timing',
        'revenue_potential',
        'defensibility',
        'cross_venture_reuse',
        'future_option_value',
      ].sort(),
    );
  });
});

describe('computeWeightedScore', () => {
  it('sums fully-scored criteria to 100', () => {
    const full = {};
    for (const [key, weight] of Object.entries(CRITERIA_WEIGHTS)) full[key] = weight;
    expect(computeWeightedScore(full)).toBe(100);
  });

  it('clamps an over-max criterion score to its weight', () => {
    expect(computeWeightedScore({ customer_pain: 999 })).toBe(20);
  });

  it('clamps a negative criterion score to 0', () => {
    expect(computeWeightedScore({ customer_pain: -5 })).toBe(0);
  });

  it('treats a missing criterion as 0 rather than throwing', () => {
    expect(computeWeightedScore({})).toBe(0);
  });
});

describe('checkPassFailGates (spec 13.1)', () => {
  it('passes when all 5 gates are true', () => {
    const gates = Object.fromEntries(PASS_FAIL_GATES.map((g) => [g, true]));
    expect(checkPassFailGates(gates)).toEqual({ passed: true, failed_gates: [] });
  });

  it('fails when any single gate is explicitly false', () => {
    const gates = Object.fromEntries(PASS_FAIL_GATES.map((g) => [g, true]));
    gates.security_viability = false;
    const result = checkPassFailGates(gates);
    expect(result.passed).toBe(false);
    expect(result.failed_gates).toEqual(['security_viability']);
  });

  it('does not treat an omitted gate as a failure', () => {
    expect(checkPassFailGates({})).toEqual({ passed: true, failed_gates: [] });
  });
});

describe('computeConfidenceAdjustedScore (spec 13.2 worked example)', () => {
  it('reproduces the spec worked example: raw=82, confidence=0.55 -> 45', () => {
    expect(computeConfidenceAdjustedScore(82, 0.55)).toBe(45);
  });

  it('returns 0 for zero confidence regardless of raw score', () => {
    expect(computeConfidenceAdjustedScore(100, 0)).toBe(0);
  });

  it('returns the raw score unchanged at full confidence', () => {
    expect(computeConfidenceAdjustedScore(82, 1)).toBe(82);
  });

  it('clamps an out-of-range confidence (e.g. accidental 0-100 scale) to 1', () => {
    expect(computeConfidenceAdjustedScore(82, 55)).toBe(82);
  });

  it('clamps a negative confidence to 0', () => {
    expect(computeConfidenceAdjustedScore(82, -0.5)).toBe(0);
  });
});

describe('scoreVenture (full section 13.2 output shape)', () => {
  it('reproduces the spec worked example end-to-end via criterion scores', () => {
    // customer_pain 16 + ehg_agentic_advantage 16 + distribution_accessibility 12 +
    // technical_timing 12 + revenue_potential 8 + defensibility 8 +
    // cross_venture_reuse 5 + future_option_value 5 = 82
    const criterionScores = {
      customer_pain: 16,
      ehg_agentic_advantage: 16,
      distribution_accessibility: 12,
      technical_timing: 12,
      revenue_potential: 8,
      defensibility: 8,
      cross_venture_reuse: 5,
      future_option_value: 5,
    };
    const gateResults = Object.fromEntries(PASS_FAIL_GATES.map((g) => [g, true]));

    const result = scoreVenture({ criterionScores, gateResults, confidence: 0.55 });

    expect(result.raw_score).toBe(82);
    expect(result.evidence_confidence).toBe(0.55);
    expect(result.confidence_adjusted_score).toBe(45);
    expect(result.overall_recommendation).toBe('pass');
  });

  it('a failed gate overrides a ~90 weighted score -- overall_recommendation is not a pass', () => {
    const criterionScores = {
      customer_pain: 18,
      ehg_agentic_advantage: 18,
      distribution_accessibility: 14,
      technical_timing: 14,
      revenue_potential: 9,
      defensibility: 9,
      cross_venture_reuse: 4,
      future_option_value: 4,
    }; // sums to 90
    const gateResults = Object.fromEntries(PASS_FAIL_GATES.map((g) => [g, true]));
    gateResults.security_viability = false;

    const result = scoreVenture({ criterionScores, gateResults, confidence: 0.9 });

    expect(result.raw_score).toBe(90);
    expect(result.gate_results.passed).toBe(false);
    expect(result.gate_results.failed_gates).toEqual(['security_viability']);
    expect(result.overall_recommendation).not.toBe('pass');
    expect(result.overall_recommendation).toBe('fail');
  });

  it('output is a structured shape, not a bare number', () => {
    const result = scoreVenture({ criterionScores: {}, gateResults: {}, confidence: 0.5 });
    expect(typeof result).toBe('object');
    expect(result).toHaveProperty('raw_score');
    expect(result).toHaveProperty('evidence_confidence');
    expect(result).toHaveProperty('confidence_adjusted_score');
    expect(result).toHaveProperty('gate_results');
  });
});

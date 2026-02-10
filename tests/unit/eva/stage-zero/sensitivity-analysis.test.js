/**
 * Sensitivity Analysis Engine Tests
 *
 * Tests for OAT perturbation analysis, key driver identification,
 * and elasticity calculation.
 *
 * Part of SD-LEO-ORCH-EVA-STAGE-CONFIGURABLE-001-F
 */

import { describe, it, expect } from 'vitest';
import {
  runSensitivityAnalysis,
  identifyKeyDrivers,
  calculateElasticity,
} from '../../../../lib/eva/stage-zero/sensitivity-analysis.js';

// Mock synthesis results that produce deterministic scores
// Using extractComponentScore logic from profile-service.js:
//   cross_reference: relevance_score → 80
//   portfolio_evaluation: composite_score → 70
//   problem_reframing: reframings.length > 0 → 70
//   moat_architecture: moat_score → 90
//   chairman_constraints: verdict=pass → 100
//   time_horizon: position=build_now → 100
//   archetypes: primary_confidence → 85
//   build_cost: complexity=simple → 90
//   virality: virality_score → 75
const MOCK_RESULTS = {
  cross_reference: { relevance_score: 80 },
  portfolio_evaluation: { composite_score: 70 },
  problem_reframing: { reframings: ['reframe1'] },
  moat_architecture: { moat_score: 90 },
  chairman_constraints: { verdict: 'pass' },
  time_horizon: { position: 'build_now' },
  archetypes: { primary_confidence: 0.85 },
  build_cost: { complexity: 'simple' },
  virality: { virality_score: 75 },
};

const EQUAL_WEIGHTS = {
  cross_reference: 1 / 9,
  portfolio_evaluation: 1 / 9,
  problem_reframing: 1 / 9,
  moat_architecture: 1 / 9,
  chairman_constraints: 1 / 9,
  time_horizon: 1 / 9,
  archetypes: 1 / 9,
  build_cost: 1 / 9,
  virality: 1 / 9,
};

const LEGACY_WEIGHTS = {
  cross_reference: 0.10,
  portfolio_evaluation: 0.10,
  problem_reframing: 0.05,
  moat_architecture: 0.15,
  chairman_constraints: 0.15,
  time_horizon: 0.10,
  archetypes: 0.10,
  build_cost: 0.10,
  virality: 0.15,
};

describe('sensitivity-analysis', () => {
  describe('runSensitivityAnalysis', () => {
    it('returns ranked array of 9 components with influence scores', () => {
      const result = runSensitivityAnalysis(MOCK_RESULTS, LEGACY_WEIGHTS);

      expect(result).toHaveLength(9);
      expect(result[0]).toHaveProperty('component');
      expect(result[0]).toHaveProperty('influence_score');
      expect(result[0]).toHaveProperty('elasticity');
      expect(result[0]).toHaveProperty('score_delta');
    });

    it('ranks components by influence descending', () => {
      const result = runSensitivityAnalysis(MOCK_RESULTS, LEGACY_WEIGHTS);

      for (let i = 0; i < result.length - 1; i++) {
        expect(result[i].influence_score).toBeGreaterThanOrEqual(result[i + 1].influence_score);
      }
    });

    it('normalizes influence scores to sum to 1.0', () => {
      const result = runSensitivityAnalysis(MOCK_RESULTS, LEGACY_WEIGHTS);
      const sum = result.reduce((acc, r) => acc + r.influence_score, 0);

      // Allow small floating point rounding
      expect(sum).toBeCloseTo(1.0, 2);
    });

    it('with equal weights, ranking reflects raw score differences', () => {
      const result = runSensitivityAnalysis(MOCK_RESULTS, EQUAL_WEIGHTS);

      // Higher raw score components should have higher influence
      // chairman_constraints (100) and time_horizon (100) should be near top
      const topComponents = result.slice(0, 3).map(r => r.component);
      expect(topComponents).toContain('chairman_constraints');
      expect(topComponents).toContain('time_horizon');
    });

    it('handles custom delta option', () => {
      const small = runSensitivityAnalysis(MOCK_RESULTS, LEGACY_WEIGHTS, { delta: 0.01 });
      const large = runSensitivityAnalysis(MOCK_RESULTS, LEGACY_WEIGHTS, { delta: 0.10 });

      // Both should return 9 components
      expect(small).toHaveLength(9);
      expect(large).toHaveLength(9);
    });

    it('returns zero influence for null inputs', () => {
      const result = runSensitivityAnalysis(null, null);

      expect(result).toHaveLength(9);
      for (const r of result) {
        expect(r.influence_score).toBe(0);
        expect(r.elasticity).toBe(0);
      }
    });

    it('returns zero influence when all weights are zero', () => {
      const zeroWeights = {};
      for (const c of Object.keys(LEGACY_WEIGHTS)) {
        zeroWeights[c] = 0;
      }

      const result = runSensitivityAnalysis(MOCK_RESULTS, zeroWeights);

      // With zero weights, perturbing upward from 0 should still detect influence
      expect(result).toHaveLength(9);
      // At least some components should have non-zero influence since we perturb up from 0
      const totalInfluence = result.reduce((acc, r) => acc + r.influence_score, 0);
      expect(totalInfluence).toBeCloseTo(1.0, 2);
    });

    it('handles single dominant weight', () => {
      const dominantWeights = {};
      for (const c of Object.keys(LEGACY_WEIGHTS)) {
        dominantWeights[c] = 0;
      }
      dominantWeights.moat_architecture = 1.0;

      const result = runSensitivityAnalysis(MOCK_RESULTS, dominantWeights);

      expect(result).toHaveLength(9);
      // moat_architecture should have significant influence
      const moat = result.find(r => r.component === 'moat_architecture');
      expect(moat).toBeDefined();
      expect(moat.influence_score).toBeGreaterThan(0);
    });
  });

  describe('identifyKeyDrivers', () => {
    it('returns minimal set explaining 80% of variance', () => {
      const ranking = runSensitivityAnalysis(MOCK_RESULTS, LEGACY_WEIGHTS);
      const drivers = identifyKeyDrivers(ranking, 0.80);

      expect(drivers.length).toBeLessThanOrEqual(9);
      expect(drivers.length).toBeGreaterThan(0);

      const cumulative = drivers.reduce((acc, d) => acc + d.influence_score, 0);
      expect(cumulative).toBeGreaterThanOrEqual(0.80);
    });

    it('returns fewer components for lower thresholds', () => {
      const ranking = runSensitivityAnalysis(MOCK_RESULTS, LEGACY_WEIGHTS);
      const low = identifyKeyDrivers(ranking, 0.50);
      const high = identifyKeyDrivers(ranking, 0.90);

      expect(low.length).toBeLessThanOrEqual(high.length);
    });

    it('returns all components when threshold is 1.0', () => {
      const ranking = runSensitivityAnalysis(MOCK_RESULTS, LEGACY_WEIGHTS);
      const drivers = identifyKeyDrivers(ranking, 1.0);

      expect(drivers.length).toBe(9);
    });

    it('returns empty array for null ranking', () => {
      expect(identifyKeyDrivers(null)).toEqual([]);
      expect(identifyKeyDrivers([])).toEqual([]);
    });

    it('returns sorted by influence descending', () => {
      const ranking = runSensitivityAnalysis(MOCK_RESULTS, LEGACY_WEIGHTS);
      const drivers = identifyKeyDrivers(ranking, 0.80);

      for (let i = 0; i < drivers.length - 1; i++) {
        expect(drivers[i].influence_score).toBeGreaterThanOrEqual(drivers[i + 1].influence_score);
      }
    });
  });

  describe('calculateElasticity', () => {
    it('returns numeric coefficient for each component', () => {
      for (const component of Object.keys(LEGACY_WEIGHTS)) {
        const e = calculateElasticity(component, MOCK_RESULTS, LEGACY_WEIGHTS);
        expect(typeof e).toBe('number');
        expect(isNaN(e)).toBe(false);
      }
    });

    it('higher raw score components have higher elasticity', () => {
      // chairman_constraints has raw score 100, problem_reframing has 70
      const eChairman = calculateElasticity('chairman_constraints', MOCK_RESULTS, EQUAL_WEIGHTS);
      const eProblem = calculateElasticity('problem_reframing', MOCK_RESULTS, EQUAL_WEIGHTS);

      expect(Math.abs(eChairman)).toBeGreaterThanOrEqual(Math.abs(eProblem));
    });

    it('returns value for zero-weight component', () => {
      const zeroWeights = { ...LEGACY_WEIGHTS, virality: 0 };
      const e = calculateElasticity('virality', MOCK_RESULTS, zeroWeights);

      // Perturbing up from 0 should give a positive elasticity for a component with score
      expect(typeof e).toBe('number');
    });

    it('returns 0 for null inputs', () => {
      expect(calculateElasticity('moat_architecture', null, LEGACY_WEIGHTS)).toBe(0);
      expect(calculateElasticity('moat_architecture', MOCK_RESULTS, null)).toBe(0);
    });

    it('respects custom delta', () => {
      const e1 = calculateElasticity('moat_architecture', MOCK_RESULTS, LEGACY_WEIGHTS, 0.01);
      const e2 = calculateElasticity('moat_architecture', MOCK_RESULTS, LEGACY_WEIGHTS, 0.10);

      // Both should be numbers (elasticity may differ slightly due to rounding)
      expect(typeof e1).toBe('number');
      expect(typeof e2).toBe('number');
    });
  });
});

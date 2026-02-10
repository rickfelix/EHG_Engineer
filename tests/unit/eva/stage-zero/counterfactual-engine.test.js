/**
 * Counterfactual Scoring Engine Tests
 *
 * Tests for single venture counterfactual, batch re-scoring,
 * predictive accuracy reporting, and persistence.
 *
 * Part of SD-LEO-ORCH-EVA-STAGE-CONFIGURABLE-001-I
 */

import { describe, it, expect, vi } from 'vitest';
import {
  generateCounterfactual,
  runBatchCounterfactual,
  generatePredictiveReport,
  persistCounterfactualResults,
} from '../../../../lib/eva/stage-zero/counterfactual-engine.js';

// Mock synthesis results (same as sensitivity-analysis tests)
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

const AGGRESSIVE_WEIGHTS = {
  cross_reference: 0.05,
  portfolio_evaluation: 0.05,
  problem_reframing: 0.05,
  moat_architecture: 0.20,
  chairman_constraints: 0.10,
  time_horizon: 0.05,
  archetypes: 0.10,
  build_cost: 0.05,
  virality: 0.35,
};

describe('counterfactual-engine', () => {
  describe('generateCounterfactual', () => {
    it('returns original, counterfactual, delta, and breakdown', () => {
      const result = generateCounterfactual({
        synthesisResults: MOCK_RESULTS,
        currentWeights: LEGACY_WEIGHTS,
        scenarioWeights: AGGRESSIVE_WEIGHTS,
      });

      expect(result).toHaveProperty('original_score');
      expect(result).toHaveProperty('counterfactual_score');
      expect(result).toHaveProperty('delta');
      expect(result).toHaveProperty('breakdown');
      expect(typeof result.original_score).toBe('number');
      expect(typeof result.counterfactual_score).toBe('number');
    });

    it('delta equals counterfactual minus original', () => {
      const result = generateCounterfactual({
        synthesisResults: MOCK_RESULTS,
        currentWeights: LEGACY_WEIGHTS,
        scenarioWeights: AGGRESSIVE_WEIGHTS,
      });

      expect(result.delta).toBe(result.counterfactual_score - result.original_score);
    });

    it('breakdown contains all 9 components', () => {
      const result = generateCounterfactual({
        synthesisResults: MOCK_RESULTS,
        currentWeights: LEGACY_WEIGHTS,
        scenarioWeights: AGGRESSIVE_WEIGHTS,
      });

      expect(result.breakdown).toHaveLength(9);
      const components = result.breakdown.map(b => b.component);
      expect(components).toContain('moat_architecture');
      expect(components).toContain('virality');
    });

    it('breakdown is sorted by absolute contribution delta', () => {
      const result = generateCounterfactual({
        synthesisResults: MOCK_RESULTS,
        currentWeights: LEGACY_WEIGHTS,
        scenarioWeights: AGGRESSIVE_WEIGHTS,
      });

      for (let i = 0; i < result.breakdown.length - 1; i++) {
        expect(Math.abs(result.breakdown[i].contribution_delta))
          .toBeGreaterThanOrEqual(Math.abs(result.breakdown[i + 1].contribution_delta));
      }
    });

    it('returns zero delta when weights are identical', () => {
      const result = generateCounterfactual({
        synthesisResults: MOCK_RESULTS,
        currentWeights: LEGACY_WEIGHTS,
        scenarioWeights: { ...LEGACY_WEIGHTS },
      });

      expect(result.delta).toBe(0);
      expect(result.original_score).toBe(result.counterfactual_score);
    });

    it('throws when synthesisResults is missing', () => {
      expect(() => generateCounterfactual({
        synthesisResults: null,
        currentWeights: LEGACY_WEIGHTS,
        scenarioWeights: AGGRESSIVE_WEIGHTS,
      })).toThrow('synthesisResults is required');
    });

    it('throws when weights are missing', () => {
      expect(() => generateCounterfactual({
        synthesisResults: MOCK_RESULTS,
        currentWeights: null,
        scenarioWeights: AGGRESSIVE_WEIGHTS,
      })).toThrow('Both currentWeights and scenarioWeights are required');
    });

    it('throws on negative weights', () => {
      expect(() => generateCounterfactual({
        synthesisResults: MOCK_RESULTS,
        currentWeights: LEGACY_WEIGHTS,
        scenarioWeights: { ...AGGRESSIVE_WEIGHTS, virality: -0.1 },
      })).toThrow('non-negative number');
    });

    it('throws when weights sum to zero', () => {
      const zeroWeights = {};
      for (const c of Object.keys(LEGACY_WEIGHTS)) zeroWeights[c] = 0;

      expect(() => generateCounterfactual({
        synthesisResults: MOCK_RESULTS,
        currentWeights: LEGACY_WEIGHTS,
        scenarioWeights: zeroWeights,
      })).toThrow('Sum of weights must be greater than 0');
    });

    it('each breakdown item has expected fields', () => {
      const result = generateCounterfactual({
        synthesisResults: MOCK_RESULTS,
        currentWeights: LEGACY_WEIGHTS,
        scenarioWeights: AGGRESSIVE_WEIGHTS,
      });

      for (const item of result.breakdown) {
        expect(item).toHaveProperty('component');
        expect(item).toHaveProperty('raw_score');
        expect(item).toHaveProperty('original_weight');
        expect(item).toHaveProperty('original_contribution');
        expect(item).toHaveProperty('counterfactual_weight');
        expect(item).toHaveProperty('counterfactual_contribution');
        expect(item).toHaveProperty('contribution_delta');
      }
    });
  });

  describe('runBatchCounterfactual', () => {
    const ventures = [
      { id: 'v1', synthesisResults: MOCK_RESULTS, currentWeights: LEGACY_WEIGHTS },
      { id: 'v2', synthesisResults: MOCK_RESULTS, currentWeights: LEGACY_WEIGHTS },
    ];

    const profiles = [
      { id: 'p1', name: 'Aggressive', weights: AGGRESSIVE_WEIGHTS },
      { id: 'p2', name: 'Legacy', weights: LEGACY_WEIGHTS },
    ];

    it('returns N×P results for N ventures and P profiles', () => {
      const results = runBatchCounterfactual({ ventures, profiles });

      // 2 ventures × 2 profiles = 4 results
      expect(results).toHaveLength(4);
    });

    it('each result has venture_id and profile_id', () => {
      const results = runBatchCounterfactual({ ventures, profiles });

      for (const r of results) {
        expect(r).toHaveProperty('venture_id');
        expect(r).toHaveProperty('profile_id');
        expect(r).toHaveProperty('profile_name');
        expect(r).toHaveProperty('original_score');
        expect(r).toHaveProperty('counterfactual_score');
        expect(r).toHaveProperty('delta');
      }
    });

    it('skips ventures with missing synthesis results', () => {
      const venturesWithMissing = [
        { id: 'v1', synthesisResults: MOCK_RESULTS, currentWeights: LEGACY_WEIGHTS },
        { id: 'v2', synthesisResults: null, currentWeights: LEGACY_WEIGHTS },
      ];

      const logger = { warn: vi.fn(), info: vi.fn() };
      const results = runBatchCounterfactual({ ventures: venturesWithMissing, profiles, logger });

      // Only v1 × 2 profiles = 2 results
      expect(results).toHaveLength(2);
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('v2'));
    });

    it('throws when ventures array is empty', () => {
      expect(() => runBatchCounterfactual({ ventures: [], profiles }))
        .toThrow('ventures array is required');
    });

    it('throws when profiles array is empty', () => {
      expect(() => runBatchCounterfactual({ ventures, profiles: [] }))
        .toThrow('profiles array is required');
    });

    it('same-weight profile produces zero delta', () => {
      const sameProfiles = [
        { id: 'p1', name: 'Same', weights: LEGACY_WEIGHTS },
      ];

      const results = runBatchCounterfactual({ ventures, profiles: sameProfiles });

      for (const r of results) {
        expect(r.delta).toBe(0);
      }
    });
  });

  describe('generatePredictiveReport', () => {
    it('returns profiles with accuracy metrics', () => {
      const cfResults = [
        { venture_id: 'v1', profile_id: 'p1', profile_name: 'Aggressive', counterfactual_score: 85 },
        { venture_id: 'v2', profile_id: 'p1', profile_name: 'Aggressive', counterfactual_score: 60 },
        { venture_id: 'v3', profile_id: 'p1', profile_name: 'Aggressive', counterfactual_score: 40 },
      ];

      const outcomes = {
        v1: 'completed',
        v2: 'parked',
        v3: 'killed',
      };

      const report = generatePredictiveReport(cfResults, outcomes);

      expect(report).toHaveProperty('profiles');
      expect(report).toHaveProperty('total_ventures');
      expect(report.total_ventures).toBe(3);

      const p1 = report.profiles.p1;
      expect(p1).toHaveProperty('accuracy');
      expect(p1).toHaveProperty('kendall_tau');
      expect(p1).toHaveProperty('concordant_pairs');
      expect(p1).toHaveProperty('discordant_pairs');
      expect(p1).toHaveProperty('tied_pairs');
      expect(p1.ventures_scored).toBe(3);
    });

    it('perfectly ordered scores produce accuracy 1.0', () => {
      const cfResults = [
        { venture_id: 'v1', profile_id: 'p1', profile_name: 'Test', counterfactual_score: 90 },
        { venture_id: 'v2', profile_id: 'p1', profile_name: 'Test', counterfactual_score: 50 },
        { venture_id: 'v3', profile_id: 'p1', profile_name: 'Test', counterfactual_score: 10 },
      ];

      const outcomes = { v1: 'completed', v2: 'parked', v3: 'killed' };
      const report = generatePredictiveReport(cfResults, outcomes);

      expect(report.profiles.p1.accuracy).toBe(1);
      expect(report.profiles.p1.kendall_tau).toBe(1);
    });

    it('perfectly inverted scores produce tau -1.0', () => {
      const cfResults = [
        { venture_id: 'v1', profile_id: 'p1', profile_name: 'Test', counterfactual_score: 10 },
        { venture_id: 'v2', profile_id: 'p1', profile_name: 'Test', counterfactual_score: 50 },
        { venture_id: 'v3', profile_id: 'p1', profile_name: 'Test', counterfactual_score: 90 },
      ];

      const outcomes = { v1: 'completed', v2: 'parked', v3: 'killed' };
      const report = generatePredictiveReport(cfResults, outcomes);

      expect(report.profiles.p1.accuracy).toBe(0);
      expect(report.profiles.p1.kendall_tau).toBe(-1);
    });

    it('returns empty report for null input', () => {
      const report = generatePredictiveReport(null, {});

      expect(report.total_ventures).toBe(0);
      expect(report.profiles).toEqual({});
    });

    it('handles multiple profiles in same result set', () => {
      const cfResults = [
        { venture_id: 'v1', profile_id: 'p1', profile_name: 'A', counterfactual_score: 80 },
        { venture_id: 'v2', profile_id: 'p1', profile_name: 'A', counterfactual_score: 40 },
        { venture_id: 'v1', profile_id: 'p2', profile_name: 'B', counterfactual_score: 60 },
        { venture_id: 'v2', profile_id: 'p2', profile_name: 'B', counterfactual_score: 70 },
      ];

      const outcomes = { v1: 'completed', v2: 'killed' };
      const report = generatePredictiveReport(cfResults, outcomes);

      expect(Object.keys(report.profiles)).toHaveLength(2);
      expect(report.profiles.p1).toBeDefined();
      expect(report.profiles.p2).toBeDefined();
    });

    it('unknown outcomes treated as neutral (0.5)', () => {
      const cfResults = [
        { venture_id: 'v1', profile_id: 'p1', profile_name: 'Test', counterfactual_score: 90 },
        { venture_id: 'v2', profile_id: 'p1', profile_name: 'Test', counterfactual_score: 10 },
      ];

      const outcomes = { v1: 'completed' }; // v2 missing → 0.5
      const report = generatePredictiveReport(cfResults, outcomes);

      expect(report.profiles.p1).toBeDefined();
      // v1: score=90, outcome=1.0; v2: score=10, outcome=0.5
      // concordant: higher score → better outcome → 1 pair concordant
      expect(report.profiles.p1.concordant_pairs).toBe(1);
    });
  });

  describe('persistCounterfactualResults', () => {
    it('upserts results to database', async () => {
      const mockUpsert = vi.fn().mockResolvedValue({ error: null });
      const supabase = {
        from: vi.fn().mockReturnValue({
          upsert: mockUpsert,
        }),
      };
      const logger = { info: vi.fn() };

      const results = [
        { venture_id: 'v1', profile_id: 'p1', original_score: 80, counterfactual_score: 85, delta: 5, breakdown: [] },
      ];

      const outcome = await persistCounterfactualResults({ supabase, logger }, results);

      expect(outcome.inserted).toBe(1);
      expect(outcome.skipped).toBe(0);
      expect(supabase.from).toHaveBeenCalledWith('counterfactual_scores');
    });

    it('counts errors as skipped', async () => {
      const mockUpsert = vi.fn().mockResolvedValue({ error: { message: 'fk violation' } });
      const supabase = {
        from: vi.fn().mockReturnValue({
          upsert: mockUpsert,
        }),
      };
      const logger = { info: vi.fn() };

      const results = [
        { venture_id: 'v1', profile_id: 'p1', original_score: 80, counterfactual_score: 85, delta: 5, breakdown: [] },
      ];

      const outcome = await persistCounterfactualResults({ supabase, logger }, results);

      expect(outcome.inserted).toBe(0);
      expect(outcome.skipped).toBe(1);
      expect(outcome.errors).toHaveLength(1);
    });

    it('throws when supabase is missing', async () => {
      await expect(persistCounterfactualResults({}, []))
        .rejects.toThrow('supabase client is required');
    });
  });
});

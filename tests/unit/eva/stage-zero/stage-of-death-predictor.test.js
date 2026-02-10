/**
 * Stage-of-Death Prediction Engine Tests
 *
 * Tests for death prediction, mortality curve building,
 * calibration, and persistence.
 *
 * Part of SD-LEO-ORCH-EVA-STAGE-CONFIGURABLE-001-J
 */

import { describe, it, expect, vi } from 'vitest';
import {
  predictStageOfDeath,
  buildMortalityCurve,
  calibratePredictions,
  persistPredictions,
  TOTAL_STAGES,
} from '../../../../lib/eva/stage-zero/stage-of-death-predictor.js';

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

const STRONG_SCORES = {
  cross_reference: 80,
  portfolio_evaluation: 70,
  problem_reframing: 70,
  moat_architecture: 90,
  chairman_constraints: 100,
  time_horizon: 100,
  archetypes: 85,
  build_cost: 90,
  virality: 75,
};

const WEAK_MOAT_SCORES = {
  cross_reference: 60,
  portfolio_evaluation: 50,
  problem_reframing: 40,
  moat_architecture: 25,
  chairman_constraints: 50,
  time_horizon: 75,
  archetypes: 60,
  build_cost: 70,
  virality: 30,
};

const ARCHETYPE_WITH_HISTORY = {
  archetype_key: 'democratizer',
  total_ventures: 15,
  graduated_count: 5,
  killed_count: 7,
  common_kill_stages: [5, 12],
  common_kill_reasons: ['Weak moat', 'Insufficient viral mechanics'],
};

const ARCHETYPE_NO_HISTORY = {
  archetype_key: 'new_archetype',
  total_ventures: 0,
  graduated_count: 0,
  killed_count: 0,
  common_kill_stages: [],
  common_kill_reasons: [],
};

describe('stage-of-death-predictor', () => {
  describe('predictStageOfDeath', () => {
    it('returns prediction with all required fields', () => {
      const result = predictStageOfDeath({
        archetype: 'democratizer',
        componentScores: STRONG_SCORES,
        profileWeights: LEGACY_WEIGHTS,
        archetypeData: ARCHETYPE_WITH_HISTORY,
      });

      expect(result).toHaveProperty('death_stage');
      expect(result).toHaveProperty('probability');
      expect(result).toHaveProperty('death_factors');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('mortality_curve');
      expect(result).toHaveProperty('message');
      expect(result).toHaveProperty('archetype', 'democratizer');
    });

    it('death_stage is between 1 and 25', () => {
      const result = predictStageOfDeath({
        archetype: 'democratizer',
        componentScores: WEAK_MOAT_SCORES,
        profileWeights: LEGACY_WEIGHTS,
        archetypeData: ARCHETYPE_WITH_HISTORY,
      });

      expect(result.death_stage).toBeGreaterThanOrEqual(1);
      expect(result.death_stage).toBeLessThanOrEqual(25);
    });

    it('probability is between 0 and 1', () => {
      const result = predictStageOfDeath({
        archetype: 'democratizer',
        componentScores: WEAK_MOAT_SCORES,
        profileWeights: LEGACY_WEIGHTS,
        archetypeData: ARCHETYPE_WITH_HISTORY,
      });

      expect(result.probability).toBeGreaterThanOrEqual(0);
      expect(result.probability).toBeLessThanOrEqual(1);
    });

    it('weak moat scores produce moat as top death factor', () => {
      const result = predictStageOfDeath({
        archetype: 'democratizer',
        componentScores: WEAK_MOAT_SCORES,
        profileWeights: LEGACY_WEIGHTS,
        archetypeData: ARCHETYPE_WITH_HISTORY,
      });

      expect(result.death_factors.length).toBeGreaterThan(0);
      // moat_architecture should be among top factors due to low score + high weight
      const moatFactor = result.death_factors.find(f => f.component === 'moat_architecture');
      expect(moatFactor).toBeDefined();
      expect(moatFactor.risk).toBeGreaterThan(0);
    });

    it('returns fallback prediction with null archetype data', () => {
      const result = predictStageOfDeath({
        archetype: 'unknown',
        componentScores: WEAK_MOAT_SCORES,
        profileWeights: LEGACY_WEIGHTS,
        archetypeData: null,
      });

      expect(result.death_stage).toBeGreaterThanOrEqual(1);
      expect(result.confidence).toBeLessThanOrEqual(0.3);
    });

    it('higher confidence with more historical data', () => {
      const withHistory = predictStageOfDeath({
        archetype: 'democratizer',
        componentScores: STRONG_SCORES,
        profileWeights: LEGACY_WEIGHTS,
        archetypeData: ARCHETYPE_WITH_HISTORY,
      });

      const withoutHistory = predictStageOfDeath({
        archetype: 'unknown',
        componentScores: STRONG_SCORES,
        profileWeights: LEGACY_WEIGHTS,
        archetypeData: ARCHETYPE_NO_HISTORY,
      });

      expect(withHistory.confidence).toBeGreaterThan(withoutHistory.confidence);
    });

    it('generates human-readable message', () => {
      const result = predictStageOfDeath({
        archetype: 'democratizer',
        componentScores: WEAK_MOAT_SCORES,
        profileWeights: LEGACY_WEIGHTS,
        archetypeData: ARCHETYPE_WITH_HISTORY,
      });

      expect(result.message).toContain('Democratizer');
      expect(result.message).toContain('Stage');
      expect(result.message).toContain('%');
    });

    it('death_factors has at most 5 entries', () => {
      const result = predictStageOfDeath({
        archetype: 'democratizer',
        componentScores: WEAK_MOAT_SCORES,
        profileWeights: LEGACY_WEIGHTS,
        archetypeData: ARCHETYPE_WITH_HISTORY,
      });

      expect(result.death_factors.length).toBeLessThanOrEqual(5);
    });

    it('throws when required params missing', () => {
      expect(() => predictStageOfDeath({
        archetype: null,
        componentScores: STRONG_SCORES,
        profileWeights: LEGACY_WEIGHTS,
      })).toThrow('required');
    });
  });

  describe('buildMortalityCurve', () => {
    it('returns 25 stage entries', () => {
      const curve = buildMortalityCurve({
        archetypeData: ARCHETYPE_WITH_HISTORY,
        profileWeights: LEGACY_WEIGHTS,
        componentScores: STRONG_SCORES,
      });

      expect(Object.keys(curve)).toHaveLength(25);
    });

    it('all mortality rates are non-negative', () => {
      const curve = buildMortalityCurve({
        archetypeData: ARCHETYPE_WITH_HISTORY,
        profileWeights: LEGACY_WEIGHTS,
        componentScores: STRONG_SCORES,
      });

      for (const rate of Object.values(curve)) {
        expect(rate).toBeGreaterThanOrEqual(0);
      }
    });

    it('total mortality sums to <= 1.0', () => {
      const curve = buildMortalityCurve({
        archetypeData: ARCHETYPE_WITH_HISTORY,
        profileWeights: LEGACY_WEIGHTS,
        componentScores: STRONG_SCORES,
      });

      const total = Object.values(curve).reduce((sum, v) => sum + v, 0);
      expect(total).toBeLessThanOrEqual(1.01); // Allow minor rounding
    });

    it('common_kill_stages have highest rates', () => {
      const curve = buildMortalityCurve({
        archetypeData: ARCHETYPE_WITH_HISTORY,
        profileWeights: LEGACY_WEIGHTS,
        componentScores: STRONG_SCORES,
      });

      // Stages 5 and 12 should be among the highest
      const stage5 = curve[5];
      const stage12 = curve[12];
      const avgOther = Object.entries(curve)
        .filter(([s]) => s !== '5' && s !== '12')
        .reduce((sum, [, v]) => sum + v, 0) / 23;

      expect(stage5).toBeGreaterThan(avgOther);
      expect(stage12).toBeGreaterThan(avgOther);
    });

    it('uses default distribution when no historical data', () => {
      const curve = buildMortalityCurve({
        archetypeData: null,
        profileWeights: LEGACY_WEIGHTS,
        componentScores: STRONG_SCORES,
      });

      // Default high-mortality stages: 5, 12, 18, 24
      expect(curve[5]).toBeGreaterThan(0);
      expect(curve[12]).toBeGreaterThan(0);
      expect(curve[18]).toBeGreaterThan(0);
    });

    it('weak scores amplify early-stage mortality', () => {
      const strongCurve = buildMortalityCurve({
        archetypeData: ARCHETYPE_WITH_HISTORY,
        profileWeights: LEGACY_WEIGHTS,
        componentScores: STRONG_SCORES,
      });

      const weakCurve = buildMortalityCurve({
        archetypeData: ARCHETYPE_WITH_HISTORY,
        profileWeights: LEGACY_WEIGHTS,
        componentScores: WEAK_MOAT_SCORES,
      });

      // Weak scores should have more early-stage mortality
      const earlyMortWeak = weakCurve[3] + weakCurve[4] + weakCurve[5] + weakCurve[6] + weakCurve[7];
      const earlyMortStrong = strongCurve[3] + strongCurve[4] + strongCurve[5] + strongCurve[6] + strongCurve[7];

      expect(earlyMortWeak).toBeGreaterThan(earlyMortStrong);
    });
  });

  describe('calibratePredictions', () => {
    it('returns accuracy metrics for killed ventures', () => {
      const predictions = [
        { venture_id: 'v1', predicted_stage: 5, actual_stage: 5, actual_outcome: 'killed', archetype: 'democratizer' },
        { venture_id: 'v2', predicted_stage: 12, actual_stage: 10, actual_outcome: 'killed', archetype: 'automator' },
        { venture_id: 'v3', predicted_stage: 8, actual_stage: 20, actual_outcome: 'completed', archetype: 'democratizer' },
      ];

      const result = calibratePredictions(predictions);

      expect(result).toHaveProperty('accuracy_score');
      expect(result).toHaveProperty('mean_absolute_error');
      expect(result).toHaveProperty('directional_accuracy');
      expect(result).toHaveProperty('total_predictions');
      expect(result.total_predictions).toBe(2); // Only killed ventures count
    });

    it('perfect predictions produce accuracy 1.0', () => {
      const predictions = [
        { venture_id: 'v1', predicted_stage: 5, actual_stage: 5, actual_outcome: 'killed', archetype: 'demo' },
        { venture_id: 'v2', predicted_stage: 12, actual_stage: 12, actual_outcome: 'killed', archetype: 'auto' },
      ];

      const result = calibratePredictions(predictions);

      expect(result.accuracy_score).toBe(1);
      expect(result.mean_absolute_error).toBe(0);
      expect(result.directional_accuracy).toBe(1);
    });

    it('error of 3 stages counts as directionally correct', () => {
      const predictions = [
        { venture_id: 'v1', predicted_stage: 5, actual_stage: 8, actual_outcome: 'killed', archetype: 'demo' },
      ];

      const result = calibratePredictions(predictions);

      expect(result.mean_absolute_error).toBe(3);
      expect(result.directional_accuracy).toBe(1); // Within 5 stages
    });

    it('returns empty report for null input', () => {
      const result = calibratePredictions(null);

      expect(result.total_predictions).toBe(0);
      expect(result.accuracy_score).toBe(0);
      expect(result.message).toContain('Insufficient');
    });

    it('returns empty report for empty array', () => {
      const result = calibratePredictions([]);

      expect(result.total_predictions).toBe(0);
      expect(result.message).toContain('Insufficient');
    });

    it('per_archetype breakdown is provided', () => {
      const predictions = [
        { venture_id: 'v1', predicted_stage: 5, actual_stage: 5, actual_outcome: 'killed', archetype: 'democratizer' },
        { venture_id: 'v2', predicted_stage: 12, actual_stage: 14, actual_outcome: 'killed', archetype: 'democratizer' },
        { venture_id: 'v3', predicted_stage: 8, actual_stage: 10, actual_outcome: 'killed', archetype: 'automator' },
      ];

      const result = calibratePredictions(predictions);

      expect(result.per_archetype.democratizer).toBeDefined();
      expect(result.per_archetype.automator).toBeDefined();
      expect(result.per_archetype.democratizer.predictions).toBe(2);
      expect(result.per_archetype.automator.predictions).toBe(1);
    });
  });

  describe('persistPredictions', () => {
    it('upserts predictions to database', async () => {
      const mockUpsert = vi.fn().mockResolvedValue({ error: null });
      const supabase = {
        from: vi.fn().mockReturnValue({ upsert: mockUpsert }),
      };
      const logger = { info: vi.fn() };

      const predictions = [
        {
          venture_id: 'v1',
          archetype: 'democratizer',
          profile_id: 'p1',
          death_stage: 5,
          probability: 0.8,
          death_factors: [],
          confidence: 0.7,
          mortality_curve: {},
        },
      ];

      const result = await persistPredictions({ supabase, logger }, predictions);

      expect(result.inserted).toBe(1);
      expect(supabase.from).toHaveBeenCalledWith('stage_of_death_predictions');
    });

    it('counts errors as skipped', async () => {
      const mockUpsert = vi.fn().mockResolvedValue({ error: { message: 'fk violation' } });
      const supabase = {
        from: vi.fn().mockReturnValue({ upsert: mockUpsert }),
      };
      const logger = { info: vi.fn() };

      const result = await persistPredictions({ supabase, logger }, [
        { venture_id: 'v1', archetype: 'demo', profile_id: 'p1', death_stage: 5, probability: 0.8, death_factors: [], confidence: 0.7, mortality_curve: {} },
      ]);

      expect(result.inserted).toBe(0);
      expect(result.skipped).toBe(1);
      expect(result.errors).toHaveLength(1);
    });

    it('throws when supabase is missing', async () => {
      await expect(persistPredictions({}, []))
        .rejects.toThrow('supabase client is required');
    });
  });
});

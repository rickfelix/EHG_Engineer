/**
 * Seed Evaluation Presets Tests
 *
 * Validates weight vectors, gate thresholds, and preset configuration
 * for the 6 seeded evaluation presets.
 *
 * Part of SD-LEO-ORCH-EVA-STAGE-CONFIGURABLE-001-L
 */

import { describe, it, expect } from 'vitest';

const REQUIRED_COMPONENTS = [
  'cross_reference',
  'portfolio_evaluation',
  'problem_reframing',
  'moat_architecture',
  'chairman_constraints',
  'time_horizon',
  'archetypes',
  'build_cost',
  'virality',
];

const REQUIRED_GATE_KEYS = ['overall_min', 'component_min', 'red_flag_max'];

const EXISTING_PROFILE_NAMES = ['balanced', 'aggressive_growth', 'capital_efficient'];

const PRESETS = {
  viral_first: {
    weights: { virality: 0.30, archetypes: 0.15, build_cost: 0.05, time_horizon: 0.05, cross_reference: 0.10, moat_architecture: 0.10, problem_reframing: 0.05, chairman_constraints: 0.15, portfolio_evaluation: 0.05 },
    gate_thresholds: { overall_min: 0.50, component_min: 0.30, red_flag_max: 0.12 },
    top_weight_component: 'virality',
  },
  moat_first: {
    weights: { virality: 0.10, archetypes: 0.05, build_cost: 0.10, time_horizon: 0.10, cross_reference: 0.05, moat_architecture: 0.30, problem_reframing: 0.10, chairman_constraints: 0.15, portfolio_evaluation: 0.05 },
    gate_thresholds: { overall_min: 0.55, component_min: 0.35, red_flag_max: 0.08 },
    top_weight_component: 'moat_architecture',
  },
  revenue_first: {
    weights: { virality: 0.10, archetypes: 0.05, build_cost: 0.20, time_horizon: 0.10, cross_reference: 0.05, moat_architecture: 0.15, problem_reframing: 0.05, chairman_constraints: 0.25, portfolio_evaluation: 0.05 },
    gate_thresholds: { overall_min: 0.55, component_min: 0.35, red_flag_max: 0.08 },
    top_weight_component: 'chairman_constraints',
  },
  portfolio_synergy: {
    weights: { virality: 0.05, archetypes: 0.10, build_cost: 0.05, time_horizon: 0.05, cross_reference: 0.20, moat_architecture: 0.10, problem_reframing: 0.05, chairman_constraints: 0.15, portfolio_evaluation: 0.25 },
    gate_thresholds: { overall_min: 0.50, component_min: 0.30, red_flag_max: 0.12 },
    top_weight_component: 'portfolio_evaluation',
  },
  speed_to_market: {
    weights: { virality: 0.15, archetypes: 0.05, build_cost: 0.25, time_horizon: 0.20, cross_reference: 0.05, moat_architecture: 0.10, problem_reframing: 0.05, chairman_constraints: 0.10, portfolio_evaluation: 0.05 },
    gate_thresholds: { overall_min: 0.45, component_min: 0.25, red_flag_max: 0.15 },
    top_weight_component: 'build_cost',
  },
  ehg_balanced: {
    weights: { virality: 0.15, archetypes: 0.08, build_cost: 0.10, time_horizon: 0.07, cross_reference: 0.10, moat_architecture: 0.15, problem_reframing: 0.05, chairman_constraints: 0.20, portfolio_evaluation: 0.10 },
    gate_thresholds: { overall_min: 0.55, component_min: 0.35, red_flag_max: 0.08 },
    top_weight_component: 'chairman_constraints',
  },
};

describe('seed-evaluation-presets', () => {
  describe('weight vector validation', () => {
    for (const [name, preset] of Object.entries(PRESETS)) {
      describe(`${name}`, () => {
        it('contains all 9 required components', () => {
          const keys = Object.keys(preset.weights);
          expect(keys).toHaveLength(9);
          for (const component of REQUIRED_COMPONENTS) {
            expect(preset.weights).toHaveProperty(component);
          }
        });

        it('all weights are non-negative and <= 1', () => {
          for (const [component, weight] of Object.entries(preset.weights)) {
            expect(weight, `${component} weight`).toBeGreaterThanOrEqual(0);
            expect(weight, `${component} weight`).toBeLessThanOrEqual(1);
          }
        });

        it('weights sum to 1.0 within tolerance', () => {
          const sum = Object.values(preset.weights).reduce((s, v) => s + v, 0);
          expect(sum).toBeGreaterThanOrEqual(0.999);
          expect(sum).toBeLessThanOrEqual(1.001);
        });

        it('top weight matches stated investment thesis', () => {
          const sorted = Object.entries(preset.weights).sort((a, b) => b[1] - a[1]);
          expect(sorted[0][0]).toBe(preset.top_weight_component);
        });
      });
    }
  });

  describe('gate thresholds validation', () => {
    for (const [name, preset] of Object.entries(PRESETS)) {
      describe(`${name}`, () => {
        it('contains all required gate keys', () => {
          for (const key of REQUIRED_GATE_KEYS) {
            expect(preset.gate_thresholds).toHaveProperty(key);
          }
        });

        it('all threshold values are within [0, 1]', () => {
          for (const [key, value] of Object.entries(preset.gate_thresholds)) {
            expect(value, `${key}`).toBeGreaterThanOrEqual(0);
            expect(value, `${key}`).toBeLessThanOrEqual(1);
          }
        });
      });
    }
  });

  describe('preset naming', () => {
    it('no preset names conflict with existing profiles', () => {
      for (const presetName of Object.keys(PRESETS)) {
        expect(EXISTING_PROFILE_NAMES).not.toContain(presetName);
      }
    });

    it('exactly 6 presets defined', () => {
      expect(Object.keys(PRESETS)).toHaveLength(6);
    });

    it('ehg_balanced is distinct from balanced', () => {
      expect(PRESETS).toHaveProperty('ehg_balanced');
      expect(Object.keys(PRESETS)).not.toContain('balanced');
    });
  });

  describe('scoring compatibility', () => {
    it('each preset produces different weighted scores for the same input', () => {
      const inputScores = {
        cross_reference: 72,
        portfolio_evaluation: 58,
        problem_reframing: 48,
        moat_architecture: 82,
        chairman_constraints: 77,
        time_horizon: 63,
        archetypes: 71,
        build_cost: 84,
        virality: 93,
      };

      const compositeScores = {};
      for (const [name, preset] of Object.entries(PRESETS)) {
        let score = 0;
        for (const component of REQUIRED_COMPONENTS) {
          score += inputScores[component] * preset.weights[component];
        }
        compositeScores[name] = Math.round(score * 100) / 100;
      }

      // All scores should be different (presets are meaningfully distinct)
      const uniqueScores = new Set(Object.values(compositeScores));
      expect(uniqueScores.size).toBe(6);
    });

    it('viral_first scores highest when virality is the strongest component', () => {
      const highVirality = {
        cross_reference: 50, portfolio_evaluation: 50, problem_reframing: 50,
        moat_architecture: 50, chairman_constraints: 50, time_horizon: 50,
        archetypes: 50, build_cost: 50, virality: 100,
      };

      const scores = {};
      for (const [name, preset] of Object.entries(PRESETS)) {
        let score = 0;
        for (const component of REQUIRED_COMPONENTS) {
          score += highVirality[component] * preset.weights[component];
        }
        scores[name] = score;
      }

      const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
      expect(sorted[0][0]).toBe('viral_first');
    });

    it('moat_first scores highest when moat is the strongest component', () => {
      const highMoat = {
        cross_reference: 50, portfolio_evaluation: 50, problem_reframing: 50,
        moat_architecture: 100, chairman_constraints: 50, time_horizon: 50,
        archetypes: 50, build_cost: 50, virality: 50,
      };

      const scores = {};
      for (const [name, preset] of Object.entries(PRESETS)) {
        let score = 0;
        for (const component of REQUIRED_COMPONENTS) {
          score += highMoat[component] * preset.weights[component];
        }
        scores[name] = score;
      }

      const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
      expect(sorted[0][0]).toBe('moat_first');
    });
  });
});

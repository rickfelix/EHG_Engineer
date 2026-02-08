/**
 * Unit tests for Stage 24 - Metrics & Learning template
 * Part of SD-LEO-FEAT-TMPL-LAUNCH-001
 *
 * Test Scenario: Stage 24 validation enforces AARRR framework metrics
 * (Acquisition, Activation, Retention, Revenue, Referral) with funnels
 * and optional learnings.
 *
 * @module tests/unit/eva/stage-templates/stage-24.test
 */

import { describe, it, expect } from 'vitest';
import stage24, { AARRR_CATEGORIES, MIN_METRICS_PER_CATEGORY, MIN_FUNNELS } from '../../../../lib/eva/stage-templates/stage-24.js';

describe('stage-24.js - Metrics & Learning template', () => {
  describe('Template metadata', () => {
    it('should have correct template structure', () => {
      expect(stage24.id).toBe('stage-24');
      expect(stage24.slug).toBe('metrics-learning');
      expect(stage24.title).toBe('Metrics & Learning');
      expect(stage24.version).toBe('1.0.0');
    });

    it('should have schema definition', () => {
      expect(stage24.schema).toBeDefined();
      expect(stage24.schema.aarrr).toBeDefined();
      expect(stage24.schema.funnels).toBeDefined();
      expect(stage24.schema.learnings).toBeDefined();
      expect(stage24.schema.total_metrics).toBeDefined();
      expect(stage24.schema.categories_complete).toBeDefined();
      expect(stage24.schema.funnel_count).toBeDefined();
      expect(stage24.schema.metrics_on_target).toBeDefined();
      expect(stage24.schema.metrics_below_target).toBeDefined();
    });

    it('should have defaultData', () => {
      expect(stage24.defaultData).toEqual({
        aarrr: {},
        funnels: [],
        learnings: [],
        total_metrics: 0,
        categories_complete: false,
        funnel_count: 0,
        metrics_on_target: 0,
        metrics_below_target: 0,
      });
    });

    it('should have validate function', () => {
      expect(typeof stage24.validate).toBe('function');
    });

    it('should have computeDerived function', () => {
      expect(typeof stage24.computeDerived).toBe('function');
    });

    it('should export constants', () => {
      expect(AARRR_CATEGORIES).toEqual(['acquisition', 'activation', 'retention', 'revenue', 'referral']);
      expect(MIN_METRICS_PER_CATEGORY).toBe(1);
      expect(MIN_FUNNELS).toBe(1);
    });
  });

  describe('validate() - AARRR object structure', () => {
    it('should fail for missing aarrr object', () => {
      const invalidData = {
        funnels: [{ name: 'Funnel 1', steps: ['Step 1', 'Step 2'] }],
      };
      const result = stage24.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('aarrr'))).toBe(true);
    });

    it('should fail for non-object aarrr', () => {
      const invalidData = {
        aarrr: 'not an object',
        funnels: [{ name: 'Funnel 1', steps: ['Step 1', 'Step 2'] }],
      };
      const result = stage24.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('aarrr'))).toBe(true);
    });
  });

  describe('validate() - AARRR categories', () => {
    it('should pass for valid AARRR metrics across all categories', () => {
      const validData = {
        aarrr: {
          acquisition: [{ name: 'Signups', value: 100, target: 150 }],
          activation: [{ name: 'First Action', value: 80, target: 90 }],
          retention: [{ name: '30-day retention', value: 70, target: 75 }],
          revenue: [{ name: 'MRR', value: 10000, target: 12000 }],
          referral: [{ name: 'Referral rate', value: 5, target: 10 }],
        },
        funnels: [{ name: 'Signup funnel', steps: ['Landing', 'Signup'] }],
      };
      const result = stage24.validate(validData);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should fail for missing acquisition category', () => {
      const invalidData = {
        aarrr: {
          activation: [{ name: 'First Action', value: 80, target: 90 }],
          retention: [{ name: '30-day retention', value: 70, target: 75 }],
          revenue: [{ name: 'MRR', value: 10000, target: 12000 }],
          referral: [{ name: 'Referral rate', value: 5, target: 10 }],
        },
        funnels: [{ name: 'Funnel', steps: ['A', 'B'] }],
      };
      const result = stage24.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('aarrr.acquisition'))).toBe(true);
    });

    it('should fail for empty acquisition array', () => {
      const invalidData = {
        aarrr: {
          acquisition: [],
          activation: [{ name: 'First Action', value: 80, target: 90 }],
          retention: [{ name: '30-day retention', value: 70, target: 75 }],
          revenue: [{ name: 'MRR', value: 10000, target: 12000 }],
          referral: [{ name: 'Referral rate', value: 5, target: 10 }],
        },
        funnels: [{ name: 'Funnel', steps: ['A', 'B'] }],
      };
      const result = stage24.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('aarrr.acquisition') && e.includes('at least 1'))).toBe(true);
    });

    it('should fail for metric missing name', () => {
      const invalidData = {
        aarrr: {
          acquisition: [{ value: 100, target: 150 }],
          activation: [{ name: 'First Action', value: 80, target: 90 }],
          retention: [{ name: '30-day retention', value: 70, target: 75 }],
          revenue: [{ name: 'MRR', value: 10000, target: 12000 }],
          referral: [{ name: 'Referral rate', value: 5, target: 10 }],
        },
        funnels: [{ name: 'Funnel', steps: ['A', 'B'] }],
      };
      const result = stage24.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('aarrr.acquisition[0].name'))).toBe(true);
    });

    it('should fail for metric missing value', () => {
      const invalidData = {
        aarrr: {
          acquisition: [{ name: 'Signups', target: 150 }],
          activation: [{ name: 'First Action', value: 80, target: 90 }],
          retention: [{ name: '30-day retention', value: 70, target: 75 }],
          revenue: [{ name: 'MRR', value: 10000, target: 12000 }],
          referral: [{ name: 'Referral rate', value: 5, target: 10 }],
        },
        funnels: [{ name: 'Funnel', steps: ['A', 'B'] }],
      };
      const result = stage24.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('aarrr.acquisition[0].value'))).toBe(true);
    });

    it('should fail for metric missing target', () => {
      const invalidData = {
        aarrr: {
          acquisition: [{ name: 'Signups', value: 100 }],
          activation: [{ name: 'First Action', value: 80, target: 90 }],
          retention: [{ name: '30-day retention', value: 70, target: 75 }],
          revenue: [{ name: 'MRR', value: 10000, target: 12000 }],
          referral: [{ name: 'Referral rate', value: 5, target: 10 }],
        },
        funnels: [{ name: 'Funnel', steps: ['A', 'B'] }],
      };
      const result = stage24.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('aarrr.acquisition[0].target'))).toBe(true);
    });

    it('should allow multiple metrics per category', () => {
      const validData = {
        aarrr: {
          acquisition: [
            { name: 'Signups', value: 100, target: 150 },
            { name: 'Traffic', value: 1000, target: 1200 },
          ],
          activation: [{ name: 'First Action', value: 80, target: 90 }],
          retention: [{ name: '30-day retention', value: 70, target: 75 }],
          revenue: [{ name: 'MRR', value: 10000, target: 12000 }],
          referral: [{ name: 'Referral rate', value: 5, target: 10 }],
        },
        funnels: [{ name: 'Funnel', steps: ['A', 'B'] }],
      };
      const result = stage24.validate(validData);
      expect(result.valid).toBe(true);
    });

    it('should pass with optional trend_window_days', () => {
      const validData = {
        aarrr: {
          acquisition: [{ name: 'Signups', value: 100, target: 150, trend_window_days: 30 }],
          activation: [{ name: 'First Action', value: 80, target: 90 }],
          retention: [{ name: '30-day retention', value: 70, target: 75 }],
          revenue: [{ name: 'MRR', value: 10000, target: 12000 }],
          referral: [{ name: 'Referral rate', value: 5, target: 10 }],
        },
        funnels: [{ name: 'Funnel', steps: ['A', 'B'] }],
      };
      const result = stage24.validate(validData);
      expect(result.valid).toBe(true);
    });
  });

  describe('validate() - Funnels', () => {
    const validAARRR = {
      acquisition: [{ name: 'Signups', value: 100, target: 150 }],
      activation: [{ name: 'First Action', value: 80, target: 90 }],
      retention: [{ name: '30-day retention', value: 70, target: 75 }],
      revenue: [{ name: 'MRR', value: 10000, target: 12000 }],
      referral: [{ name: 'Referral rate', value: 5, target: 10 }],
    };

    it('should fail for missing funnels', () => {
      const invalidData = {
        aarrr: validAARRR,
      };
      const result = stage24.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('funnels'))).toBe(true);
    });

    it('should fail for empty funnels array', () => {
      const invalidData = {
        aarrr: validAARRR,
        funnels: [],
      };
      const result = stage24.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('funnels') && e.includes('at least 1'))).toBe(true);
    });

    it('should fail for funnel missing name', () => {
      const invalidData = {
        aarrr: validAARRR,
        funnels: [{ steps: ['Step 1', 'Step 2'] }],
      };
      const result = stage24.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('funnels[0].name'))).toBe(true);
    });

    it('should fail for funnel missing steps', () => {
      const invalidData = {
        aarrr: validAARRR,
        funnels: [{ name: 'Signup funnel' }],
      };
      const result = stage24.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('funnels[0].steps'))).toBe(true);
    });

    it('should fail for funnel with < 2 steps', () => {
      const invalidData = {
        aarrr: validAARRR,
        funnels: [{ name: 'Signup funnel', steps: ['Landing'] }],
      };
      const result = stage24.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('funnels[0].steps') && e.includes('at least 2'))).toBe(true);
    });

    it('should pass for valid funnel with 2 steps', () => {
      const validData = {
        aarrr: validAARRR,
        funnels: [{ name: 'Signup funnel', steps: ['Landing', 'Signup'] }],
      };
      const result = stage24.validate(validData);
      expect(result.valid).toBe(true);
    });

    it('should pass for multiple funnels', () => {
      const validData = {
        aarrr: validAARRR,
        funnels: [
          { name: 'Signup funnel', steps: ['Landing', 'Signup', 'Activation'] },
          { name: 'Purchase funnel', steps: ['Browse', 'Cart', 'Checkout', 'Purchase'] },
        ],
      };
      const result = stage24.validate(validData);
      expect(result.valid).toBe(true);
    });
  });

  describe('validate() - Learnings (optional)', () => {
    const validData = {
      aarrr: {
        acquisition: [{ name: 'Signups', value: 100, target: 150 }],
        activation: [{ name: 'First Action', value: 80, target: 90 }],
        retention: [{ name: '30-day retention', value: 70, target: 75 }],
        revenue: [{ name: 'MRR', value: 10000, target: 12000 }],
        referral: [{ name: 'Referral rate', value: 5, target: 10 }],
      },
      funnels: [{ name: 'Funnel', steps: ['A', 'B'] }],
    };

    it('should pass without learnings (optional)', () => {
      const result = stage24.validate(validData);
      expect(result.valid).toBe(true);
    });

    it('should pass with empty learnings array', () => {
      const dataWithLearnings = {
        ...validData,
        learnings: [],
      };
      const result = stage24.validate(dataWithLearnings);
      expect(result.valid).toBe(true);
    });

    it('should pass with valid learnings', () => {
      const dataWithLearnings = {
        ...validData,
        learnings: [
          { insight: 'Users drop off at step 2', action: 'Simplify onboarding', category: 'activation' },
        ],
      };
      const result = stage24.validate(dataWithLearnings);
      expect(result.valid).toBe(true);
    });

    it('should fail for learning missing insight', () => {
      const invalidData = {
        ...validData,
        learnings: [{ action: 'Simplify onboarding' }],
      };
      const result = stage24.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('learnings[0].insight'))).toBe(true);
    });

    it('should fail for learning missing action', () => {
      const invalidData = {
        ...validData,
        learnings: [{ insight: 'Users drop off at step 2' }],
      };
      const result = stage24.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('learnings[0].action'))).toBe(true);
    });

    it('should pass with optional category field', () => {
      const dataWithLearnings = {
        ...validData,
        learnings: [
          { insight: 'Users drop off at step 2', action: 'Simplify onboarding', category: 'activation' },
        ],
      };
      const result = stage24.validate(dataWithLearnings);
      expect(result.valid).toBe(true);
    });
  });

  describe('computeDerived() - Metric counts', () => {
    it('should calculate total_metrics correctly', () => {
      const data = {
        aarrr: {
          acquisition: [{ name: 'M1', value: 100, target: 150 }, { name: 'M2', value: 200, target: 250 }],
          activation: [{ name: 'M3', value: 80, target: 90 }],
          retention: [{ name: 'M4', value: 70, target: 75 }],
          revenue: [{ name: 'M5', value: 10000, target: 12000 }],
          referral: [{ name: 'M6', value: 5, target: 10 }],
        },
        funnels: [{ name: 'Funnel', steps: ['A', 'B'] }],
      };
      const result = stage24.computeDerived(data);
      expect(result.total_metrics).toBe(6);
    });

    it('should set categories_complete to true when all categories have metrics', () => {
      const data = {
        aarrr: {
          acquisition: [{ name: 'M1', value: 100, target: 150 }],
          activation: [{ name: 'M2', value: 80, target: 90 }],
          retention: [{ name: 'M3', value: 70, target: 75 }],
          revenue: [{ name: 'M4', value: 10000, target: 12000 }],
          referral: [{ name: 'M5', value: 5, target: 10 }],
        },
        funnels: [{ name: 'Funnel', steps: ['A', 'B'] }],
      };
      const result = stage24.computeDerived(data);
      expect(result.categories_complete).toBe(true);
    });

    it('should set categories_complete to false when missing categories', () => {
      const data = {
        aarrr: {
          acquisition: [{ name: 'M1', value: 100, target: 150 }],
          activation: [{ name: 'M2', value: 80, target: 90 }],
          retention: [],
          revenue: [],
          referral: [],
        },
        funnels: [{ name: 'Funnel', steps: ['A', 'B'] }],
      };
      const result = stage24.computeDerived(data);
      expect(result.categories_complete).toBe(false);
    });

    it('should calculate funnel_count correctly', () => {
      const data = {
        aarrr: {
          acquisition: [{ name: 'M1', value: 100, target: 150 }],
          activation: [{ name: 'M2', value: 80, target: 90 }],
          retention: [{ name: 'M3', value: 70, target: 75 }],
          revenue: [{ name: 'M4', value: 10000, target: 12000 }],
          referral: [{ name: 'M5', value: 5, target: 10 }],
        },
        funnels: [
          { name: 'F1', steps: ['A', 'B'] },
          { name: 'F2', steps: ['C', 'D'] },
          { name: 'F3', steps: ['E', 'F'] },
        ],
      };
      const result = stage24.computeDerived(data);
      expect(result.funnel_count).toBe(3);
    });
  });

  describe('computeDerived() - Target tracking', () => {
    it('should calculate metrics_on_target correctly', () => {
      const data = {
        aarrr: {
          acquisition: [
            { name: 'M1', value: 150, target: 150 }, // on target
            { name: 'M2', value: 200, target: 150 }, // above target
          ],
          activation: [{ name: 'M3', value: 80, target: 90 }], // below
          retention: [{ name: 'M4', value: 75, target: 75 }], // on target
          revenue: [{ name: 'M5', value: 10000, target: 12000 }], // below
          referral: [{ name: 'M6', value: 15, target: 10 }], // above
        },
        funnels: [{ name: 'Funnel', steps: ['A', 'B'] }],
      };
      const result = stage24.computeDerived(data);
      expect(result.metrics_on_target).toBe(4); // M1, M2, M4, M6
    });

    it('should calculate metrics_below_target correctly', () => {
      const data = {
        aarrr: {
          acquisition: [
            { name: 'M1', value: 150, target: 150 }, // on target
            { name: 'M2', value: 200, target: 150 }, // above target
          ],
          activation: [{ name: 'M3', value: 80, target: 90 }], // below
          retention: [{ name: 'M4', value: 75, target: 75 }], // on target
          revenue: [{ name: 'M5', value: 10000, target: 12000 }], // below
          referral: [{ name: 'M6', value: 15, target: 10 }], // above
        },
        funnels: [{ name: 'Funnel', steps: ['A', 'B'] }],
      };
      const result = stage24.computeDerived(data);
      expect(result.metrics_below_target).toBe(2); // M3, M5
    });

    it('should handle all metrics on target', () => {
      const data = {
        aarrr: {
          acquisition: [{ name: 'M1', value: 150, target: 150 }],
          activation: [{ name: 'M2', value: 90, target: 90 }],
          retention: [{ name: 'M3', value: 75, target: 75 }],
          revenue: [{ name: 'M4', value: 12000, target: 12000 }],
          referral: [{ name: 'M5', value: 10, target: 10 }],
        },
        funnels: [{ name: 'Funnel', steps: ['A', 'B'] }],
      };
      const result = stage24.computeDerived(data);
      expect(result.metrics_on_target).toBe(5);
      expect(result.metrics_below_target).toBe(0);
    });

    it('should handle all metrics below target', () => {
      const data = {
        aarrr: {
          acquisition: [{ name: 'M1', value: 100, target: 150 }],
          activation: [{ name: 'M2', value: 80, target: 90 }],
          retention: [{ name: 'M3', value: 70, target: 75 }],
          revenue: [{ name: 'M4', value: 10000, target: 12000 }],
          referral: [{ name: 'M5', value: 5, target: 10 }],
        },
        funnels: [{ name: 'Funnel', steps: ['A', 'B'] }],
      };
      const result = stage24.computeDerived(data);
      expect(result.metrics_on_target).toBe(0);
      expect(result.metrics_below_target).toBe(5);
    });
  });

  describe('computeDerived() - Data preservation', () => {
    it('should preserve original data fields', () => {
      const data = {
        aarrr: {
          acquisition: [{ name: 'M1', value: 100, target: 150 }],
          activation: [{ name: 'M2', value: 80, target: 90 }],
          retention: [{ name: 'M3', value: 70, target: 75 }],
          revenue: [{ name: 'M4', value: 10000, target: 12000 }],
          referral: [{ name: 'M5', value: 5, target: 10 }],
        },
        funnels: [{ name: 'Funnel', steps: ['A', 'B', 'C'] }],
        learnings: [{ insight: 'Test insight', action: 'Test action' }],
      };
      const result = stage24.computeDerived(data);
      expect(result.aarrr).toEqual(data.aarrr);
      expect(result.funnels).toEqual(data.funnels);
      expect(result.learnings).toEqual(data.learnings);
    });
  });

  describe('Edge cases', () => {
    it('should handle null data in validate', () => {
      const result = stage24.validate(null);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle undefined data in validate', () => {
      const result = stage24.validate(undefined);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle empty aarrr object in computeDerived', () => {
      const data = {
        aarrr: {},
        funnels: [{ name: 'Funnel', steps: ['A', 'B'] }],
      };
      const result = stage24.computeDerived(data);
      expect(result.total_metrics).toBe(0);
      expect(result.categories_complete).toBe(false);
    });

    it('should handle empty funnels array in computeDerived', () => {
      const data = {
        aarrr: {
          acquisition: [{ name: 'M1', value: 100, target: 150 }],
          activation: [{ name: 'M2', value: 80, target: 90 }],
          retention: [{ name: 'M3', value: 70, target: 75 }],
          revenue: [{ name: 'M4', value: 10000, target: 12000 }],
          referral: [{ name: 'M5', value: 5, target: 10 }],
        },
        funnels: [],
      };
      const result = stage24.computeDerived(data);
      expect(result.funnel_count).toBe(0);
    });
  });

  describe('Integration: validate + computeDerived workflow', () => {
    it('should work together for valid data', () => {
      const data = {
        aarrr: {
          acquisition: [{ name: 'Signups', value: 100, target: 150 }],
          activation: [{ name: 'First Action', value: 80, target: 90 }],
          retention: [{ name: '30-day retention', value: 70, target: 75 }],
          revenue: [{ name: 'MRR', value: 10000, target: 12000 }],
          referral: [{ name: 'Referral rate', value: 5, target: 10 }],
        },
        funnels: [
          { name: 'Signup funnel', steps: ['Landing', 'Signup', 'Activation'] },
          { name: 'Purchase funnel', steps: ['Browse', 'Cart', 'Purchase'] },
        ],
        learnings: [
          { insight: 'Users drop off at step 2', action: 'Simplify onboarding', category: 'activation' },
        ],
      };
      const validation = stage24.validate(data);
      expect(validation.valid).toBe(true);

      const computed = stage24.computeDerived(data);
      expect(computed.total_metrics).toBe(5);
      expect(computed.categories_complete).toBe(true);
      expect(computed.funnel_count).toBe(2);
      expect(computed.metrics_below_target).toBe(5);
    });

    it('should not require validation before computeDerived (decoupled)', () => {
      const data = {
        aarrr: {
          acquisition: [{ name: 'M1', value: 100, target: 150 }],
          activation: [],
          retention: [],
          revenue: [],
          referral: [],
        },
        funnels: [{ name: 'Funnel', steps: ['A'] }], // Invalid: < 2 steps
      };
      const computed = stage24.computeDerived(data);
      expect(computed.total_metrics).toBe(1);
      expect(computed.categories_complete).toBe(false);
    });
  });
});

/**
 * Unit tests for Stage 03 - Individual Validation (KILL GATE) template (v2.0.0)
 * Phase: THE TRUTH (Stages 1-5)
 * Part of SD-EVA-FEAT-TEMPLATES-TRUTH-001
 *
 * Tests: 3-way kill gate (pass/revise/kill), updated thresholds (50 per-metric),
 *        competitorEntities validation, rollupDimensions, confidenceScores
 *
 * @module tests/unit/eva/stage-templates/stage-03.test
 */

import { describe, it, expect } from 'vitest';
import stage03, {
  evaluateKillGate,
  METRICS,
  PASS_THRESHOLD,
  REVISE_THRESHOLD,
  METRIC_THRESHOLD,
  THREAT_LEVELS,
} from '../../../../lib/eva/stage-templates/stage-03.js';

describe('stage-03.js - Individual Validation template', () => {
  describe('Template metadata', () => {
    it('should have correct template structure', () => {
      expect(stage03.id).toBe('stage-03');
      expect(stage03.slug).toBe('validation');
      expect(stage03.title).toBe('Kill Gate');
      expect(stage03.version).toBe('2.0.0');
    });

    it('should have correct thresholds', () => {
      expect(PASS_THRESHOLD).toBe(70);
      expect(REVISE_THRESHOLD).toBe(50);
      expect(METRIC_THRESHOLD).toBe(50);
    });

    it('should have all 6 metrics defined', () => {
      expect(METRICS).toEqual([
        'marketFit', 'customerNeed', 'momentum',
        'revenuePotential', 'competitiveBarrier', 'executionFeasibility',
      ]);
    });

    it('should export THREAT_LEVELS', () => {
      expect(THREAT_LEVELS).toEqual(['H', 'M', 'L']);
    });

    it('should have analysisStep attached', () => {
      expect(typeof stage03.analysisStep).toBe('function');
    });
  });

  const makeValidMetrics = (overrides = {}) => ({
    marketFit: 75, customerNeed: 80, momentum: 70,
    revenuePotential: 85, competitiveBarrier: 65, executionFeasibility: 90,
    ...overrides,
  });

  describe('validate() - 6-metric validation', () => {
    it('should pass for valid data with all metrics in range', () => {
      const result = stage03.validate(makeValidMetrics());
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should pass for all metrics at boundary values (0 and 100)', () => {
      const data = {
        marketFit: 0, customerNeed: 100, momentum: 0,
        revenuePotential: 100, competitiveBarrier: 0, executionFeasibility: 100,
      };
      const result = stage03.validate(data);
      expect(result.valid).toBe(true);
    });

    it('should fail for missing metric', () => {
      const data = makeValidMetrics();
      delete data.marketFit;
      const result = stage03.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('marketFit');
    });

    it('should fail for metric below 0', () => {
      const result = stage03.validate(makeValidMetrics({ marketFit: -1 }));
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('marketFit');
    });

    it('should fail for metric above 100', () => {
      const result = stage03.validate(makeValidMetrics({ customerNeed: 101 }));
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('customerNeed');
    });

    it('should fail for non-integer metric', () => {
      const result = stage03.validate(makeValidMetrics({ momentum: 75.5 }));
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('momentum');
    });
  });

  describe('validate() - competitorEntities (optional)', () => {
    it('should pass when competitorEntities is omitted', () => {
      const result = stage03.validate(makeValidMetrics());
      expect(result.valid).toBe(true);
    });

    it('should pass for valid competitorEntities', () => {
      const data = {
        ...makeValidMetrics(),
        competitorEntities: [
          { name: 'Acme', positioning: 'Market leader', threat_level: 'H' },
        ],
      };
      const result = stage03.validate(data);
      expect(result.valid).toBe(true);
    });

    it('should fail for competitorEntity with missing name', () => {
      const data = {
        ...makeValidMetrics(),
        competitorEntities: [
          { positioning: 'Leader', threat_level: 'H' },
        ],
      };
      const result = stage03.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('competitorEntities[0].name');
    });

    it('should fail for invalid threat_level', () => {
      const data = {
        ...makeValidMetrics(),
        competitorEntities: [
          { name: 'Acme', positioning: 'Leader', threat_level: 'X' },
        ],
      };
      const result = stage03.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('competitorEntities[0].threat_level');
    });
  });

  describe('evaluateKillGate() - 3-way gate', () => {
    it('should pass when overallScore >= 70 and all metrics >= 50', () => {
      const result = evaluateKillGate({
        overallScore: 75,
        metrics: {
          marketFit: 70, customerNeed: 75, momentum: 80,
          revenuePotential: 75, competitiveBarrier: 70, executionFeasibility: 80,
        },
      });
      expect(result.decision).toBe('pass');
      expect(result.blockProgression).toBe(false);
      expect(result.reasons).toEqual([]);
    });

    it('should pass at exact boundary (70 overall, all metrics 50)', () => {
      const result = evaluateKillGate({
        overallScore: 70,
        metrics: {
          marketFit: 50, customerNeed: 50, momentum: 50,
          revenuePotential: 50, competitiveBarrier: 50, executionFeasibility: 50,
        },
      });
      expect(result.decision).toBe('pass');
      expect(result.blockProgression).toBe(false);
    });

    it('should revise when overallScore 50-69 and no metric below 50', () => {
      const result = evaluateKillGate({
        overallScore: 65,
        metrics: {
          marketFit: 65, customerNeed: 65, momentum: 65,
          revenuePotential: 65, competitiveBarrier: 65, executionFeasibility: 65,
        },
      });
      expect(result.decision).toBe('revise');
      expect(result.blockProgression).toBe(true);
      expect(result.reasons).toHaveLength(1);
      expect(result.reasons[0].type).toBe('overall_in_revise_band');
    });

    it('should revise at exact boundary (50 overall, all metrics 50)', () => {
      const result = evaluateKillGate({
        overallScore: 50,
        metrics: {
          marketFit: 50, customerNeed: 50, momentum: 50,
          revenuePotential: 50, competitiveBarrier: 50, executionFeasibility: 50,
        },
      });
      expect(result.decision).toBe('revise');
      expect(result.blockProgression).toBe(true);
    });

    it('should kill when overallScore < 50', () => {
      const result = evaluateKillGate({
        overallScore: 49,
        metrics: {
          marketFit: 50, customerNeed: 50, momentum: 50,
          revenuePotential: 50, competitiveBarrier: 50, executionFeasibility: 50,
        },
      });
      expect(result.decision).toBe('kill');
      expect(result.blockProgression).toBe(true);
      expect(result.reasons.some(r => r.type === 'overall_below_kill_threshold')).toBe(true);
    });

    it('should kill when ANY metric < 50 (even if overall >= 70)', () => {
      const result = evaluateKillGate({
        overallScore: 75,
        metrics: {
          marketFit: 90, customerNeed: 90, momentum: 90,
          revenuePotential: 90, competitiveBarrier: 90, executionFeasibility: 49,
        },
      });
      expect(result.decision).toBe('kill');
      expect(result.blockProgression).toBe(true);
      expect(result.reasons[0].type).toBe('metric_below_threshold');
      expect(result.reasons[0].metric).toBe('executionFeasibility');
    });

    it('should kill when multiple metrics < 50', () => {
      const result = evaluateKillGate({
        overallScore: 70,
        metrics: {
          marketFit: 49, customerNeed: 48, momentum: 90,
          revenuePotential: 90, competitiveBarrier: 90, executionFeasibility: 90,
        },
      });
      expect(result.decision).toBe('kill');
      expect(result.reasons.some(r => r.metric === 'marketFit')).toBe(true);
      expect(result.reasons.some(r => r.metric === 'customerNeed')).toBe(true);
    });

    it('should be pure (no side effects)', () => {
      const input = {
        overallScore: 75,
        metrics: { marketFit: 70, customerNeed: 75, momentum: 80,
          revenuePotential: 75, competitiveBarrier: 70, executionFeasibility: 80 },
      };
      const original = JSON.parse(JSON.stringify(input));
      evaluateKillGate(input);
      expect(input).toEqual(original);
    });
  });

  describe('computeDerived()', () => {
    it('should compute overallScore as rounded average', () => {
      const result = stage03.computeDerived(makeValidMetrics());
      // (75+80+70+85+65+90)/6 = 465/6 = 77.5 → 78
      expect(result.overallScore).toBe(78);
    });

    it('should compute rollupDimensions', () => {
      const result = stage03.computeDerived(makeValidMetrics());
      expect(result.rollupDimensions.market).toBe(Math.round((75 + 70) / 2)); // marketFit + momentum
      expect(result.rollupDimensions.technical).toBe(Math.round((90 + 65) / 2)); // executionFeasibility + competitiveBarrier
      expect(result.rollupDimensions.financial).toBe(Math.round((85 + 80) / 2)); // revenuePotential + customerNeed
    });

    it('should include pass decision when all criteria met', () => {
      const result = stage03.computeDerived(makeValidMetrics());
      expect(result.decision).toBe('pass');
      expect(result.blockProgression).toBe(false);
    });

    it('should include revise decision for borderline scores', () => {
      const data = {
        marketFit: 60, customerNeed: 60, momentum: 60,
        revenuePotential: 60, competitiveBarrier: 60, executionFeasibility: 60,
      };
      const result = stage03.computeDerived(data);
      expect(result.overallScore).toBe(60);
      expect(result.decision).toBe('revise');
    });

    it('should include kill decision when metric < 50', () => {
      const result = stage03.computeDerived(makeValidMetrics({ executionFeasibility: 49 }));
      expect(result.decision).toBe('kill');
      expect(result.blockProgression).toBe(true);
    });

    it('should preserve original input fields', () => {
      const data = makeValidMetrics();
      const result = stage03.computeDerived(data);
      expect(result.marketFit).toBe(75);
      expect(result.customerNeed).toBe(80);
    });

    it('should not mutate original data', () => {
      const data = makeValidMetrics();
      const original = { ...data };
      stage03.computeDerived(data);
      expect(data).toEqual(original);
    });
  });
});

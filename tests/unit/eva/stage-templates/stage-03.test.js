/**
 * Unit tests for Stage 03 - Market Validation template
 * Part of SD-LEO-FEAT-TMPL-TRUTH-001
 *
 * Test Scenario TS-3: Stage 03 kill gate triggers when any metric is below 40
 *                    (even if overall >= 70)
 *
 * @module tests/unit/eva/stage-templates/stage-03.test
 */

import { describe, it, expect } from 'vitest';
import stage03, {
  evaluateKillGate,
  METRICS,
  OVERALL_THRESHOLD,
  METRIC_THRESHOLD,
} from '../../../../lib/eva/stage-templates/stage-03.js';

describe('stage-03.js - Market Validation template', () => {
  describe('Template metadata', () => {
    it('should have correct template structure', () => {
      expect(stage03.id).toBe('stage-03');
      expect(stage03.slug).toBe('validation');
      expect(stage03.title).toBe('Market Validation');
      expect(stage03.version).toBe('1.0.0');
    });

    it('should have correct thresholds', () => {
      expect(OVERALL_THRESHOLD).toBe(70);
      expect(METRIC_THRESHOLD).toBe(40);
    });

    it('should have all 6 metrics defined', () => {
      expect(METRICS).toEqual([
        'marketFit',
        'customerNeed',
        'momentum',
        'revenuePotential',
        'competitiveBarrier',
        'executionFeasibility',
      ]);
      expect(METRICS).toHaveLength(6);
    });
  });

  describe('validate() - 6-metric validation', () => {
    const validData = {
      marketFit: 75,
      customerNeed: 80,
      momentum: 70,
      revenuePotential: 85,
      competitiveBarrier: 65,
      executionFeasibility: 90,
    };

    it('should pass for valid data with all metrics in range', () => {
      const result = stage03.validate(validData);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should pass for all metrics at boundary values (0 and 100)', () => {
      const data = {
        marketFit: 0,
        customerNeed: 100,
        momentum: 0,
        revenuePotential: 100,
        competitiveBarrier: 0,
        executionFeasibility: 100,
      };
      const result = stage03.validate(data);
      expect(result.valid).toBe(true);
    });

    it('should fail for missing metric', () => {
      const data = { ...validData };
      delete data.marketFit;
      const result = stage03.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('marketFit');
      expect(result.errors[0]).toContain('is required');
    });

    it('should fail for metric below 0', () => {
      const data = { ...validData, marketFit: -1 };
      const result = stage03.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('marketFit');
      expect(result.errors[0]).toContain('must be between 0 and 100');
    });

    it('should fail for metric above 100', () => {
      const data = { ...validData, customerNeed: 101 };
      const result = stage03.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('customerNeed');
      expect(result.errors[0]).toContain('must be between 0 and 100');
    });

    it('should fail for non-integer metric', () => {
      const data = { ...validData, momentum: 75.5 };
      const result = stage03.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('momentum');
      expect(result.errors[0]).toContain('must be an integer');
    });

    it('should collect errors for all invalid metrics', () => {
      const data = {
        marketFit: -1,
        customerNeed: 101,
        momentum: 75.5,
        revenuePotential: 'invalid',
      };
      const result = stage03.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe('evaluateKillGate() - TS-3: Kill gate logic', () => {
    it('should pass when overallScore >= 70 and all metrics >= 40', () => {
      const result = evaluateKillGate({
        overallScore: 75,
        metrics: {
          marketFit: 70,
          customerNeed: 75,
          momentum: 80,
          revenuePotential: 75,
          competitiveBarrier: 70,
          executionFeasibility: 80,
        },
      });
      expect(result.decision).toBe('pass');
      expect(result.blockProgression).toBe(false);
      expect(result.reasons).toEqual([]);
    });

    it('should pass at exact threshold boundaries (70 overall, all metrics 40)', () => {
      const result = evaluateKillGate({
        overallScore: 70,
        metrics: {
          marketFit: 40,
          customerNeed: 40,
          momentum: 40,
          revenuePotential: 40,
          competitiveBarrier: 40,
          executionFeasibility: 40,
        },
      });
      expect(result.decision).toBe('pass');
      expect(result.blockProgression).toBe(false);
      expect(result.reasons).toEqual([]);
    });

    it('should kill when overallScore is 69 (one below threshold)', () => {
      const result = evaluateKillGate({
        overallScore: 69,
        metrics: {
          marketFit: 69,
          customerNeed: 69,
          momentum: 69,
          revenuePotential: 69,
          competitiveBarrier: 69,
          executionFeasibility: 69,
        },
      });
      expect(result.decision).toBe('kill');
      expect(result.blockProgression).toBe(true);
      expect(result.reasons).toHaveLength(1);
      expect(result.reasons[0].type).toBe('overall_below_threshold');
      expect(result.reasons[0].actual).toBe(69);
      expect(result.reasons[0].threshold).toBe(70);
    });

    it('should kill when ANY single metric is 39 (even if overall >= 70)', () => {
      const result = evaluateKillGate({
        overallScore: 75, // Overall is good
        metrics: {
          marketFit: 90,
          customerNeed: 90,
          momentum: 90,
          revenuePotential: 90,
          competitiveBarrier: 90,
          executionFeasibility: 39, // This one metric fails
        },
      });
      expect(result.decision).toBe('kill');
      expect(result.blockProgression).toBe(true);
      expect(result.reasons).toHaveLength(1);
      expect(result.reasons[0].type).toBe('metric_below_40');
      expect(result.reasons[0].metric).toBe('executionFeasibility');
      expect(result.reasons[0].actual).toBe(39);
      expect(result.reasons[0].threshold).toBe(40);
    });

    it('should kill when multiple metrics are below 40', () => {
      const result = evaluateKillGate({
        overallScore: 70,
        metrics: {
          marketFit: 39,
          customerNeed: 38,
          momentum: 90,
          revenuePotential: 90,
          competitiveBarrier: 90,
          executionFeasibility: 90,
        },
      });
      expect(result.decision).toBe('kill');
      expect(result.blockProgression).toBe(true);
      expect(result.reasons).toHaveLength(2);
      expect(result.reasons.some(r => r.metric === 'marketFit')).toBe(true);
      expect(result.reasons.some(r => r.metric === 'customerNeed')).toBe(true);
    });

    it('should kill when both overall < 70 AND metrics < 40', () => {
      const result = evaluateKillGate({
        overallScore: 65,
        metrics: {
          marketFit: 35,
          customerNeed: 40,
          momentum: 70,
          revenuePotential: 80,
          competitiveBarrier: 75,
          executionFeasibility: 90,
        },
      });
      expect(result.decision).toBe('kill');
      expect(result.blockProgression).toBe(true);
      expect(result.reasons.length).toBeGreaterThanOrEqual(2);
      expect(result.reasons.some(r => r.type === 'overall_below_threshold')).toBe(true);
      expect(result.reasons.some(r => r.type === 'metric_below_40')).toBe(true);
    });

    it('should provide detailed reason messages', () => {
      const result = evaluateKillGate({
        overallScore: 65,
        metrics: {
          marketFit: 35,
          customerNeed: 70,
          momentum: 70,
          revenuePotential: 70,
          competitiveBarrier: 70,
          executionFeasibility: 70,
        },
      });
      expect(result.reasons[0].message).toContain('Overall score 65 is below threshold 70');
      expect(result.reasons[1].message).toContain('marketFit score 35 is below per-metric threshold 40');
    });

    it('should be pure (no side effects)', () => {
      const input = {
        overallScore: 75,
        metrics: {
          marketFit: 70,
          customerNeed: 75,
          momentum: 80,
          revenuePotential: 75,
          competitiveBarrier: 70,
          executionFeasibility: 80,
        },
      };
      const original = JSON.parse(JSON.stringify(input));
      evaluateKillGate(input);
      expect(input).toEqual(original);
    });
  });

  describe('computeDerived() - Integration with kill gate', () => {
    it('should compute overallScore as rounded average', () => {
      const data = {
        marketFit: 70,
        customerNeed: 75,
        momentum: 80,
        revenuePotential: 75,
        competitiveBarrier: 70,
        executionFeasibility: 80,
      };
      const result = stage03.computeDerived(data);
      // (70+75+80+75+70+80)/6 = 450/6 = 75
      expect(result.overallScore).toBe(75);
    });

    it('should include pass decision when all criteria met', () => {
      const data = {
        marketFit: 70,
        customerNeed: 75,
        momentum: 80,
        revenuePotential: 75,
        competitiveBarrier: 70,
        executionFeasibility: 80,
      };
      const result = stage03.computeDerived(data);
      expect(result.decision).toBe('pass');
      expect(result.blockProgression).toBe(false);
      expect(result.reasons).toEqual([]);
    });

    it('should include kill decision when overall < 70', () => {
      const data = {
        marketFit: 69,
        customerNeed: 69,
        momentum: 69,
        revenuePotential: 69,
        competitiveBarrier: 69,
        executionFeasibility: 69,
      };
      const result = stage03.computeDerived(data);
      expect(result.overallScore).toBe(69);
      expect(result.decision).toBe('kill');
      expect(result.blockProgression).toBe(true);
      expect(result.reasons).toHaveLength(1);
    });

    it('should include kill decision when any metric < 40', () => {
      const data = {
        marketFit: 90,
        customerNeed: 90,
        momentum: 90,
        revenuePotential: 90,
        competitiveBarrier: 90,
        executionFeasibility: 39,
      };
      const result = stage03.computeDerived(data);
      expect(result.overallScore).toBe(82); // (90*5+39)/6 = 489/6 = 81.5 rounds to 82
      expect(result.decision).toBe('kill');
      expect(result.blockProgression).toBe(true);
    });

    it('should preserve original input fields', () => {
      const data = {
        marketFit: 70,
        customerNeed: 75,
        momentum: 80,
        revenuePotential: 75,
        competitiveBarrier: 70,
        executionFeasibility: 80,
      };
      const result = stage03.computeDerived(data);
      expect(result.marketFit).toBe(70);
      expect(result.customerNeed).toBe(75);
      expect(result.momentum).toBe(80);
      expect(result.revenuePotential).toBe(75);
      expect(result.competitiveBarrier).toBe(70);
      expect(result.executionFeasibility).toBe(80);
    });

    it('should not mutate original data', () => {
      const data = {
        marketFit: 70,
        customerNeed: 75,
        momentum: 80,
        revenuePotential: 75,
        competitiveBarrier: 70,
        executionFeasibility: 80,
      };
      const original = { ...data };
      stage03.computeDerived(data);
      expect(data).toEqual(original);
    });
  });

  describe('Integration: validate + computeDerived workflow', () => {
    it('should work together for passing scenario', () => {
      const data = {
        marketFit: 75,
        customerNeed: 80,
        momentum: 70,
        revenuePotential: 85,
        competitiveBarrier: 65,
        executionFeasibility: 90,
      };
      const validation = stage03.validate(data);
      expect(validation.valid).toBe(true);

      const computed = stage03.computeDerived(data);
      expect(computed.decision).toBe('pass');
      expect(computed.blockProgression).toBe(false);
    });

    it('should work together for kill scenario (low metric)', () => {
      const data = {
        marketFit: 90,
        customerNeed: 90,
        momentum: 90,
        revenuePotential: 90,
        competitiveBarrier: 90,
        executionFeasibility: 39,
      };
      const validation = stage03.validate(data);
      expect(validation.valid).toBe(true); // Valid input

      const computed = stage03.computeDerived(data);
      expect(computed.decision).toBe('kill'); // But fails kill gate
      expect(computed.blockProgression).toBe(true);
    });
  });
});

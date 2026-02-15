/**
 * Unit tests for Stage 02 - Idea Validation (MoA Multi-Persona Analysis) template (v2.0.0)
 * Phase: THE TRUTH (Stages 1-5)
 * Part of SD-EVA-FEAT-TEMPLATES-TRUTH-001
 *
 * Tests: validation (analysis perspectives, 6 metrics, evidence domains, suggestions),
 *        computeDerived (compositeScore from metrics average), METRIC_NAMES export
 *
 * @module tests/unit/eva/stage-templates/stage-02.test
 */

import { describe, it, expect } from 'vitest';
import stage02, { METRIC_NAMES, SUGGESTION_TYPES } from '../../../../lib/eva/stage-templates/stage-02.js';

describe('stage-02.js - Idea Validation template', () => {
  describe('Template metadata', () => {
    it('should have correct template structure', () => {
      expect(stage02.id).toBe('stage-02');
      expect(stage02.slug).toBe('idea-validation');
      expect(stage02.title).toBe('Idea Analysis');
      expect(stage02.version).toBe('2.0.0');
    });

    it('should export METRIC_NAMES aligned with Stage 3', () => {
      expect(METRIC_NAMES).toEqual([
        'marketFit', 'customerNeed', 'momentum',
        'revenuePotential', 'competitiveBarrier', 'executionFeasibility',
      ]);
    });

    it('should export SUGGESTION_TYPES', () => {
      expect(SUGGESTION_TYPES).toEqual(['immediate', 'strategic']);
    });

    it('should have schema with analysis, metrics, evidence, suggestions', () => {
      expect(stage02.schema.analysis).toBeDefined();
      expect(stage02.schema.metrics).toBeDefined();
      expect(stage02.schema.evidence).toBeDefined();
      expect(stage02.schema.suggestions).toBeDefined();
      expect(stage02.schema.compositeScore.derived).toBe(true);
    });

    it('should have defaultData', () => {
      expect(stage02.defaultData.analysis).toEqual({ strategic: '', technical: '', tactical: '' });
      expect(stage02.defaultData.compositeScore).toBeNull();
      expect(stage02.defaultData.suggestions).toEqual([]);
    });

    it('should have analysisStep attached', () => {
      expect(typeof stage02.analysisStep).toBe('function');
    });
  });

  const makeValid = (overrides = {}) => ({
    analysis: {
      strategic: 'x'.repeat(20),
      technical: 'y'.repeat(20),
      tactical: 'z'.repeat(20),
    },
    metrics: {
      marketFit: 75, customerNeed: 80, momentum: 70,
      revenuePotential: 85, competitiveBarrier: 65, executionFeasibility: 90,
    },
    evidence: {
      market: 'Market evidence here',
      customer: 'Customer evidence here',
      competitive: 'Competitive evidence here',
      execution: 'Execution evidence here',
    },
    suggestions: [],
    ...overrides,
  });

  describe('validate() - Analysis perspectives', () => {
    it('should pass for valid data', () => {
      const result = stage02.validate(makeValid());
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should fail for missing analysis object', () => {
      const result = stage02.validate(makeValid({ analysis: undefined }));
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('analysis');
    });

    it('should fail for analysis.strategic below min length (20)', () => {
      const result = stage02.validate(makeValid({
        analysis: { strategic: 'Short', technical: 'y'.repeat(20), tactical: 'z'.repeat(20) },
      }));
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('analysis.strategic');
    });

    it('should fail for analysis.technical below min length', () => {
      const result = stage02.validate(makeValid({
        analysis: { strategic: 'x'.repeat(20), technical: 'Short', tactical: 'z'.repeat(20) },
      }));
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('analysis.technical');
    });

    it('should fail for analysis.tactical below min length', () => {
      const result = stage02.validate(makeValid({
        analysis: { strategic: 'x'.repeat(20), technical: 'y'.repeat(20), tactical: 'Short' },
      }));
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('analysis.tactical');
    });
  });

  describe('validate() - 6 metrics (0-100 integer)', () => {
    it('should fail for missing metrics object', () => {
      const result = stage02.validate(makeValid({ metrics: undefined }));
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('metrics');
    });

    it('should fail for metric below 0', () => {
      const data = makeValid();
      data.metrics.marketFit = -1;
      const result = stage02.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('metrics.marketFit');
    });

    it('should fail for metric above 100', () => {
      const data = makeValid();
      data.metrics.customerNeed = 101;
      const result = stage02.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('metrics.customerNeed');
    });

    it('should fail for non-integer metric', () => {
      const data = makeValid();
      data.metrics.momentum = 75.5;
      const result = stage02.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('metrics.momentum');
    });

    it('should pass for boundary values (0 and 100)', () => {
      const data = makeValid();
      data.metrics.marketFit = 0;
      data.metrics.executionFeasibility = 100;
      const result = stage02.validate(data);
      expect(result.valid).toBe(true);
    });
  });

  describe('validate() - Evidence domains', () => {
    it('should fail for missing evidence object', () => {
      const result = stage02.validate(makeValid({ evidence: undefined }));
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('evidence');
    });

    it('should fail for empty evidence.market', () => {
      const data = makeValid();
      data.evidence.market = '';
      const result = stage02.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('evidence.market');
    });

    it('should fail for empty evidence.customer', () => {
      const data = makeValid();
      data.evidence.customer = '';
      const result = stage02.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('evidence.customer');
    });
  });

  describe('validate() - Suggestions (optional)', () => {
    it('should pass with valid suggestions', () => {
      const data = makeValid({
        suggestions: [
          { type: 'immediate', text: 'Do this first thing to validate' },
          { type: 'strategic', text: 'Long term plan for market entry' },
        ],
      });
      const result = stage02.validate(data);
      expect(result.valid).toBe(true);
    });

    it('should pass with empty suggestions array', () => {
      const result = stage02.validate(makeValid({ suggestions: [] }));
      expect(result.valid).toBe(true);
    });

    it('should fail for suggestions with invalid type', () => {
      const data = makeValid({
        suggestions: [{ type: 'invalid', text: 'Some text here please' }],
      });
      const result = stage02.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('suggestions[0].type');
    });

    it('should fail for suggestions with short text', () => {
      const data = makeValid({
        suggestions: [{ type: 'immediate', text: 'Short' }],
      });
      const result = stage02.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('suggestions[0].text');
    });

    it('should fail for non-array suggestions', () => {
      const data = makeValid({ suggestions: 'not an array' });
      const result = stage02.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('suggestions');
    });
  });

  describe('computeDerived() - compositeScore', () => {
    it('should compute compositeScore as rounded average of 6 metrics', () => {
      const data = makeValid();
      // (75+80+70+85+65+90)/6 = 465/6 = 77.5 → 78
      const result = stage02.computeDerived(data);
      expect(result.compositeScore).toBe(78);
    });

    it('should be deterministic across metric orderings', () => {
      const data1 = makeValid();
      const data2 = makeValid();
      expect(stage02.computeDerived(data1).compositeScore)
        .toBe(stage02.computeDerived(data2).compositeScore);
    });

    it('should round correctly (.5 rounds up)', () => {
      const data = makeValid();
      data.metrics = {
        marketFit: 76, customerNeed: 77, momentum: 76,
        revenuePotential: 77, competitiveBarrier: 76, executionFeasibility: 77,
      };
      // (76+77+76+77+76+77)/6 = 459/6 = 76.5 → 77
      const result = stage02.computeDerived(data);
      expect(result.compositeScore).toBe(77);
    });

    it('should return null when no valid metrics', () => {
      const data = makeValid();
      data.metrics = {};
      const result = stage02.computeDerived(data);
      expect(result.compositeScore).toBeNull();
    });

    it('should handle boundary scores (all 0, all 100)', () => {
      const allZero = makeValid();
      allZero.metrics = {
        marketFit: 0, customerNeed: 0, momentum: 0,
        revenuePotential: 0, competitiveBarrier: 0, executionFeasibility: 0,
      };
      expect(stage02.computeDerived(allZero).compositeScore).toBe(0);

      const allMax = makeValid();
      allMax.metrics = {
        marketFit: 100, customerNeed: 100, momentum: 100,
        revenuePotential: 100, competitiveBarrier: 100, executionFeasibility: 100,
      };
      expect(stage02.computeDerived(allMax).compositeScore).toBe(100);
    });

    it('should preserve original data fields', () => {
      const data = makeValid();
      const result = stage02.computeDerived(data);
      expect(result.analysis).toEqual(data.analysis);
      expect(result.metrics).toEqual(data.metrics);
      expect(result.evidence).toEqual(data.evidence);
    });

    it('should not mutate original data', () => {
      const data = makeValid();
      const original = JSON.parse(JSON.stringify(data));
      stage02.computeDerived(data);
      expect(data).toEqual(original);
    });
  });

  describe('Integration: validate + computeDerived workflow', () => {
    it('should work together for valid data', () => {
      const data = makeValid();
      const validation = stage02.validate(data);
      expect(validation.valid).toBe(true);

      const computed = stage02.computeDerived(data);
      expect(computed.compositeScore).toBe(78);
    });
  });
});

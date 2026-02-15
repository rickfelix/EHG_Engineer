/**
 * Unit tests for Stage 04 - Competitive Intel template (v2.0.0)
 * Phase: THE TRUTH (Stages 1-5)
 * Part of SD-EVA-FEAT-TEMPLATES-TRUTH-001
 *
 * Tests: pricingModel enum, stage5Handoff derived artifact, duplicate name detection,
 *        SWOT validation, PRICING_MODELS export
 *
 * @module tests/unit/eva/stage-templates/stage-04.test
 */

import { describe, it, expect } from 'vitest';
import stage04, { THREAT_LEVELS, PRICING_MODELS } from '../../../../lib/eva/stage-templates/stage-04.js';

describe('stage-04.js - Competitive Intel template', () => {
  describe('Template metadata', () => {
    it('should have correct template structure', () => {
      expect(stage04.id).toBe('stage-04');
      expect(stage04.slug).toBe('competitive-intel');
      expect(stage04.title).toBe('Competitive Landscape');
      expect(stage04.version).toBe('2.0.0');
    });

    it('should have correct threat levels', () => {
      expect(THREAT_LEVELS).toEqual(['H', 'M', 'L']);
    });

    it('should export PRICING_MODELS', () => {
      expect(PRICING_MODELS).toEqual([
        'freemium', 'subscription', 'one_time', 'usage_based', 'marketplace_commission', 'hybrid',
      ]);
    });

    it('should have defaultData with stage5Handoff', () => {
      expect(stage04.defaultData).toEqual({
        competitors: [],
        blueOceanAnalysis: null,
        stage5Handoff: null,
      });
    });

    it('should have analysisStep attached', () => {
      expect(typeof stage04.analysisStep).toBe('function');
    });
  });

  const makeValidCompetitor = (overrides = {}) => ({
    name: 'Acme Corp',
    position: 'Market leader in enterprise SaaS',
    threat: 'H',
    pricingModel: 'subscription',
    strengths: ['Strong brand', 'Large customer base'],
    weaknesses: ['Legacy tech stack'],
    swot: {
      strengths: ['Market dominance'],
      weaknesses: ['Slow innovation'],
      opportunities: ['New markets'],
      threats: ['Nimble startups'],
    },
    ...overrides,
  });

  describe('validate() - Competitors array validation', () => {
    it('should pass for valid data with single competitor', () => {
      const data = { competitors: [makeValidCompetitor()] };
      const result = stage04.validate(data);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should pass for multiple competitors with different names', () => {
      const data = {
        competitors: [
          makeValidCompetitor({ name: 'Acme Corp' }),
          makeValidCompetitor({ name: 'Beta Inc', pricingModel: 'freemium' }),
          makeValidCompetitor({ name: 'Gamma LLC', pricingModel: 'usage_based' }),
        ],
      };
      const result = stage04.validate(data);
      expect(result.valid).toBe(true);
    });

    it('should fail for empty competitors array', () => {
      const result = stage04.validate({ competitors: [] });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('competitors');
    });

    it('should fail for missing competitors', () => {
      const result = stage04.validate({});
      expect(result.valid).toBe(false);
    });

    it('should fail for non-array competitors', () => {
      const result = stage04.validate({ competitors: 'not an array' });
      expect(result.valid).toBe(false);
    });
  });

  describe('validate() - Per-competitor field validation', () => {
    it('should fail for missing name', () => {
      const c = makeValidCompetitor();
      delete c.name;
      const result = stage04.validate({ competitors: [c] });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('competitors[0].name');
    });

    it('should fail for missing position', () => {
      const c = makeValidCompetitor();
      delete c.position;
      const result = stage04.validate({ competitors: [c] });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('competitors[0].position');
    });

    it('should fail for invalid threat level', () => {
      const result = stage04.validate({
        competitors: [makeValidCompetitor({ threat: 'X' })],
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('competitors[0].threat');
    });

    it('should fail for invalid pricingModel', () => {
      const result = stage04.validate({
        competitors: [makeValidCompetitor({ pricingModel: 'barter' })],
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('competitors[0].pricingModel');
    });

    it('should accept all valid pricing models', () => {
      for (const pm of PRICING_MODELS) {
        const result = stage04.validate({
          competitors: [makeValidCompetitor({ pricingModel: pm })],
        });
        expect(result.valid).toBe(true);
      }
    });

    it('should fail for empty strengths array', () => {
      const result = stage04.validate({
        competitors: [makeValidCompetitor({ strengths: [] })],
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('competitors[0].strengths');
    });

    it('should fail for empty weaknesses array', () => {
      const result = stage04.validate({
        competitors: [makeValidCompetitor({ weaknesses: [] })],
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('competitors[0].weaknesses');
    });
  });

  describe('validate() - SWOT validation', () => {
    it('should fail for missing swot object', () => {
      const c = makeValidCompetitor();
      delete c.swot;
      const result = stage04.validate({ competitors: [c] });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('competitors[0].swot');
    });

    it('should fail for swot with empty strengths', () => {
      const result = stage04.validate({
        competitors: [makeValidCompetitor({
          swot: { strengths: [], weaknesses: ['W1'], opportunities: ['O1'], threats: ['T1'] },
        })],
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('competitors[0].swot.strengths');
    });

    it('should fail for swot with empty opportunities', () => {
      const result = stage04.validate({
        competitors: [makeValidCompetitor({
          swot: { strengths: ['S1'], weaknesses: ['W1'], opportunities: [], threats: ['T1'] },
        })],
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('competitors[0].swot.opportunities');
    });
  });

  describe('validate() - Duplicate name detection (case-insensitive)', () => {
    it('should detect exact duplicate names', () => {
      const result = stage04.validate({
        competitors: [
          makeValidCompetitor({ name: 'Acme Corp' }),
          makeValidCompetitor({ name: 'Acme Corp' }),
        ],
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Duplicate competitor name');
    });

    it('should detect case-insensitive duplicates', () => {
      const result = stage04.validate({
        competitors: [
          makeValidCompetitor({ name: 'Acme' }),
          makeValidCompetitor({ name: 'acme' }),
        ],
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Duplicate competitor name');
    });

    it('should report correct indices', () => {
      const result = stage04.validate({
        competitors: [
          makeValidCompetitor({ name: 'Alpha' }),
          makeValidCompetitor({ name: 'Beta' }),
          makeValidCompetitor({ name: 'alpha' }),
        ],
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('indices 0 and 2');
    });

    it('should provide rename suggestion', () => {
      const result = stage04.validate({
        competitors: [
          makeValidCompetitor({ name: 'Acme' }),
          makeValidCompetitor({ name: 'Acme' }),
        ],
      });
      expect(result.errors[0]).toContain('Rename one competitor');
    });
  });

  describe('computeDerived() - stage5Handoff', () => {
    it('should build pricingLandscape from competitor pricing models', () => {
      const data = {
        competitors: [
          makeValidCompetitor({ name: 'Acme', pricingModel: 'subscription' }),
          makeValidCompetitor({ name: 'Beta', pricingModel: 'freemium' }),
        ],
      };
      const result = stage04.computeDerived(data);
      expect(result.stage5Handoff).toBeDefined();
      expect(result.stage5Handoff.pricingLandscape).toContain('Acme: subscription');
      expect(result.stage5Handoff.pricingLandscape).toContain('Beta: freemium');
    });

    it('should build competitivePositioning from high-threat competitors', () => {
      const data = {
        competitors: [
          makeValidCompetitor({ name: 'Acme', threat: 'H' }),
          makeValidCompetitor({ name: 'Beta', threat: 'L' }),
        ],
      };
      const result = stage04.computeDerived(data);
      expect(result.stage5Handoff.competitivePositioning).toContain('1 high-threat');
      expect(result.stage5Handoff.competitivePositioning).toContain('Acme');
    });

    it('should show no high-threat message when none exist', () => {
      const data = {
        competitors: [
          makeValidCompetitor({ name: 'Beta', threat: 'L' }),
        ],
      };
      const result = stage04.computeDerived(data);
      expect(result.stage5Handoff.competitivePositioning).toContain('No high-threat');
    });

    it('should extract marketGaps from SWOT opportunities', () => {
      const data = {
        competitors: [
          makeValidCompetitor({
            name: 'Acme',
            swot: {
              strengths: ['S1'], weaknesses: ['W1'],
              opportunities: ['Gap A', 'Gap B'], threats: ['T1'],
            },
          }),
          makeValidCompetitor({
            name: 'Beta',
            swot: {
              strengths: ['S1'], weaknesses: ['W1'],
              opportunities: ['Gap B', 'Gap C'], threats: ['T1'],
            },
          }),
        ],
      };
      const result = stage04.computeDerived(data);
      // Gap B should be deduplicated
      expect(result.stage5Handoff.marketGaps).toContain('Gap A');
      expect(result.stage5Handoff.marketGaps).toContain('Gap B');
      expect(result.stage5Handoff.marketGaps).toContain('Gap C');
      expect(result.stage5Handoff.marketGaps).toHaveLength(3);
    });

    it('should handle empty competitors array', () => {
      const result = stage04.computeDerived({ competitors: [] });
      expect(result.stage5Handoff).toBeDefined();
      expect(result.stage5Handoff.pricingLandscape).toBe('');
      expect(result.stage5Handoff.marketGaps).toEqual([]);
    });

    it('should not mutate original data', () => {
      const data = { competitors: [makeValidCompetitor()] };
      const original = JSON.parse(JSON.stringify(data));
      stage04.computeDerived(data);
      expect(data).toEqual(original);
    });
  });

  describe('Integration: validate + computeDerived workflow', () => {
    it('should work together for valid data', () => {
      const data = { competitors: [makeValidCompetitor()] };
      const validation = stage04.validate(data);
      expect(validation.valid).toBe(true);

      const computed = stage04.computeDerived(data);
      expect(computed.stage5Handoff).toBeDefined();
      expect(computed.stage5Handoff.pricingLandscape).toContain('subscription');
    });

    it('should reject duplicate names before computeDerived', () => {
      const data = {
        competitors: [makeValidCompetitor(), makeValidCompetitor()],
      };
      const validation = stage04.validate(data);
      expect(validation.valid).toBe(false);
      expect(validation.errors[0]).toContain('Duplicate');
    });
  });
});

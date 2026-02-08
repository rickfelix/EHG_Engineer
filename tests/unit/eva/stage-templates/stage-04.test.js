/**
 * Unit tests for Stage 04 - Competitive Intel template
 * Part of SD-LEO-FEAT-TMPL-TRUTH-001
 *
 * Test Scenario TS-6: Stage 04 competitor name uniqueness validation (case-insensitive)
 *
 * @module tests/unit/eva/stage-templates/stage-04.test
 */

import { describe, it, expect } from 'vitest';
import stage04, { THREAT_LEVELS } from '../../../../lib/eva/stage-templates/stage-04.js';

describe('stage-04.js - Competitive Intel template', () => {
  describe('Template metadata', () => {
    it('should have correct template structure', () => {
      expect(stage04.id).toBe('stage-04');
      expect(stage04.slug).toBe('competitive-intel');
      expect(stage04.title).toBe('Competitive Intel');
      expect(stage04.version).toBe('1.0.0');
    });

    it('should have correct threat levels', () => {
      expect(THREAT_LEVELS).toEqual(['H', 'M', 'L']);
    });

    it('should have defaultData', () => {
      expect(stage04.defaultData).toEqual({
        competitors: [],
      });
    });
  });

  describe('validate() - Competitors array validation', () => {
    const validCompetitor = {
      name: 'Acme Corp',
      position: 'Market leader in enterprise SaaS',
      threat: 'H',
      strengths: ['Strong brand', 'Large customer base'],
      weaknesses: ['Legacy tech stack'],
      swot: {
        strengths: ['Market dominance'],
        weaknesses: ['Slow innovation'],
        opportunities: ['New markets'],
        threats: ['Nimble startups'],
      },
    };

    it('should pass for valid data with single competitor', () => {
      const data = { competitors: [validCompetitor] };
      const result = stage04.validate(data);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should pass for valid data with multiple competitors', () => {
      const data = {
        competitors: [
          { ...validCompetitor, name: 'Acme Corp' },
          { ...validCompetitor, name: 'Beta Inc' },
          { ...validCompetitor, name: 'Gamma LLC' },
        ],
      };
      const result = stage04.validate(data);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should fail for empty competitors array', () => {
      const data = { competitors: [] };
      const result = stage04.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('competitors');
      expect(result.errors[0]).toContain('must have at least 1 item');
    });

    it('should fail for missing competitors field', () => {
      const data = {};
      const result = stage04.validate(data);
      expect(result.valid).toBe(false);
    });

    it('should fail for non-array competitors', () => {
      const data = { competitors: 'not an array' };
      const result = stage04.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('must be an array');
    });

    it('should fail for competitor with missing name', () => {
      const data = {
        competitors: [{
          position: 'Market leader',
          threat: 'H',
          strengths: ['S1'],
          weaknesses: ['W1'],
          swot: {
            strengths: ['S1'],
            weaknesses: ['W1'],
            opportunities: ['O1'],
            threats: ['T1'],
          },
        }],
      };
      const result = stage04.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('competitors[0].name');
      expect(result.errors[0]).toContain('is required');
    });

    it('should fail for competitor with missing position', () => {
      const data = {
        competitors: [{
          name: 'Acme',
          threat: 'H',
          strengths: ['S1'],
          weaknesses: ['W1'],
          swot: {
            strengths: ['S1'],
            weaknesses: ['W1'],
            opportunities: ['O1'],
            threats: ['T1'],
          },
        }],
      };
      const result = stage04.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('competitors[0].position');
      expect(result.errors[0]).toContain('is required');
    });

    it('should fail for invalid threat level', () => {
      const data = {
        competitors: [{
          ...validCompetitor,
          threat: 'X',
        }],
      };
      const result = stage04.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('competitors[0].threat');
      expect(result.errors[0]).toContain('must be one of [H, M, L]');
    });

    it('should fail for empty strengths array', () => {
      const data = {
        competitors: [{
          ...validCompetitor,
          strengths: [],
        }],
      };
      const result = stage04.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('competitors[0].strengths');
      expect(result.errors[0]).toContain('must have at least 1 item');
    });

    it('should fail for empty weaknesses array', () => {
      const data = {
        competitors: [{
          ...validCompetitor,
          weaknesses: [],
        }],
      };
      const result = stage04.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('competitors[0].weaknesses');
      expect(result.errors[0]).toContain('must have at least 1 item');
    });

    it('should fail for missing swot object', () => {
      const data = {
        competitors: [{
          name: 'Acme',
          position: 'Leader',
          threat: 'H',
          strengths: ['S1'],
          weaknesses: ['W1'],
        }],
      };
      const result = stage04.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('competitors[0].swot');
      expect(result.errors[0]).toContain('is required and must be an object');
    });

    it('should fail for swot with empty strengths array', () => {
      const data = {
        competitors: [{
          ...validCompetitor,
          swot: {
            strengths: [],
            weaknesses: ['W1'],
            opportunities: ['O1'],
            threats: ['T1'],
          },
        }],
      };
      const result = stage04.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('competitors[0].swot.strengths');
      expect(result.errors[0]).toContain('must have at least 1 item');
    });

    it('should fail for swot with empty weaknesses array', () => {
      const data = {
        competitors: [{
          ...validCompetitor,
          swot: {
            strengths: ['S1'],
            weaknesses: [],
            opportunities: ['O1'],
            threats: ['T1'],
          },
        }],
      };
      const result = stage04.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('competitors[0].swot.weaknesses');
    });

    it('should fail for swot with empty opportunities array', () => {
      const data = {
        competitors: [{
          ...validCompetitor,
          swot: {
            strengths: ['S1'],
            weaknesses: ['W1'],
            opportunities: [],
            threats: ['T1'],
          },
        }],
      };
      const result = stage04.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('competitors[0].swot.opportunities');
    });

    it('should fail for swot with empty threats array', () => {
      const data = {
        competitors: [{
          ...validCompetitor,
          swot: {
            strengths: ['S1'],
            weaknesses: ['W1'],
            opportunities: ['O1'],
            threats: [],
          },
        }],
      };
      const result = stage04.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('competitors[0].swot.threats');
    });
  });

  describe('validate() - TS-6: Duplicate name detection (case-insensitive)', () => {
    const baseCompetitor = {
      position: 'Market leader',
      threat: 'H',
      strengths: ['S1'],
      weaknesses: ['W1'],
      swot: {
        strengths: ['S1'],
        weaknesses: ['W1'],
        opportunities: ['O1'],
        threats: ['T1'],
      },
    };

    it('should detect exact duplicate names', () => {
      const data = {
        competitors: [
          { ...baseCompetitor, name: 'Acme Corp' },
          { ...baseCompetitor, name: 'Acme Corp' },
        ],
      };
      const result = stage04.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Duplicate competitor name');
      expect(result.errors[0]).toContain('Acme Corp');
      expect(result.errors[0]).toContain('indices 0 and 1');
    });

    it('should detect duplicate names case-insensitively (Acme vs acme)', () => {
      const data = {
        competitors: [
          { ...baseCompetitor, name: 'Acme' },
          { ...baseCompetitor, name: 'acme' },
        ],
      };
      const result = stage04.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Duplicate competitor name');
      expect(result.errors[0]).toContain('acme');
    });

    it('should detect duplicate names case-insensitively (ACME vs Acme)', () => {
      const data = {
        competitors: [
          { ...baseCompetitor, name: 'ACME' },
          { ...baseCompetitor, name: 'Acme' },
        ],
      };
      const result = stage04.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Duplicate competitor name');
    });

    it('should detect duplicate names case-insensitively (mixed case)', () => {
      const data = {
        competitors: [
          { ...baseCompetitor, name: 'AcMe CoRp' },
          { ...baseCompetitor, name: 'acme corp' },
        ],
      };
      const result = stage04.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Duplicate competitor name');
    });

    it('should allow different names that differ only after case-normalization would be caught', () => {
      const data = {
        competitors: [
          { ...baseCompetitor, name: 'Acme Corp' },
          { ...baseCompetitor, name: 'Beta Inc' },
          { ...baseCompetitor, name: 'Gamma LLC' },
        ],
      };
      const result = stage04.validate(data);
      expect(result.valid).toBe(true);
    });

    it('should report correct indices for duplicates', () => {
      const data = {
        competitors: [
          { ...baseCompetitor, name: 'Alpha' },
          { ...baseCompetitor, name: 'Beta' },
          { ...baseCompetitor, name: 'alpha' }, // Duplicate of index 0
        ],
      };
      const result = stage04.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('indices 0 and 2');
    });

    it('should detect multiple duplicate pairs', () => {
      const data = {
        competitors: [
          { ...baseCompetitor, name: 'Acme' },
          { ...baseCompetitor, name: 'Beta' },
          { ...baseCompetitor, name: 'acme' }, // Duplicate of 0
          { ...baseCompetitor, name: 'BETA' }, // Duplicate of 1
        ],
      };
      const result = stage04.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(2);
    });

    it('should provide helpful error message with rename suggestion', () => {
      const data = {
        competitors: [
          { ...baseCompetitor, name: 'Acme' },
          { ...baseCompetitor, name: 'Acme' },
        ],
      };
      const result = stage04.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Rename one competitor');
    });

    it('should not flag duplicate when name is missing/non-string', () => {
      const data = {
        competitors: [
          { ...baseCompetitor }, // Missing name
          { ...baseCompetitor }, // Missing name
        ],
      };
      const result = stage04.validate(data);
      expect(result.valid).toBe(false);
      // Should have errors for missing names, but NOT duplicate error
      expect(result.errors.some(e => e.includes('Duplicate'))).toBe(false);
      expect(result.errors.some(e => e.includes('name') && e.includes('required'))).toBe(true);
    });
  });

  describe('computeDerived()', () => {
    const validCompetitor = {
      name: 'Acme Corp',
      position: 'Market leader',
      threat: 'H',
      strengths: ['S1'],
      weaknesses: ['W1'],
      swot: {
        strengths: ['S1'],
        weaknesses: ['W1'],
        opportunities: ['O1'],
        threats: ['T1'],
      },
    };

    it('should return data unchanged (no derived fields)', () => {
      const data = { competitors: [validCompetitor] };
      const result = stage04.computeDerived(data);
      expect(result).toEqual(data);
    });

    it('should not mutate original data', () => {
      const data = { competitors: [validCompetitor] };
      const original = JSON.parse(JSON.stringify(data));
      stage04.computeDerived(data);
      expect(data).toEqual(original);
    });

    it('should preserve all competitor fields', () => {
      const data = {
        competitors: [
          validCompetitor,
          { ...validCompetitor, name: 'Beta Inc' },
        ],
      };
      const result = stage04.computeDerived(data);
      expect(result.competitors).toHaveLength(2);
      expect(result.competitors[0].name).toBe('Acme Corp');
      expect(result.competitors[1].name).toBe('Beta Inc');
    });
  });

  describe('Integration: validate + computeDerived workflow', () => {
    const validCompetitor = {
      name: 'Acme Corp',
      position: 'Market leader',
      threat: 'H',
      strengths: ['S1'],
      weaknesses: ['W1'],
      swot: {
        strengths: ['S1'],
        weaknesses: ['W1'],
        opportunities: ['O1'],
        threats: ['T1'],
      },
    };

    it('should work together for valid data', () => {
      const data = { competitors: [validCompetitor] };
      const validation = stage04.validate(data);
      expect(validation.valid).toBe(true);

      const computed = stage04.computeDerived(data);
      expect(computed).toEqual(data);
    });

    it('should reject duplicate names before computeDerived', () => {
      const data = {
        competitors: [
          validCompetitor,
          { ...validCompetitor }, // Same name
        ],
      };
      const validation = stage04.validate(data);
      expect(validation.valid).toBe(false);
      expect(validation.errors[0]).toContain('Duplicate');
    });
  });
});

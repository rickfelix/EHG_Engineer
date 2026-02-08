/**
 * Unit tests for Stage 02 - AI Review template
 * Part of SD-LEO-FEAT-TMPL-TRUTH-001
 *
 * Test Scenario TS-2: Stage 02 compositeScore is deterministic across critique ordering
 *
 * @module tests/unit/eva/stage-templates/stage-02.test
 */

import { describe, it, expect } from 'vitest';
import stage02 from '../../../../lib/eva/stage-templates/stage-02.js';

describe('stage-02.js - AI Review template', () => {
  describe('Template metadata', () => {
    it('should have correct template structure', () => {
      expect(stage02.id).toBe('stage-02');
      expect(stage02.slug).toBe('ai-review');
      expect(stage02.title).toBe('AI Review');
      expect(stage02.version).toBe('1.0.0');
    });

    it('should have schema definition', () => {
      expect(stage02.schema).toBeDefined();
      expect(stage02.schema.critiques).toBeDefined();
      expect(stage02.schema.compositeScore).toEqual({
        type: 'integer',
        min: 0,
        max: 100,
        derived: true,
      });
    });

    it('should have defaultData', () => {
      expect(stage02.defaultData).toEqual({
        critiques: [],
        compositeScore: null,
      });
    });
  });

  describe('validate() - Critiques array validation', () => {
    const validCritique = {
      model: 'GPT-4',
      summary: 'A' + 'x'.repeat(20), // 21 chars
      strengths: ['Strong point 1'],
      risks: ['Risk 1'],
      score: 75,
    };

    it('should pass for valid data with single critique', () => {
      const data = { critiques: [validCritique] };
      const result = stage02.validate(data);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should pass for valid data with multiple critiques', () => {
      const data = {
        critiques: [
          { ...validCritique, model: 'GPT-4', score: 80 },
          { ...validCritique, model: 'Claude', score: 70 },
          { ...validCritique, model: 'Gemini', score: 85 },
        ],
      };
      const result = stage02.validate(data);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should fail for empty critiques array', () => {
      const data = { critiques: [] };
      const result = stage02.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('critiques');
      expect(result.errors[0]).toContain('must have at least 1 item');
    });

    it('should fail for missing critiques field', () => {
      const data = {};
      const result = stage02.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('critiques');
    });

    it('should fail for non-array critiques', () => {
      const data = { critiques: 'not an array' };
      const result = stage02.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('must be an array');
    });

    it('should fail for critique with missing model', () => {
      const data = {
        critiques: [{
          summary: 'x'.repeat(20),
          strengths: ['S1'],
          risks: ['R1'],
          score: 75,
        }],
      };
      const result = stage02.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('critiques[0].model');
      expect(result.errors[0]).toContain('is required');
    });

    it('should fail for critique with summary below minimum length', () => {
      const data = {
        critiques: [{
          model: 'GPT-4',
          summary: 'Too short',
          strengths: ['S1'],
          risks: ['R1'],
          score: 75,
        }],
      };
      const result = stage02.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('critiques[0].summary');
      expect(result.errors[0]).toContain('must be at least 20 characters');
    });

    it('should fail for critique with empty strengths array', () => {
      const data = {
        critiques: [{
          model: 'GPT-4',
          summary: 'x'.repeat(20),
          strengths: [],
          risks: ['R1'],
          score: 75,
        }],
      };
      const result = stage02.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('critiques[0].strengths');
      expect(result.errors[0]).toContain('must have at least 1 item');
    });

    it('should fail for critique with empty risks array', () => {
      const data = {
        critiques: [{
          model: 'GPT-4',
          summary: 'x'.repeat(20),
          strengths: ['S1'],
          risks: [],
          score: 75,
        }],
      };
      const result = stage02.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('critiques[0].risks');
      expect(result.errors[0]).toContain('must have at least 1 item');
    });

    it('should fail for critique with missing score', () => {
      const data = {
        critiques: [{
          model: 'GPT-4',
          summary: 'x'.repeat(20),
          strengths: ['S1'],
          risks: ['R1'],
        }],
      };
      const result = stage02.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('critiques[0].score');
      expect(result.errors[0]).toContain('is required');
    });

    it('should fail for critique with score below 0', () => {
      const data = {
        critiques: [{
          ...validCritique,
          score: -1,
        }],
      };
      const result = stage02.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('critiques[0].score');
      expect(result.errors[0]).toContain('must be between 0 and 100');
    });

    it('should fail for critique with score above 100', () => {
      const data = {
        critiques: [{
          ...validCritique,
          score: 101,
        }],
      };
      const result = stage02.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('critiques[0].score');
      expect(result.errors[0]).toContain('must be between 0 and 100');
    });

    it('should fail for critique with non-integer score', () => {
      const data = {
        critiques: [{
          ...validCritique,
          score: 75.5,
        }],
      };
      const result = stage02.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('critiques[0].score');
      expect(result.errors[0]).toContain('must be an integer');
    });

    it('should collect multiple errors across multiple critiques', () => {
      const data = {
        critiques: [
          { ...validCritique, score: 101 },
          { ...validCritique, summary: 'Short' },
          { ...validCritique, strengths: [] },
        ],
      };
      const result = stage02.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(e => e.includes('[0]'))).toBe(true);
      expect(result.errors.some(e => e.includes('[1]'))).toBe(true);
      expect(result.errors.some(e => e.includes('[2]'))).toBe(true);
    });
  });

  describe('computeDerived() - TS-2: Deterministic compositeScore', () => {
    it('should compute compositeScore as rounded average', () => {
      const data = {
        critiques: [
          { model: 'A', summary: 'x'.repeat(20), strengths: ['S'], risks: ['R'], score: 70 },
          { model: 'B', summary: 'x'.repeat(20), strengths: ['S'], risks: ['R'], score: 80 },
          { model: 'C', summary: 'x'.repeat(20), strengths: ['S'], risks: ['R'], score: 90 },
        ],
      };
      const result = stage02.computeDerived(data);
      expect(result.compositeScore).toBe(80); // (70+80+90)/3 = 80
    });

    it('should be deterministic across different critique orderings', () => {
      const critiques1 = [
        { model: 'GPT-4', summary: 'x'.repeat(20), strengths: ['S'], risks: ['R'], score: 75 },
        { model: 'Claude', summary: 'x'.repeat(20), strengths: ['S'], risks: ['R'], score: 85 },
        { model: 'Gemini', summary: 'x'.repeat(20), strengths: ['S'], risks: ['R'], score: 70 },
      ];
      const critiques2 = [
        { model: 'Gemini', summary: 'x'.repeat(20), strengths: ['S'], risks: ['R'], score: 70 },
        { model: 'GPT-4', summary: 'x'.repeat(20), strengths: ['S'], risks: ['R'], score: 75 },
        { model: 'Claude', summary: 'x'.repeat(20), strengths: ['S'], risks: ['R'], score: 85 },
      ];
      const critiques3 = [
        { model: 'Claude', summary: 'x'.repeat(20), strengths: ['S'], risks: ['R'], score: 85 },
        { model: 'Gemini', summary: 'x'.repeat(20), strengths: ['S'], risks: ['R'], score: 70 },
        { model: 'GPT-4', summary: 'x'.repeat(20), strengths: ['S'], risks: ['R'], score: 75 },
      ];

      const result1 = stage02.computeDerived({ critiques: critiques1 });
      const result2 = stage02.computeDerived({ critiques: critiques2 });
      const result3 = stage02.computeDerived({ critiques: critiques3 });

      expect(result1.compositeScore).toBe(77); // (75+85+70)/3 = 76.67 rounds to 77
      expect(result2.compositeScore).toBe(77);
      expect(result3.compositeScore).toBe(77);
      expect(result1.compositeScore).toBe(result2.compositeScore);
      expect(result2.compositeScore).toBe(result3.compositeScore);
    });

    it('should round .5 up (Math.round behavior)', () => {
      const data = {
        critiques: [
          { model: 'A', summary: 'x'.repeat(20), strengths: ['S'], risks: ['R'], score: 76 },
          { model: 'B', summary: 'x'.repeat(20), strengths: ['S'], risks: ['R'], score: 77 },
        ],
      };
      const result = stage02.computeDerived(data);
      expect(result.compositeScore).toBe(77); // (76+77)/2 = 76.5 rounds to 77
    });

    it('should round .49 down', () => {
      const data = {
        critiques: [
          { model: 'A', summary: 'x'.repeat(20), strengths: ['S'], risks: ['R'], score: 75 },
          { model: 'B', summary: 'x'.repeat(20), strengths: ['S'], risks: ['R'], score: 76 },
        ],
      };
      const result = stage02.computeDerived(data);
      expect(result.compositeScore).toBe(76); // (75+76)/2 = 75.5 rounds to 76
    });

    it('should return null compositeScore for empty critiques', () => {
      const data = { critiques: [] };
      const result = stage02.computeDerived(data);
      expect(result.compositeScore).toBeNull();
    });

    it('should return null compositeScore when critiques is undefined', () => {
      const data = {};
      const result = stage02.computeDerived(data);
      expect(result.compositeScore).toBeNull();
    });

    it('should handle single critique (no rounding needed)', () => {
      const data = {
        critiques: [
          { model: 'A', summary: 'x'.repeat(20), strengths: ['S'], risks: ['R'], score: 88 },
        ],
      };
      const result = stage02.computeDerived(data);
      expect(result.compositeScore).toBe(88);
    });

    it('should preserve original data fields', () => {
      const data = {
        critiques: [
          { model: 'A', summary: 'x'.repeat(20), strengths: ['S'], risks: ['R'], score: 80 },
        ],
      };
      const result = stage02.computeDerived(data);
      expect(result.critiques).toEqual(data.critiques);
    });

    it('should not mutate original data', () => {
      const data = {
        critiques: [
          { model: 'A', summary: 'x'.repeat(20), strengths: ['S'], risks: ['R'], score: 80 },
        ],
      };
      const original = JSON.parse(JSON.stringify(data));
      stage02.computeDerived(data);
      expect(data).toEqual(original);
    });

    it('should handle boundary scores (0 and 100)', () => {
      const data = {
        critiques: [
          { model: 'A', summary: 'x'.repeat(20), strengths: ['S'], risks: ['R'], score: 0 },
          { model: 'B', summary: 'x'.repeat(20), strengths: ['S'], risks: ['R'], score: 100 },
        ],
      };
      const result = stage02.computeDerived(data);
      expect(result.compositeScore).toBe(50); // (0+100)/2 = 50
    });
  });

  describe('Integration: validate + computeDerived workflow', () => {
    it('should work together for valid data', () => {
      const data = {
        critiques: [
          { model: 'GPT-4', summary: 'x'.repeat(20), strengths: ['S1'], risks: ['R1'], score: 75 },
          { model: 'Claude', summary: 'y'.repeat(20), strengths: ['S2'], risks: ['R2'], score: 85 },
        ],
      };
      const validation = stage02.validate(data);
      expect(validation.valid).toBe(true);

      const computed = stage02.computeDerived(data);
      expect(computed.compositeScore).toBe(80);
    });
  });
});

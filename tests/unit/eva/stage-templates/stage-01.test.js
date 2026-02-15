/**
 * Unit tests for Stage 01 - Draft Idea template (v2.0.0)
 * Phase: THE TRUTH (Stages 1-5)
 * Part of SD-EVA-FEAT-TEMPLATES-TRUTH-001
 *
 * Tests: validation (required fields, archetype enum, optional arrays),
 *        computeDerived (sourceProvenance tracking), ARCHETYPES export
 *
 * @module tests/unit/eva/stage-templates/stage-01.test
 */

import { describe, it, expect } from 'vitest';
import stage01, { ARCHETYPES } from '../../../../lib/eva/stage-templates/stage-01.js';

describe('stage-01.js - Draft Idea template', () => {
  describe('Template metadata', () => {
    it('should have correct template structure', () => {
      expect(stage01.id).toBe('stage-01');
      expect(stage01.slug).toBe('draft-idea');
      expect(stage01.title).toBe('Idea Capture');
      expect(stage01.version).toBe('2.0.0');
    });

    it('should export ARCHETYPES enum', () => {
      expect(ARCHETYPES).toEqual([
        'saas', 'marketplace', 'deeptech', 'hardware', 'services', 'media', 'fintech',
      ]);
    });

    it('should have schema definition with new fields', () => {
      expect(stage01.schema).toBeDefined();
      expect(stage01.schema.description).toEqual({
        type: 'string', minLength: 50, required: true,
      });
      expect(stage01.schema.problemStatement).toEqual({
        type: 'string', minLength: 20, required: true,
      });
      expect(stage01.schema.valueProp).toEqual({
        type: 'string', minLength: 20, required: true,
      });
      expect(stage01.schema.targetMarket).toEqual({
        type: 'string', minLength: 10, required: true,
      });
      expect(stage01.schema.archetype.type).toBe('enum');
      expect(stage01.schema.archetype.values).toEqual(ARCHETYPES);
      expect(stage01.schema.sourceProvenance.derived).toBe(true);
    });

    it('should have defaultData with all fields', () => {
      expect(stage01.defaultData).toEqual({
        description: '',
        problemStatement: '',
        valueProp: '',
        targetMarket: '',
        archetype: null,
        keyAssumptions: [],
        moatStrategy: '',
        successCriteria: [],
        sourceProvenance: {},
      });
    });

    it('should have validate and computeDerived functions', () => {
      expect(typeof stage01.validate).toBe('function');
      expect(typeof stage01.computeDerived).toBe('function');
    });

    it('should have analysisStep attached', () => {
      expect(typeof stage01.analysisStep).toBe('function');
    });
  });

  const makeValid = (overrides = {}) => ({
    description: 'x'.repeat(50),
    problemStatement: 'y'.repeat(20),
    valueProp: 'z'.repeat(20),
    targetMarket: 'w'.repeat(10),
    archetype: 'saas',
    ...overrides,
  });

  describe('validate() - Required fields', () => {
    it('should pass for valid data meeting all requirements', () => {
      const result = stage01.validate(makeValid());
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should pass for data at exact minimum lengths', () => {
      const result = stage01.validate(makeValid());
      expect(result.valid).toBe(true);
    });

    it('should fail for description below minimum length (50)', () => {
      const result = stage01.validate(makeValid({ description: 'Too short' }));
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('description');
    });

    it('should fail for problemStatement below minimum length (20)', () => {
      const result = stage01.validate(makeValid({ problemStatement: 'Short' }));
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('problemStatement');
    });

    it('should fail for valueProp below minimum length (20)', () => {
      const result = stage01.validate(makeValid({ valueProp: 'Short' }));
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('valueProp');
    });

    it('should fail for targetMarket below minimum length (10)', () => {
      const result = stage01.validate(makeValid({ targetMarket: 'SMB' }));
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('targetMarket');
    });

    it('should fail for invalid archetype', () => {
      const result = stage01.validate(makeValid({ archetype: 'invalid_type' }));
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('archetype');
      expect(result.errors[0]).toContain('must be one of');
    });

    it('should fail for missing archetype', () => {
      const data = makeValid();
      delete data.archetype;
      const result = stage01.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('archetype');
    });

    it('should accept all valid archetypes', () => {
      for (const archetype of ARCHETYPES) {
        const result = stage01.validate(makeValid({ archetype }));
        expect(result.valid).toBe(true);
      }
    });

    it('should collect multiple validation errors', () => {
      const result = stage01.validate({
        description: 'Short',
        problemStatement: 'S',
        valueProp: 'S',
        targetMarket: 'S',
        archetype: 'invalid',
      });
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(4);
    });

    it('should fail for null data', () => {
      const result = stage01.validate(null);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should fail for undefined data', () => {
      const result = stage01.validate(undefined);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('validate() - Optional arrays', () => {
    it('should pass when keyAssumptions is omitted', () => {
      const result = stage01.validate(makeValid());
      expect(result.valid).toBe(true);
    });

    it('should pass when keyAssumptions is a valid array', () => {
      const result = stage01.validate(makeValid({ keyAssumptions: ['assumption 1'] }));
      expect(result.valid).toBe(true);
    });

    it('should fail when keyAssumptions is not an array', () => {
      const result = stage01.validate(makeValid({ keyAssumptions: 'not array' }));
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('keyAssumptions');
    });

    it('should pass when successCriteria is a valid array', () => {
      const result = stage01.validate(makeValid({ successCriteria: ['criterion 1'] }));
      expect(result.valid).toBe(true);
    });

    it('should fail when successCriteria is not an array', () => {
      const result = stage01.validate(makeValid({ successCriteria: 'not array' }));
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('successCriteria');
    });
  });

  describe('computeDerived() - Source provenance tracking', () => {
    it('should mark all fields as user when no stage0Output', () => {
      const data = makeValid();
      const result = stage01.computeDerived(data);
      expect(result.sourceProvenance).toBeDefined();
      expect(result.sourceProvenance.description).toBe('user');
      expect(result.sourceProvenance.archetype).toBe('user');
    });

    it('should mark fields as stage0 when present in stage0Output', () => {
      const data = makeValid();
      const stage0 = { description: 'from stage0', archetype: 'saas' };
      const result = stage01.computeDerived(data, stage0);
      expect(result.sourceProvenance.description).toBe('stage0');
      expect(result.sourceProvenance.archetype).toBe('stage0');
      expect(result.sourceProvenance.valueProp).toBe('user');
    });

    it('should not include empty fields in provenance', () => {
      const data = makeValid({ moatStrategy: '' });
      const result = stage01.computeDerived(data);
      expect(result.sourceProvenance.moatStrategy).toBeUndefined();
    });

    it('should not mutate original data', () => {
      const data = makeValid();
      const original = { ...data };
      stage01.computeDerived(data);
      expect(data).toEqual(original);
    });

    it('should preserve all input fields', () => {
      const data = makeValid({ keyAssumptions: ['a1'], successCriteria: ['c1'] });
      const result = stage01.computeDerived(data);
      expect(result.description).toBe(data.description);
      expect(result.archetype).toBe('saas');
      expect(result.keyAssumptions).toEqual(['a1']);
    });
  });

  describe('Integration: validate + computeDerived workflow', () => {
    it('should work together for valid data', () => {
      const data = makeValid();
      const validation = stage01.validate(data);
      expect(validation.valid).toBe(true);

      const computed = stage01.computeDerived(data);
      expect(computed.sourceProvenance).toBeDefined();
    });
  });
});

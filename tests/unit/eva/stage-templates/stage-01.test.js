/**
 * Unit tests for Stage 01 - Draft Idea template
 * Part of SD-LEO-FEAT-TMPL-TRUTH-001
 *
 * Test Scenario TS-1: Stage 01 validation enforces minimum lengths and required fields
 *
 * @module tests/unit/eva/stage-templates/stage-01.test
 */

import { describe, it, expect } from 'vitest';
import stage01 from '../../../../lib/eva/stage-templates/stage-01.js';

describe('stage-01.js - Draft Idea template', () => {
  describe('Template metadata', () => {
    it('should have correct template structure', () => {
      expect(stage01.id).toBe('stage-01');
      expect(stage01.slug).toBe('draft-idea');
      expect(stage01.title).toBe('Draft Idea');
      expect(stage01.version).toBe('1.0.0');
    });

    it('should have schema definition', () => {
      expect(stage01.schema).toBeDefined();
      expect(stage01.schema.description).toEqual({
        type: 'string',
        minLength: 50,
        required: true,
      });
      expect(stage01.schema.valueProp).toEqual({
        type: 'string',
        minLength: 20,
        required: true,
      });
      expect(stage01.schema.targetMarket).toEqual({
        type: 'string',
        minLength: 10,
        required: true,
      });
    });

    it('should have defaultData', () => {
      expect(stage01.defaultData).toEqual({
        description: '',
        valueProp: '',
        targetMarket: '',
      });
    });

    it('should have validate function', () => {
      expect(typeof stage01.validate).toBe('function');
    });

    it('should have computeDerived function', () => {
      expect(typeof stage01.computeDerived).toBe('function');
    });
  });

  describe('validate() - TS-1: Minimum lengths and required fields', () => {
    it('should pass for valid data meeting all requirements', () => {
      const validData = {
        description: 'A' + 'x'.repeat(50), // 51 chars
        valueProp: 'B' + 'y'.repeat(20), // 21 chars
        targetMarket: 'C' + 'z'.repeat(10), // 11 chars
      };
      const result = stage01.validate(validData);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should pass for data at exact minimum lengths', () => {
      const validData = {
        description: 'x'.repeat(50), // exactly 50 chars
        valueProp: 'y'.repeat(20), // exactly 20 chars
        targetMarket: 'z'.repeat(10), // exactly 10 chars
      };
      const result = stage01.validate(validData);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should fail for description below minimum length (50)', () => {
      const invalidData = {
        description: 'Too short',
        valueProp: 'y'.repeat(20),
        targetMarket: 'z'.repeat(10),
      };
      const result = stage01.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('description');
      expect(result.errors[0]).toContain('must be at least 50 characters');
    });

    it('should fail for valueProp below minimum length (20)', () => {
      const invalidData = {
        description: 'x'.repeat(50),
        valueProp: 'Short value',
        targetMarket: 'z'.repeat(10),
      };
      const result = stage01.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('valueProp');
      expect(result.errors[0]).toContain('must be at least 20 characters');
    });

    it('should fail for targetMarket below minimum length (10)', () => {
      const invalidData = {
        description: 'x'.repeat(50),
        valueProp: 'y'.repeat(20),
        targetMarket: 'SMB',
      };
      const result = stage01.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('targetMarket');
      expect(result.errors[0]).toContain('must be at least 10 characters');
    });

    it('should fail for missing description', () => {
      const invalidData = {
        valueProp: 'y'.repeat(20),
        targetMarket: 'z'.repeat(10),
      };
      const result = stage01.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('description');
      expect(result.errors[0]).toContain('is required');
    });

    it('should fail for missing valueProp', () => {
      const invalidData = {
        description: 'x'.repeat(50),
        targetMarket: 'z'.repeat(10),
      };
      const result = stage01.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('valueProp');
      expect(result.errors[0]).toContain('is required');
    });

    it('should fail for missing targetMarket', () => {
      const invalidData = {
        description: 'x'.repeat(50),
        valueProp: 'y'.repeat(20),
      };
      const result = stage01.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('targetMarket');
      expect(result.errors[0]).toContain('is required');
    });

    it('should collect multiple validation errors', () => {
      const invalidData = {
        description: 'Short',
        valueProp: 'Short',
        targetMarket: 'SMB',
      };
      const result = stage01.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(3);
      expect(result.errors[0]).toContain('description');
      expect(result.errors[1]).toContain('valueProp');
      expect(result.errors[2]).toContain('targetMarket');
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

    it('should trim whitespace when validating lengths', () => {
      const invalidData = {
        description: '   ' + 'x'.repeat(45) + '   ', // 45 non-whitespace chars
        valueProp: 'y'.repeat(20),
        targetMarket: 'z'.repeat(10),
      };
      const result = stage01.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('description');
      expect(result.errors[0]).toContain('got 45');
    });

    it('should fail for non-string fields', () => {
      const invalidData = {
        description: 12345,
        valueProp: true,
        targetMarket: { text: 'SMB' },
      };
      const result = stage01.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(3);
      expect(result.errors[0]).toContain('must be a string');
      expect(result.errors[1]).toContain('must be a string');
      expect(result.errors[2]).toContain('must be a string');
    });
  });

  describe('computeDerived()', () => {
    it('should return data unchanged (no derived fields)', () => {
      const inputData = {
        description: 'x'.repeat(50),
        valueProp: 'y'.repeat(20),
        targetMarket: 'z'.repeat(10),
      };
      const result = stage01.computeDerived(inputData);
      expect(result).toEqual(inputData);
    });

    it('should not mutate original data', () => {
      const inputData = {
        description: 'x'.repeat(50),
        valueProp: 'y'.repeat(20),
        targetMarket: 'z'.repeat(10),
      };
      const original = { ...inputData };
      stage01.computeDerived(inputData);
      expect(inputData).toEqual(original);
    });

    it('should preserve additional properties', () => {
      const inputData = {
        description: 'x'.repeat(50),
        valueProp: 'y'.repeat(20),
        targetMarket: 'z'.repeat(10),
        extraField: 'preserved',
      };
      const result = stage01.computeDerived(inputData);
      expect(result.extraField).toBe('preserved');
    });
  });

  describe('Integration: validate + computeDerived workflow', () => {
    it('should work together for valid data', () => {
      const data = {
        description: 'x'.repeat(50),
        valueProp: 'y'.repeat(20),
        targetMarket: 'z'.repeat(10),
      };
      const validation = stage01.validate(data);
      expect(validation.valid).toBe(true);

      const computed = stage01.computeDerived(data);
      expect(computed).toEqual(data);
    });

    it('should not require validation before computeDerived (decoupled)', () => {
      const data = {
        description: 'Short', // Invalid but computeDerived should still work
        valueProp: 'y'.repeat(20),
        targetMarket: 'z'.repeat(10),
      };
      const computed = stage01.computeDerived(data);
      expect(computed).toEqual(data);
    });
  });
});

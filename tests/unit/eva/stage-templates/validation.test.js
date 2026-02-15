/**
 * Unit tests for stage template validation utilities
 * Part of SD-LEO-FEAT-TMPL-TRUTH-001
 *
 * @module tests/unit/eva/stage-templates/validation.test
 */

import { describe, it, expect } from 'vitest';
import {
  validateString,
  validateInteger,
  validateNumber,
  validateArray,
  validateEnum,
  collectErrors,
  validateCrossStageContract,
} from '../../../../lib/eva/stage-templates/validation.js';

describe('validation.js - Shared validation utilities', () => {
  describe('validateString', () => {
    it('should pass for valid string meeting minimum length', () => {
      const result = validateString('Hello World', 'testField', 5);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should pass for string exactly at minimum length', () => {
      const result = validateString('12345', 'testField', 5);
      expect(result.valid).toBe(true);
    });

    it('should fail for string below minimum length', () => {
      const result = validateString('Hi', 'testField', 5);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must be at least 5 characters');
      expect(result.error).toContain('got 2');
    });

    it('should fail for null value', () => {
      const result = validateString(null, 'testField', 5);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('is required');
    });

    it('should fail for undefined value', () => {
      const result = validateString(undefined, 'testField', 5);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('is required');
    });

    it('should fail for non-string value', () => {
      const result = validateString(123, 'testField', 5);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must be a string');
    });

    it('should trim whitespace when checking length', () => {
      const result = validateString('   Hi   ', 'testField', 5);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('got 2');
    });

    it('should use default minLength of 1 when not specified', () => {
      const result = validateString('X', 'testField');
      expect(result.valid).toBe(true);
    });

    it('should fail for empty string with default minLength', () => {
      const result = validateString('', 'testField');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must be at least 1 characters');
    });
  });

  describe('validateInteger', () => {
    it('should pass for valid integer in range', () => {
      const result = validateInteger(50, 'testField', 0, 100);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should pass for integer at minimum boundary', () => {
      const result = validateInteger(0, 'testField', 0, 100);
      expect(result.valid).toBe(true);
    });

    it('should pass for integer at maximum boundary', () => {
      const result = validateInteger(100, 'testField', 0, 100);
      expect(result.valid).toBe(true);
    });

    it('should fail for integer below minimum', () => {
      const result = validateInteger(-1, 'testField', 0, 100);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must be between 0 and 100');
      expect(result.error).toContain('got -1');
    });

    it('should fail for integer above maximum', () => {
      const result = validateInteger(101, 'testField', 0, 100);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must be between 0 and 100');
      expect(result.error).toContain('got 101');
    });

    it('should fail for null value', () => {
      const result = validateInteger(null, 'testField', 0, 100);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('is required');
    });

    it('should fail for undefined value', () => {
      const result = validateInteger(undefined, 'testField', 0, 100);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('is required');
    });

    it('should fail for non-integer (float)', () => {
      const result = validateInteger(50.5, 'testField', 0, 100);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must be an integer');
      expect(result.error).toContain('got number: 50.5');
    });

    it('should fail for non-integer (string)', () => {
      const result = validateInteger('50', 'testField', 0, 100);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must be an integer');
      expect(result.error).toContain('got string');
    });

    it('should use default range [0, 100] when not specified', () => {
      expect(validateInteger(0, 'testField').valid).toBe(true);
      expect(validateInteger(100, 'testField').valid).toBe(true);
      expect(validateInteger(-1, 'testField').valid).toBe(false);
      expect(validateInteger(101, 'testField').valid).toBe(false);
    });
  });

  describe('validateNumber', () => {
    it('should pass for valid number >= min', () => {
      const result = validateNumber(10.5, 'testField', 0);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should pass for number at minimum boundary', () => {
      const result = validateNumber(0, 'testField', 0);
      expect(result.valid).toBe(true);
    });

    it('should pass for integer value', () => {
      const result = validateNumber(50, 'testField', 0);
      expect(result.valid).toBe(true);
    });

    it('should fail for number below minimum', () => {
      const result = validateNumber(-0.1, 'testField', 0);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must be >= 0');
      expect(result.error).toContain('got -0.1');
    });

    it('should fail for null value', () => {
      const result = validateNumber(null, 'testField', 0);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('is required');
    });

    it('should fail for undefined value', () => {
      const result = validateNumber(undefined, 'testField', 0);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('is required');
    });

    it('should fail for non-number (string)', () => {
      const result = validateNumber('10', 'testField', 0);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must be a finite number');
    });

    it('should fail for Infinity', () => {
      const result = validateNumber(Infinity, 'testField', 0);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must be a finite number');
    });

    it('should fail for -Infinity', () => {
      const result = validateNumber(-Infinity, 'testField', 0);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must be a finite number');
    });

    it('should fail for NaN', () => {
      const result = validateNumber(NaN, 'testField', 0);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must be a finite number');
    });

    it('should use default min of 0 when not specified', () => {
      expect(validateNumber(0, 'testField').valid).toBe(true);
      expect(validateNumber(-1, 'testField').valid).toBe(false);
    });
  });

  describe('validateArray', () => {
    it('should pass for valid array meeting minimum items', () => {
      const result = validateArray([1, 2, 3], 'testField', 2);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should pass for array exactly at minimum items', () => {
      const result = validateArray([1, 2], 'testField', 2);
      expect(result.valid).toBe(true);
    });

    it('should fail for array below minimum items', () => {
      const result = validateArray([1], 'testField', 2);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must have at least 2 item(s)');
      expect(result.error).toContain('got 1');
    });

    it('should fail for empty array with minItems > 0', () => {
      const result = validateArray([], 'testField', 1);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must have at least 1 item(s)');
      expect(result.error).toContain('got 0');
    });

    it('should fail for non-array value', () => {
      const result = validateArray('not an array', 'testField', 1);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must be an array');
    });

    it('should fail for null value', () => {
      const result = validateArray(null, 'testField', 1);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must be an array');
    });

    it('should use default minItems of 1 when not specified', () => {
      expect(validateArray([1], 'testField').valid).toBe(true);
      expect(validateArray([], 'testField').valid).toBe(false);
    });
  });

  describe('validateEnum', () => {
    it('should pass for valid enum value', () => {
      const result = validateEnum('red', 'color', ['red', 'green', 'blue']);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should fail for invalid enum value', () => {
      const result = validateEnum('yellow', 'color', ['red', 'green', 'blue']);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must be one of [red, green, blue]');
      expect(result.error).toContain("got 'yellow'");
    });

    it('should be case-sensitive', () => {
      const result = validateEnum('Red', 'color', ['red', 'green', 'blue']);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("got 'Red'");
    });

    it('should fail for null value', () => {
      const result = validateEnum(null, 'color', ['red', 'green', 'blue']);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must be one of');
    });

    it('should fail for undefined value', () => {
      const result = validateEnum(undefined, 'color', ['red', 'green', 'blue']);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must be one of');
    });
  });

  describe('collectErrors', () => {
    it('should collect all errors from validation results', () => {
      const results = [
        { valid: true },
        { valid: false, error: 'Error 1' },
        { valid: true },
        { valid: false, error: 'Error 2' },
        { valid: false, error: 'Error 3' },
      ];
      const errors = collectErrors(results);
      expect(errors).toEqual(['Error 1', 'Error 2', 'Error 3']);
    });

    it('should return empty array when all validations pass', () => {
      const results = [
        { valid: true },
        { valid: true },
        { valid: true },
      ];
      const errors = collectErrors(results);
      expect(errors).toEqual([]);
    });

    it('should return all errors when all validations fail', () => {
      const results = [
        { valid: false, error: 'Error A' },
        { valid: false, error: 'Error B' },
      ];
      const errors = collectErrors(results);
      expect(errors).toEqual(['Error A', 'Error B']);
    });

    it('should handle empty results array', () => {
      const errors = collectErrors([]);
      expect(errors).toEqual([]);
    });
  });

  describe('validateCrossStageContract()', () => {
    it('should pass for valid upstream data matching contract', () => {
      const upstream = { name: 'Test', count: 5, items: [1, 2] };
      const contract = {
        name: { type: 'string' },
        count: { type: 'number' },
        items: { type: 'array', minItems: 1 },
      };
      const result = validateCrossStageContract(upstream, contract, 'stage-01');
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should fail when upstream data is null', () => {
      const contract = { name: { type: 'string' } };
      const result = validateCrossStageContract(null, contract, 'stage-01');
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('stage-01');
      expect(result.errors[0]).toContain('required');
    });

    it('should fail when upstream data is undefined', () => {
      const contract = { name: { type: 'string' } };
      const result = validateCrossStageContract(undefined, contract, 'stage-01');
      expect(result.valid).toBe(false);
    });

    it('should fail for missing required field', () => {
      const upstream = {};
      const contract = { name: { type: 'string' } };
      const result = validateCrossStageContract(upstream, contract, 'stage-02');
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('stage-02.name');
      expect(result.errors[0]).toContain('required');
    });

    it('should skip optional fields when missing', () => {
      const upstream = {};
      const contract = { name: { type: 'string', required: false } };
      const result = validateCrossStageContract(upstream, contract, 'stage-01');
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should validate string type', () => {
      const upstream = { name: 123 };
      const contract = { name: { type: 'string' } };
      const result = validateCrossStageContract(upstream, contract, 'stage-01');
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('stage-01.name');
    });

    it('should validate string minLength', () => {
      const upstream = { desc: 'short' };
      const contract = { desc: { type: 'string', minLength: 20 } };
      const result = validateCrossStageContract(upstream, contract, 'stage-01');
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('stage-01.desc');
    });

    it('should validate number type', () => {
      const upstream = { score: 'not a number' };
      const contract = { score: { type: 'number' } };
      const result = validateCrossStageContract(upstream, contract, 'stage-06');
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('stage-06.score');
    });

    it('should validate integer type and range', () => {
      const upstream = { count: 3.5 };
      const contract = { count: { type: 'integer', min: 1, max: 10 } };
      const result = validateCrossStageContract(upstream, contract, 'stage-07');
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('stage-07.count');
    });

    it('should validate array type and minItems', () => {
      const upstream = { items: [] };
      const contract = { items: { type: 'array', minItems: 1 } };
      const result = validateCrossStageContract(upstream, contract, 'stage-03');
      expect(result.valid).toBe(false);
    });

    it('should validate object type', () => {
      const upstream = { config: 'not an object' };
      const contract = { config: { type: 'object' } };
      const result = validateCrossStageContract(upstream, contract, 'stage-05');
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('object');
    });

    it('should reject arrays for object type', () => {
      const upstream = { config: [1, 2, 3] };
      const contract = { config: { type: 'object' } };
      const result = validateCrossStageContract(upstream, contract, 'stage-05');
      expect(result.valid).toBe(false);
    });

    it('should pass for valid object type', () => {
      const upstream = { config: { key: 'value' } };
      const contract = { config: { type: 'object' } };
      const result = validateCrossStageContract(upstream, contract, 'stage-05');
      expect(result.valid).toBe(true);
    });

    it('should collect multiple errors across fields', () => {
      const upstream = { name: '', count: -1 };
      const contract = {
        name: { type: 'string', minLength: 5 },
        count: { type: 'number', min: 0 },
        missing: { type: 'string' },
      };
      const result = validateCrossStageContract(upstream, contract, 'stage-01');
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(2);
    });

    it('should handle unknown type gracefully', () => {
      const upstream = { field: 'value' };
      const contract = { field: { type: 'unknown_type' } };
      const result = validateCrossStageContract(upstream, contract, 'stage-01');
      expect(result.valid).toBe(true);
    });

    it('should include stage label in error messages', () => {
      const upstream = { a: null };
      const contract = { a: { type: 'string' } };
      const result = validateCrossStageContract(upstream, contract, 'stage-99');
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('stage-99');
    });
  });
});

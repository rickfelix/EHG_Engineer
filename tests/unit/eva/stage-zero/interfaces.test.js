/**
 * Unit Tests: Stage 0 Shared Interfaces
 *
 * Test Coverage:
 * - validatePathOutput: valid/invalid/missing fields/null
 * - validateSynthesisInput: valid/delegates to validatePathOutput
 * - createPathOutput: correct structure with defaults and overrides
 * - validateVentureBrief: brief shape validation
 */

import { describe, test, expect } from 'vitest';
import {
  validatePathOutput,
  validateSynthesisInput,
  validateVentureBrief,
  createPathOutput,
} from '../../../../lib/eva/stage-zero/interfaces.js';

describe('validatePathOutput', () => {
  const validOutput = {
    origin_type: 'discovery',
    raw_material: { some: 'data' },
    suggested_name: 'Test Venture',
    suggested_problem: 'A real problem',
    suggested_solution: 'An automated solution',
    target_market: 'SMBs',
  };

  test('returns valid for a complete PathOutput', () => {
    const result = validatePathOutput(validOutput);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('returns invalid with errors for missing required fields', () => {
    const result = validatePathOutput({ origin_type: 'discovery' });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(4);
    expect(result.errors.some(e => e.includes('raw_material'))).toBe(true);
    expect(result.errors.some(e => e.includes('suggested_name'))).toBe(true);
  });

  test('returns invalid for null input', () => {
    const result = validatePathOutput(null);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(['PathOutput must be a non-null object']);
  });

  test('returns invalid for non-object input', () => {
    const result = validatePathOutput('not an object');
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(['PathOutput must be a non-null object']);
  });

  test('rejects invalid origin_type enum value', () => {
    const result = validatePathOutput({ ...validOutput, origin_type: 'invalid_type' });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('origin_type must be one of'))).toBe(true);
  });

  test('accepts all valid origin_type values', () => {
    for (const origin of ['competitor_teardown', 'blueprint', 'discovery', 'manual', 'nursery_reeval']) {
      const result = validatePathOutput({ ...validOutput, origin_type: origin });
      expect(result.valid).toBe(true);
    }
  });
});

describe('validateSynthesisInput', () => {
  const validPathOutput = {
    origin_type: 'discovery',
    raw_material: {},
    suggested_name: 'Test',
    suggested_problem: 'Problem',
    suggested_solution: 'Solution',
    target_market: 'Market',
  };

  test('returns valid when pathOutput is valid', () => {
    const result = validateSynthesisInput({ pathOutput: validPathOutput });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('returns invalid for null input', () => {
    const result = validateSynthesisInput(null);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(['SynthesisInput must be a non-null object']);
  });

  test('delegates pathOutput validation errors with prefix', () => {
    const result = validateSynthesisInput({ pathOutput: {} });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.startsWith('pathOutput.'))).toBe(true);
  });

  test('rejects non-array intellectualCapital', () => {
    const result = validateSynthesisInput({ pathOutput: validPathOutput, intellectualCapital: 'not-array' });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('intellectualCapital must be an array'))).toBe(true);
  });

  test('rejects non-object portfolioContext', () => {
    const result = validateSynthesisInput({ pathOutput: validPathOutput, portfolioContext: 'string' });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('portfolioContext must be an object'))).toBe(true);
  });
});

describe('createPathOutput', () => {
  test('returns correct default structure', () => {
    const output = createPathOutput();
    expect(output).toEqual({
      origin_type: 'manual',
      raw_material: {},
      suggested_name: '',
      suggested_problem: '',
      suggested_solution: '',
      target_market: '',
      competitor_urls: [],
      blueprint_id: null,
      discovery_strategy: null,
      metadata: {},
    });
  });

  test('applies overrides over defaults', () => {
    const output = createPathOutput({
      origin_type: 'blueprint',
      suggested_name: 'My Venture',
      metadata: { key: 'value' },
    });
    expect(output.origin_type).toBe('blueprint');
    expect(output.suggested_name).toBe('My Venture');
    expect(output.metadata).toEqual({ key: 'value' });
    // defaults still present
    expect(output.raw_material).toEqual({});
    expect(output.competitor_urls).toEqual([]);
  });
});

describe('validateVentureBrief', () => {
  const validBrief = {
    name: 'Test Venture',
    problem_statement: 'A problem',
    solution: 'A solution',
    target_market: 'SMBs',
    origin_type: 'discovery',
    raw_chairman_intent: 'Make money with AI',
  };

  test('returns valid for complete brief', () => {
    const result = validateVentureBrief(validBrief);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('returns invalid for null', () => {
    const result = validateVentureBrief(null);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(['VentureBrief must be a non-null object']);
  });

  test('requires all string fields and raw_chairman_intent', () => {
    const result = validateVentureBrief({});
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('name'))).toBe(true);
    expect(result.errors.some(e => e.includes('raw_chairman_intent'))).toBe(true);
  });

  test('rejects invalid maturity value', () => {
    const result = validateVentureBrief({ ...validBrief, maturity: 'invalid' });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('maturity must be one of'))).toBe(true);
  });

  test('accepts all valid maturity values', () => {
    for (const maturity of ['ready', 'seed', 'sprout', 'blocked', 'nursery']) {
      const result = validateVentureBrief({ ...validBrief, maturity });
      expect(result.valid).toBe(true);
    }
  });

  test('rejects empty string fields', () => {
    const result = validateVentureBrief({ ...validBrief, name: '   ' });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('name'))).toBe(true);
  });
});

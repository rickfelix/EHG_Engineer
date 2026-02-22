/**
 * Unit tests for contract-validator.js shape validation and venture progression
 * SD-MAN-FEAT-CORRECTIVE-VISION-GAP-010
 *
 * Tests: validateSchemaShape(), getVentureProgression(), template outputSchema exports
 */

import { describe, test, expect, vi } from 'vitest';
import { validateSchemaShape, getVentureProgression } from '../../../lib/eva/contract-validator.js';

// ---------------------------------------------------------------------------
// validateSchemaShape (SD-009 signature: { stageNumber, artifactData, outputSchema })
// Returns { passed: boolean, mismatches: Array<{field, expectedType, actualType, category}> }
// ---------------------------------------------------------------------------

describe('validateSchemaShape', () => {
  const sampleSchema = [
    { field: 'description', type: 'string', required: true },
    { field: 'score', type: 'number', required: true },
    { field: 'tags', type: 'array', required: false },
    { field: 'metadata', type: 'object', required: false },
  ];

  test('returns passed:true for valid artifact with all required fields', () => {
    const data = { description: 'A venture idea', score: 85, tags: ['ai'], metadata: {} };
    const result = validateSchemaShape({ stageNumber: 1, artifactData: data, outputSchema: sampleSchema });
    expect(result.passed).toBe(true);
    expect(result.mismatches).toEqual([]);
  });

  test('returns mismatch for missing required field', () => {
    const data = { score: 85 }; // missing description
    const result = validateSchemaShape({ stageNumber: 1, artifactData: data, outputSchema: sampleSchema });
    expect(result.passed).toBe(false);
    expect(result.mismatches).toHaveLength(1);
    expect(result.mismatches[0]).toEqual({
      field: 'description',
      expectedType: 'string',
      actualType: 'undefined',
      category: 'missing_field',
    });
  });

  test('returns mismatch for type mismatch', () => {
    const data = { description: 123, score: 85 }; // description should be string
    const result = validateSchemaShape({ stageNumber: 1, artifactData: data, outputSchema: sampleSchema });
    expect(result.passed).toBe(false);
    expect(result.mismatches).toHaveLength(1);
    expect(result.mismatches[0].field).toBe('description');
    expect(result.mismatches[0].category).toBe('type_mismatch');
  });

  test('does not report mismatches for extra fields not in schema', () => {
    const data = { description: 'Test', score: 85, extraField: 'bonus' };
    const result = validateSchemaShape({ stageNumber: 1, artifactData: data, outputSchema: sampleSchema });
    expect(result.passed).toBe(true);
    expect(result.mismatches).toEqual([]);
  });

  test('does not report mismatches for missing optional fields', () => {
    const data = { description: 'Test', score: 85 }; // tags and metadata missing but optional
    const result = validateSchemaShape({ stageNumber: 1, artifactData: data, outputSchema: sampleSchema });
    expect(result.passed).toBe(true);
    expect(result.mismatches).toEqual([]);
  });

  test('returns passed:true for null artifact data', () => {
    const result = validateSchemaShape({ stageNumber: 1, artifactData: null, outputSchema: sampleSchema });
    expect(result.passed).toBe(true);
    expect(result.mismatches).toEqual([]);
  });

  test('returns mismatches for empty artifact data missing required fields', () => {
    const result = validateSchemaShape({ stageNumber: 1, artifactData: {}, outputSchema: sampleSchema });
    expect(result.passed).toBe(false);
    expect(result.mismatches).toHaveLength(2);
    result.mismatches.forEach(m => expect(m.category).toBe('missing_field'));
  });

  test('returns passed:true when outputSchema is empty', () => {
    const result = validateSchemaShape({ stageNumber: 1, artifactData: { description: 'Test' }, outputSchema: [] });
    expect(result.passed).toBe(true);
    expect(result.mismatches).toEqual([]);
  });

  test('returns passed:true when outputSchema is null', () => {
    const result = validateSchemaShape({ stageNumber: 1, artifactData: { description: 'Test' }, outputSchema: null });
    expect(result.passed).toBe(true);
    expect(result.mismatches).toEqual([]);
  });

  test('skips type check for fields with type "any"', () => {
    const schema = [{ field: 'data', type: 'any', required: true }];
    const result = validateSchemaShape({ stageNumber: 1, artifactData: { data: 42 }, outputSchema: schema });
    expect(result.passed).toBe(true);
    expect(result.mismatches).toEqual([]);
  });

  test('detects array type correctly', () => {
    const schema = [{ field: 'items', type: 'array', required: true }];
    const result = validateSchemaShape({ stageNumber: 1, artifactData: { items: 'not-an-array' }, outputSchema: schema });
    expect(result.passed).toBe(false);
    expect(result.mismatches).toHaveLength(1);
    expect(result.mismatches[0].category).toBe('type_mismatch');
  });
});

// ---------------------------------------------------------------------------
// getVentureProgression
// ---------------------------------------------------------------------------

describe('getVentureProgression', () => {
  function createMockSupabase(data, error = null) {
    return {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data, error }),
            }),
          }),
        }),
      }),
    };
  }

  test('returns per-stage completion data for venture with artifacts', async () => {
    const mockData = [
      { lifecycle_stage: 1, is_current: true },
      { lifecycle_stage: 2, is_current: true },
      { lifecycle_stage: 2, is_current: true },
      { lifecycle_stage: 3, is_current: true },
    ];
    const supabase = createMockSupabase(mockData);

    const result = await getVentureProgression(supabase, 'venture-123');

    expect(result.totalStages).toBe(8);
    expect(result.completedStages).toBe(3);
    expect(result.stages).toHaveLength(3);
    expect(result.stages[0]).toEqual({ stage: 1, artifactCount: 1, validated: true });
    expect(result.stages[1]).toEqual({ stage: 2, artifactCount: 2, validated: true });
    expect(result.stages[2]).toEqual({ stage: 3, artifactCount: 1, validated: true });
    expect(result.error).toBeUndefined();
  });

  test('returns empty result with error flag on Supabase error', async () => {
    const supabase = createMockSupabase(null, { message: 'Connection failed' });

    const result = await getVentureProgression(supabase, 'venture-123');

    expect(result.stages).toEqual([]);
    expect(result.completedStages).toBe(0);
    expect(result.error).toBe(true);
  });

  test('returns empty result for venture with no artifacts', async () => {
    const supabase = createMockSupabase([]);

    const result = await getVentureProgression(supabase, 'venture-123');

    expect(result.stages).toEqual([]);
    expect(result.completedStages).toBe(0);
    expect(result.totalStages).toBe(8);
    expect(result.error).toBeUndefined();
  });

  test('sorts stages in ascending order', async () => {
    const mockData = [
      { lifecycle_stage: 5, is_current: true },
      { lifecycle_stage: 1, is_current: true },
      { lifecycle_stage: 3, is_current: true },
    ];
    const supabase = createMockSupabase(mockData);

    const result = await getVentureProgression(supabase, 'venture-123');

    expect(result.stages.map(s => s.stage)).toEqual([1, 3, 5]);
  });
});

// ---------------------------------------------------------------------------
// Template outputSchema exports (stages 1-8)
// ---------------------------------------------------------------------------

describe('Stage template outputSchema exports', () => {
  const templatePaths = [
    { num: 1, path: '../../../lib/eva/stage-templates/stage-01.js' },
    { num: 2, path: '../../../lib/eva/stage-templates/stage-02.js' },
    { num: 3, path: '../../../lib/eva/stage-templates/stage-03.js' },
    { num: 4, path: '../../../lib/eva/stage-templates/stage-04.js' },
    { num: 5, path: '../../../lib/eva/stage-templates/stage-05.js' },
    { num: 6, path: '../../../lib/eva/stage-templates/stage-06.js' },
    { num: 7, path: '../../../lib/eva/stage-templates/stage-07.js' },
    { num: 8, path: '../../../lib/eva/stage-templates/stage-08.js' },
  ];

  for (const { num, path } of templatePaths) {
    test(`stage-${String(num).padStart(2, '0')} has non-empty outputSchema with correct shape`, async () => {
      const mod = await import(path);
      const template = mod.default;

      expect(template.outputSchema).toBeDefined();
      expect(Array.isArray(template.outputSchema)).toBe(true);
      expect(template.outputSchema.length).toBeGreaterThan(0);

      for (const entry of template.outputSchema) {
        expect(entry).toHaveProperty('field');
        expect(entry).toHaveProperty('type');
        expect(entry).toHaveProperty('required');
        expect(typeof entry.field).toBe('string');
        expect(typeof entry.type).toBe('string');
        expect(typeof entry.required).toBe('boolean');
      }
    });
  }
});

/**
 * Unit tests for contract-validator.js shape validation and venture progression
 * SD-MAN-FEAT-CORRECTIVE-VISION-GAP-010
 *
 * Tests: validateSchemaShape(), getVentureProgression(), template outputSchema exports
 */

import { describe, test, expect, vi } from 'vitest';
import { validateSchemaShape, getVentureProgression } from '../../../lib/eva/contract-validator.js';

// ---------------------------------------------------------------------------
// validateSchemaShape
// ---------------------------------------------------------------------------

describe('validateSchemaShape', () => {
  const sampleSchema = [
    { field: 'description', type: 'string', required: true },
    { field: 'score', type: 'number', required: true },
    { field: 'tags', type: 'array', required: false },
    { field: 'metadata', type: 'object', required: false },
  ];

  test('returns empty array for valid artifact with all required fields', () => {
    const data = { description: 'A venture idea', score: 85, tags: ['ai'], metadata: {} };
    const violations = validateSchemaShape(data, sampleSchema);
    expect(violations).toEqual([]);
  });

  test('returns violation for missing required field', () => {
    const data = { score: 85 }; // missing description
    const violations = validateSchemaShape(data, sampleSchema);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toEqual({
      field: 'description',
      expected: 'string',
      actual: 'missing',
      violation: 'missing_required_field',
    });
  });

  test('returns violation for type mismatch', () => {
    const data = { description: 123, score: 85 }; // description should be string
    const violations = validateSchemaShape(data, sampleSchema);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toEqual({
      field: 'description',
      expected: 'string',
      actual: 'number',
      violation: 'type_mismatch',
    });
  });

  test('does not report violations for extra fields not in schema', () => {
    const data = { description: 'Test', score: 85, extraField: 'bonus' };
    const violations = validateSchemaShape(data, sampleSchema);
    expect(violations).toEqual([]);
  });

  test('does not report violations for missing optional fields', () => {
    const data = { description: 'Test', score: 85 }; // tags and metadata missing but optional
    const violations = validateSchemaShape(data, sampleSchema);
    expect(violations).toEqual([]);
  });

  test('returns all required field violations for null artifact data', () => {
    const violations = validateSchemaShape(null, sampleSchema);
    expect(violations).toHaveLength(2); // description and score are required
    expect(violations[0].field).toBe('description');
    expect(violations[1].field).toBe('score');
  });

  test('returns all required field violations for empty artifact data', () => {
    const violations = validateSchemaShape({}, sampleSchema);
    expect(violations).toHaveLength(2);
    violations.forEach(v => expect(v.violation).toBe('missing_required_field'));
  });

  test('returns empty array when outputSchema is empty', () => {
    const violations = validateSchemaShape({ description: 'Test' }, []);
    expect(violations).toEqual([]);
  });

  test('returns empty array when outputSchema is null', () => {
    const violations = validateSchemaShape({ description: 'Test' }, null);
    expect(violations).toEqual([]);
  });

  test('skips type check for fields with type "any"', () => {
    const schema = [{ field: 'data', type: 'any', required: true }];
    const violations = validateSchemaShape({ data: 42 }, schema);
    expect(violations).toEqual([]);
  });

  test('detects array type correctly', () => {
    const schema = [{ field: 'items', type: 'array', required: true }];
    const violations = validateSchemaShape({ items: 'not-an-array' }, schema);
    expect(violations).toHaveLength(1);
    expect(violations[0].violation).toBe('type_mismatch');
    expect(violations[0].actual).toBe('string');
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

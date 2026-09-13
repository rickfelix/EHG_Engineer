import { describe, it, expect } from 'vitest';
import { validateSchemaShape, validateContracts } from '../../../lib/eva/contract-validator.js';
import { extractOutputSchema } from '../../../lib/eva/stage-templates/output-schema-extractor.js';
import { CROSS_STAGE_DEPS } from '../../../lib/eva/contracts/stage-contracts.js';

/** Minimal chainable Supabase stub: supports .from().select().eq().eq().in() (thenable,
 * empty artifacts) and .from().insert() (thenable, no-op) -- exactly the two call shapes
 * validateContracts() makes. */
function makeMockSupabase() {
  const selectChain = {
    select: () => selectChain,
    eq: () => selectChain,
    in: () => Promise.resolve({ data: [], error: null }),
  };
  return {
    from: () => ({
      ...selectChain,
      insert: () => Promise.resolve({ data: null, error: null }),
    }),
  };
}

describe('extractOutputSchema', () => {
  it('extracts non-derived fields from schema', () => {
    const schema = {
      name: { type: 'string', required: true },
      score: { type: 'integer', required: true },
      notes: { type: 'string', required: false },
      computed: { type: 'number', derived: true },
    };

    const result = extractOutputSchema(schema);
    expect(result).toHaveLength(3);
    expect(result.map(r => r.field)).toEqual(['name', 'score', 'notes']);
    expect(result.find(r => r.field === 'name')).toEqual({ field: 'name', type: 'string', required: true });
    expect(result.find(r => r.field === 'notes')).toEqual({ field: 'notes', type: 'string', required: false });
  });

  it('excludes upstream stageNData references', () => {
    const schema = {
      analysis: { type: 'object', required: true },
      stage1Data: { type: 'object' },
      stage2Data: { type: 'object' },
    };

    const result = extractOutputSchema(schema);
    expect(result).toHaveLength(1);
    expect(result[0].field).toBe('analysis');
  });

  it('returns empty array for null/undefined schema', () => {
    expect(extractOutputSchema(null)).toEqual([]);
    expect(extractOutputSchema(undefined)).toEqual([]);
    expect(extractOutputSchema('not-an-object')).toEqual([]);
  });

  it('handles empty schema object', () => {
    expect(extractOutputSchema({})).toEqual([]);
  });

  it('handles schema with all derived fields', () => {
    const schema = {
      total: { type: 'number', derived: true },
      decision: { type: 'enum', derived: true },
    };
    expect(extractOutputSchema(schema)).toEqual([]);
  });
});

describe('validateSchemaShape', () => {
  const schema = [
    { field: 'title', type: 'string', required: true },
    { field: 'score', type: 'integer', required: true },
    { field: 'tags', type: 'array', required: false },
    { field: 'metadata', type: 'object', required: false },
  ];

  it('passes when all required fields match types', () => {
    const data = { title: 'Test', score: 85, tags: ['a', 'b'], metadata: {} };
    const result = validateSchemaShape({ stageNumber: 1, artifactData: data, outputSchema: schema });
    expect(result.passed).toBe(true);
    expect(result.mismatches).toEqual([]);
  });

  it('detects missing required fields', () => {
    const data = { tags: ['a'] };
    const result = validateSchemaShape({ stageNumber: 1, artifactData: data, outputSchema: schema });
    expect(result.passed).toBe(false);
    expect(result.mismatches).toHaveLength(2);

    const missing = result.mismatches.filter(m => m.category === 'missing_field');
    expect(missing).toHaveLength(2);
    expect(missing.map(m => m.field).sort()).toEqual(['score', 'title']);
  });

  it('does not flag missing optional fields', () => {
    const data = { title: 'Test', score: 42 };
    const result = validateSchemaShape({ stageNumber: 1, artifactData: data, outputSchema: schema });
    expect(result.passed).toBe(true);
    expect(result.mismatches).toEqual([]);
  });

  it('detects type mismatches', () => {
    const data = { title: 123, score: 'not-a-number', tags: 'not-array', metadata: 'not-object' };
    const result = validateSchemaShape({ stageNumber: 1, artifactData: data, outputSchema: schema });
    expect(result.passed).toBe(false);
    expect(result.mismatches.length).toBeGreaterThanOrEqual(4);

    for (const m of result.mismatches) {
      expect(m.category).toBe('type_mismatch');
      expect(m).toHaveProperty('field');
      expect(m).toHaveProperty('expectedType');
      expect(m).toHaveProperty('actualType');
    }
  });

  it('detects integer vs float mismatch', () => {
    const data = { title: 'Test', score: 3.14 };
    const result = validateSchemaShape({ stageNumber: 1, artifactData: data, outputSchema: schema });
    expect(result.passed).toBe(false);
    const mismatch = result.mismatches.find(m => m.field === 'score');
    expect(mismatch.category).toBe('type_mismatch');
    expect(mismatch.expectedType).toBe('integer');
    expect(mismatch.actualType).toBe('float');
  });

  it('handles null/undefined artifactData gracefully', () => {
    expect(validateSchemaShape({ stageNumber: 1, artifactData: null, outputSchema: schema }).passed).toBe(true);
    expect(validateSchemaShape({ stageNumber: 1, artifactData: undefined, outputSchema: schema }).passed).toBe(true);
  });

  it('handles empty schema gracefully', () => {
    expect(validateSchemaShape({ stageNumber: 1, artifactData: { foo: 1 }, outputSchema: [] }).passed).toBe(true);
    expect(validateSchemaShape({ stageNumber: 1, artifactData: { foo: 1 }, outputSchema: null }).passed).toBe(true);
  });

  it('passes enum type without checking value', () => {
    const enumSchema = [{ field: 'archetype', type: 'enum', required: true }];
    const data = { archetype: 'saas' };
    const result = validateSchemaShape({ stageNumber: 1, artifactData: data, outputSchema: enumSchema });
    expect(result.passed).toBe(true);
  });

  it('passes any type without checking', () => {
    const anySchema = [{ field: 'data', type: 'any', required: true }];
    const data = { data: [1, 2, 3] };
    const result = validateSchemaShape({ stageNumber: 1, artifactData: data, outputSchema: anySchema });
    expect(result.passed).toBe(true);
  });

  it('mismatch objects have required properties', () => {
    const data = { title: 42, score: 'wrong' };
    const result = validateSchemaShape({ stageNumber: 1, artifactData: data, outputSchema: schema });
    for (const m of result.mismatches) {
      expect(m).toHaveProperty('field');
      expect(m).toHaveProperty('expectedType');
      expect(m).toHaveProperty('actualType');
      expect(m).toHaveProperty('category');
      expect(['missing_field', 'type_mismatch']).toContain(m.category);
    }
  });
});

describe('Stage template outputSchema integration', () => {
  it('stage-01 template has outputSchema with non-derived fields', async () => {
    const stage01 = await import('../../../lib/eva/stage-templates/stage-01.js');
    const template = stage01.default;
    expect(template.outputSchema).toBeDefined();
    expect(Array.isArray(template.outputSchema)).toBe(true);
    expect(template.outputSchema.length).toBeGreaterThan(0);

    // sourceProvenance is derived — should not appear in outputSchema
    const fields = template.outputSchema.map(s => s.field);
    expect(fields).not.toContain('sourceProvenance');
    expect(fields).toContain('description');
    expect(fields).toContain('problemStatement');

    for (const entry of template.outputSchema) {
      expect(entry).toHaveProperty('field');
      expect(entry).toHaveProperty('type');
      expect(entry).toHaveProperty('required');
    }
  });
});

// SD-LEO-INFRA-STAGE-LAUNCH-READINESS-001 FR-5/TS-5: contract-validator.js used to carry a
// second, unexported, function-local CROSS_STAGE_DEPS copy (8 of 27 stages, no stage-24 entry,
// silently falling back to [targetStage-1]) that disagreed with the canonical export in
// stage-contracts.js for ~24 of 27 stages. It now imports the canonical map instead.
describe('FR-5: CROSS_STAGE_DEPS agreement regression guard', () => {
  it('validateContracts resolves requiredStages from the canonical CROSS_STAGE_DEPS for every stage 2-27', async () => {
    for (let stage = 2; stage <= 27; stage++) {
      const result = await validateContracts({ targetStage: stage, ventureId: 'test-venture', supabase: makeMockSupabase() });
      const expected = CROSS_STAGE_DEPS[stage] || [stage - 1];
      expect(result.requiredStages).toEqual(expected);
    }
  });

  it('stage 24 resolves to the canonical [1,18,19,20,21,22,23], not the old local fallback [23]', async () => {
    // SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-H (FR-5): CROSS_STAGE_DEPS[24] was pinned to the
    // pre-renumber "Go Live" deps [1,21,22,23] -- that list now correctly lives at key 25 (Go
    // Live's live-dispatched stage), and 24 (Launch Readiness Gate, was pinned at 23) carries the
    // full build-loop + UAT deps instead. The explicit literal below still guards against a
    // silent regression to the [targetStage-1] local-fallback bug this test was written for.
    const result = await validateContracts({ targetStage: 24, ventureId: 'test-venture', supabase: makeMockSupabase() });
    expect(result.requiredStages).toEqual([1, 18, 19, 20, 21, 22, 23]);
  });
});

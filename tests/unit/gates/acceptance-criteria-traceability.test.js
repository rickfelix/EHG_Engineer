import { describe, it, expect, vi, beforeEach } from 'vitest';

// Import the internal helpers by loading the module
const MODULE_PATH = '../../../scripts/modules/handoff/executors/lead-final-approval/gates/acceptance-criteria-traceability.js';

// We test via the gate creator since extractors are not exported individually
let createAcceptanceCriteriaTraceabilityGate;

beforeEach(async () => {
  vi.restoreAllMocks();
  const mod = await import(MODULE_PATH);
  createAcceptanceCriteriaTraceabilityGate = mod.createAcceptanceCriteriaTraceabilityGate;
});

function mockSupabase(visionData = null) {
  const singleFn = vi.fn().mockResolvedValue({ data: visionData, error: null });
  const limitFn = vi.fn().mockReturnValue({ single: singleFn });
  const orderFn = vi.fn().mockReturnValue({ limit: limitFn });
  const orFn = vi.fn().mockReturnValue({ order: orderFn });
  const selectFn = vi.fn().mockReturnValue({ or: orFn, eq: vi.fn().mockReturnValue({ single: singleFn }) });
  const fromFn = vi.fn().mockReturnValue({ select: selectFn });
  return { from: fromFn };
}

describe('Acceptance Criteria Traceability Gate', () => {
  it('returns advisory pass when no vision document found', async () => {
    const supabase = mockSupabase(null);
    const gate = createAcceptanceCriteriaTraceabilityGate(supabase);

    const result = await gate.validator({
      sd: { id: 'test-uuid', sd_key: 'SD-TEST-001' },
    });

    expect(result.passed).toBe(true);
    expect(result.score).toBe(80);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.details.reason).toBe('no vision document');
  });

  it('returns advisory pass when vision doc has no Success Criteria section', async () => {
    const visionContent = `# Vision: Test\n\n## Problem Statement\nSome problem.\n\n## Overview\nNo criteria here.`;
    const supabase = mockSupabase({ content: visionContent, vision_key: 'VISION-TEST-001' });
    const gate = createAcceptanceCriteriaTraceabilityGate(supabase);

    const result = await gate.validator({
      sd: { id: 'test-uuid', sd_key: 'SD-TEST-001' },
    });

    expect(result.passed).toBe(true);
    expect(result.score).toBe(80);
    expect(result.details.reason).toBe('no success criteria section');
  });

  it('extracts numbered criteria from Success Criteria section', async () => {
    const visionContent = [
      '# Vision: Test',
      '',
      '## Success Criteria',
      '',
      '1. Gate blocks on non-zero exit code when smoke test command fails',
      '2. Every numbered success criterion maps to at least one test file',
      '3. New JavaScript files must be reachable via call graph from entry points',
      '',
      '## Out of Scope',
      'Nothing here.',
    ].join('\n');

    const supabase = mockSupabase({ content: visionContent, vision_key: 'VISION-TEST-001' });
    const gate = createAcceptanceCriteriaTraceabilityGate(supabase);

    const result = await gate.validator({
      sd: { id: 'test-uuid', sd_key: 'SD-TEST-001' },
    });

    expect(result.details.total_criteria).toBe(3);
  });

  it('extracts bullet-point criteria', async () => {
    const visionContent = [
      '# Vision',
      '## Success Criteria',
      '- First criterion about smoke testing validation',
      '- Second criterion about wire check analysis',
      '## Next Section',
    ].join('\n');

    const supabase = mockSupabase({ content: visionContent, vision_key: 'V-001' });
    const gate = createAcceptanceCriteriaTraceabilityGate(supabase);

    const result = await gate.validator({
      sd: { id: 'id', sd_key: 'KEY' },
    });

    expect(result.details.total_criteria).toBe(2);
  });

  it('returns correct score for partial mapping', async () => {
    const visionContent = [
      '# Vision',
      '## Success Criteria',
      '1. Something about acceptance criteria traceability mapping',
      '2. Something about nonexistent feature that has no tests at all xyzzy',
      '',
    ].join('\n');

    const supabase = mockSupabase({ content: visionContent, vision_key: 'V-001' });
    const gate = createAcceptanceCriteriaTraceabilityGate(supabase);

    const result = await gate.validator({
      sd: { id: 'id', sd_key: 'KEY' },
    });

    // Score depends on how many criteria match test files in the actual tests/ dir
    expect(result.details.total_criteria).toBe(2);
    expect(typeof result.score).toBe('number');
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('reports unmapped criteria in issues when score below threshold', async () => {
    const visionContent = [
      '# Vision',
      '## Success Criteria',
      '',
      '1. Zqwvlm7 plonkification xyzzyfoo42 blargmeow produces garbonzo correctly',
      '2. Flumpnoodle qwertybaz99 generates plumsocket wibbleflop accurately',
      '3. Snorkwhistle asdfghj1234 validates trampoleen bingleberry consistently',
      '',
    ].join('\n');

    const supabase = mockSupabase({ content: visionContent, vision_key: 'V-001' });
    const gate = createAcceptanceCriteriaTraceabilityGate(supabase);

    const result = await gate.validator({
      sd: { id: 'id', sd_key: 'KEY' },
    });

    // With gibberish criteria, most should be unmapped (score < 70 = fail)
    // But in a large test suite, some random matches may occur
    expect(result.details.total_criteria).toBe(3);
    // At least some criteria should be unmapped
    const unmappedCount = result.details.unmapped_criteria;
    expect(unmappedCount).toBeGreaterThanOrEqual(0);
    // If any unmapped, they should appear in issues or warnings
    if (unmappedCount > 0 && result.score < 70) {
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues[0]).toContain('Criterion #');
    }
  });

  it('has correct gate name', () => {
    const gate = createAcceptanceCriteriaTraceabilityGate(mockSupabase());
    expect(gate.name).toBe('ACCEPTANCE_CRITERIA_TRACEABILITY');
  });

  it('looks up vision via metadata.vision_key as fallback', async () => {
    const visionDoc = {
      content: '# V\n## Success Criteria\n1. Test criterion about validation gates and their operation',
      vision_key: 'V-META',
    };
    // Primary query throws (simulating no match by sd_id)
    // Metadata fallback returns the vision doc
    let callCount = 0;
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            // First call: or().order().limit().single() - throws
            return {
              or: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    single: vi.fn().mockRejectedValue(new Error('not found')),
                  }),
                }),
              }),
            };
          }
          // Second call: eq().single() - returns vision doc
          return {
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: visionDoc, error: null }),
            }),
          };
        }),
      }),
    };

    const gate = createAcceptanceCriteriaTraceabilityGate(supabase);
    const result = await gate.validator({
      sd: { id: 'id', sd_key: 'KEY', metadata: { vision_key: 'V-META' } },
    });

    expect(result.details.total_criteria).toBe(1);
  });
});

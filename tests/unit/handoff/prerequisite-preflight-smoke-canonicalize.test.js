/**
 * Tests for canonicalizeSmokeStep helper + dual-shape backward-compat
 * in checkLeadToPlanPrereqs smoke_test_steps validation.
 *
 * SD-LEO-INFRA-SMOKE-TEST-SCHEMA-RECONCILE-001
 *
 * Verifies:
 * - canonicalizeSmokeStep returns {instruction, expected_outcome} for both shapes
 * - Legacy {step, expected} smoke_test_steps pass LEAD-TO-PLAN preflight
 * - Canonical {instruction, expected_outcome} continue passing (no regression)
 * - Mixed array (legacy + canonical) passes
 * - Genuinely malformed steps still emit SMOKE_TEST_INVALID
 * - Empty array still emits SMOKE_TEST_MISSING (distinct from INVALID)
 */
import { describe, it, expect } from 'vitest';
import {
  canonicalizeSmokeStep,
  runPrerequisitePreflight
} from '../../../scripts/modules/handoff/pre-checks/prerequisite-preflight.js';

describe('canonicalizeSmokeStep() helper', () => {
  it('returns canonical shape unchanged for {instruction, expected_outcome}', () => {
    const out = canonicalizeSmokeStep({ instruction: 'do x', expected_outcome: 'y happens' });
    expect(out).toEqual({ instruction: 'do x', expected_outcome: 'y happens' });
  });

  it('canonicalizes legacy {step, expected} to {instruction, expected_outcome}', () => {
    const out = canonicalizeSmokeStep({ step: 'do x', expected: 'y happens' });
    expect(out).toEqual({ instruction: 'do x', expected_outcome: 'y happens' });
  });

  it('accepts {instruction_template, expected_outcome_template} (PRECHECK gate parity)', () => {
    const out = canonicalizeSmokeStep({
      instruction_template: 'tmpl x',
      expected_outcome_template: 'tmpl y'
    });
    expect(out).toEqual({ instruction: 'tmpl x', expected_outcome: 'tmpl y' });
  });

  it('returns both keys undefined for empty object', () => {
    const out = canonicalizeSmokeStep({});
    expect(out).toEqual({ instruction: undefined, expected_outcome: undefined });
  });

  it('returns both keys undefined for null/undefined input', () => {
    expect(canonicalizeSmokeStep(null)).toEqual({ instruction: undefined, expected_outcome: undefined });
    expect(canonicalizeSmokeStep(undefined)).toEqual({ instruction: undefined, expected_outcome: undefined });
  });

  it('returns both keys undefined for non-object input (string/number/array)', () => {
    expect(canonicalizeSmokeStep('string')).toEqual({ instruction: undefined, expected_outcome: undefined });
    expect(canonicalizeSmokeStep(42)).toEqual({ instruction: undefined, expected_outcome: undefined });
  });

  it('prefers canonical keys when both shapes present (canonical wins)', () => {
    const out = canonicalizeSmokeStep({
      instruction: 'canonical',
      expected_outcome: 'canonical_out',
      step: 'legacy',
      expected: 'legacy_out'
    });
    expect(out).toEqual({ instruction: 'canonical', expected_outcome: 'canonical_out' });
  });

  it('preserves step_number untouched (caller-managed)', () => {
    // canonicalize only normalizes instruction/expected_outcome — step_number
    // is not part of the canonical shape it produces. Caller can read
    // step.step_number off the original object if needed.
    const out = canonicalizeSmokeStep({ step_number: 1, step: 'a', expected: 'b' });
    expect(out.instruction).toBe('a');
    expect(out.expected_outcome).toBe('b');
  });
});

describe('checkLeadToPlanPrereqs smoke_test_steps via canonicalizer', () => {
  function makeMockSupabase({ sdRow }) {
    return {
      from: () => {
        const builder = {
          select: () => builder,
          eq: () => builder,
          single: async () => ({ data: sdRow, error: null })
        };
        return builder;
      }
    };
  }

  function baseSdFixture(overrides = {}) {
    return {
      id: 'SD-TEST-CANON-001',
      sd_key: 'SD-TEST-CANON-001',
      sd_type: 'bugfix',
      description: 'a '.repeat(60),
      success_criteria: [{ criterion: 'x', measure: 'y' }],
      strategic_objectives: ['Objective 1'],
      key_changes: [{ change: 'c', type: 'fix' }],
      key_principles: ['p1'],
      risks: [{ risk: 'r', mitigation: 'm' }],
      implementation_guidelines: ['g1'],
      dependencies: [],
      ...overrides
    };
  }

  it('legacy {step, expected} array passes preflight', async () => {
    const sd = baseSdFixture({
      smoke_test_steps: [{ step: 'do x', expected: 'y happens' }]
    });
    const supabase = makeMockSupabase({ sdRow: sd });

    const result = await runPrerequisitePreflight(supabase, 'LEAD-TO-PLAN', sd.sd_key);
    const codes = result.issues.map((i) => i.code);
    expect(codes).not.toContain('SMOKE_TEST_INVALID');
    expect(codes).not.toContain('SMOKE_TEST_MISSING');
  });

  it('canonical {instruction, expected_outcome} array passes preflight (no regression)', async () => {
    const sd = baseSdFixture({
      smoke_test_steps: [{ instruction: 'do x', expected_outcome: 'y happens' }]
    });
    const supabase = makeMockSupabase({ sdRow: sd });

    const result = await runPrerequisitePreflight(supabase, 'LEAD-TO-PLAN', sd.sd_key);
    const codes = result.issues.map((i) => i.code);
    expect(codes).not.toContain('SMOKE_TEST_INVALID');
    expect(codes).not.toContain('SMOKE_TEST_MISSING');
  });

  it('mixed array (legacy + canonical) passes preflight', async () => {
    const sd = baseSdFixture({
      smoke_test_steps: [
        { step: 'a', expected: 'b' },
        { instruction: 'c', expected_outcome: 'd' }
      ]
    });
    const supabase = makeMockSupabase({ sdRow: sd });

    const result = await runPrerequisitePreflight(supabase, 'LEAD-TO-PLAN', sd.sd_key);
    const codes = result.issues.map((i) => i.code);
    expect(codes).not.toContain('SMOKE_TEST_INVALID');
    expect(codes).not.toContain('SMOKE_TEST_MISSING');
  });

  it('malformed step (missing both pairs) still emits SMOKE_TEST_INVALID', async () => {
    const sd = baseSdFixture({
      smoke_test_steps: [{}]
    });
    const supabase = makeMockSupabase({ sdRow: sd });

    const result = await runPrerequisitePreflight(supabase, 'LEAD-TO-PLAN', sd.sd_key);
    const codes = result.issues.map((i) => i.code);
    expect(codes).toContain('SMOKE_TEST_INVALID');
  });

  it('partial step (only step, no expected) emits SMOKE_TEST_INVALID', async () => {
    const sd = baseSdFixture({
      smoke_test_steps: [{ step: 'do x' }]
    });
    const supabase = makeMockSupabase({ sdRow: sd });

    const result = await runPrerequisitePreflight(supabase, 'LEAD-TO-PLAN', sd.sd_key);
    const codes = result.issues.map((i) => i.code);
    expect(codes).toContain('SMOKE_TEST_INVALID');
    const invalid = result.issues.find((i) => i.code === 'SMOKE_TEST_INVALID');
    expect(invalid.message).toContain('expected_outcome');
  });

  it('empty array emits SMOKE_TEST_MISSING (preserved, distinct from INVALID)', async () => {
    const sd = baseSdFixture({ smoke_test_steps: [] });
    const supabase = makeMockSupabase({ sdRow: sd });

    const result = await runPrerequisitePreflight(supabase, 'LEAD-TO-PLAN', sd.sd_key);
    const codes = result.issues.map((i) => i.code);
    expect(codes).toContain('SMOKE_TEST_MISSING');
    expect(codes).not.toContain('SMOKE_TEST_INVALID');
  });

  it('SMOKE_TEST_INVALID remediation mentions both shapes accepted', async () => {
    const sd = baseSdFixture({ smoke_test_steps: [{}] });
    const supabase = makeMockSupabase({ sdRow: sd });

    const result = await runPrerequisitePreflight(supabase, 'LEAD-TO-PLAN', sd.sd_key);
    const invalid = result.issues.find((i) => i.code === 'SMOKE_TEST_INVALID');
    expect(invalid).toBeDefined();
    // Canonical shape example must remain visible
    expect(invalid.remediation).toContain('instruction');
    expect(invalid.remediation).toContain('expected_outcome');
    // Legacy support note must be present
    expect(invalid.remediation).toContain('Legacy');
    expect(invalid.remediation).toContain('auto-canonicalized');
  });
});

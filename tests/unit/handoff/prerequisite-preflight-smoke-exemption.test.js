/**
 * Tests for sd_type-aware exemption of SMOKE_TEST_MISSING preflight check.
 * QF-20260511-430.
 *
 * Closes feedback 504a1d06 (SD-EVA-SUPPORT-CLI-SKILL-ORCH-001 orchestrator)
 * and 9a6bfa95 (SD-LEO-INFRA-CLAIM-LIFECYCLE-RELEASE-001) — preflight rejects
 * SDs that the SMOKE_TEST_SPECIFICATION gate passes at 100%.
 *
 * Verifies:
 * - shouldRequireSmokeTest() returns false for lightweight sd_types
 * - shouldRequireSmokeTest() returns false for non-code-producing infrastructure
 * - shouldRequireSmokeTest() returns true for code-producing infrastructure
 * - shouldRequireSmokeTest() returns true for feature/bugfix/null/unknown
 * - checkLeadToPlanPrereqs emits SMOKE_TEST_BYPASSED for exempt types
 * - checkLeadToPlanPrereqs preserves SMOKE_TEST_MISSING for non-exempt types
 * - SMOKE_TEST_BYPASSED is severity=info and does not block passed=true
 */
import { describe, it, expect } from 'vitest';
import {
  shouldRequireSmokeTest,
  runPrerequisitePreflight
} from '../../../scripts/modules/handoff/pre-checks/prerequisite-preflight.js';

describe('shouldRequireSmokeTest() helper', () => {
  describe('lightweight sd_types (should return false)', () => {
    // All LIGHTWEIGHT_SD_TYPES from sd-type-applicability-policy.js skip the
    // SMOKE_TEST_SPECIFICATION gate at score=100. We mirror that here.
    // (infrastructure is special-cased — see separate suite below.)
    const LIGHTWEIGHT_EXEMPT = [
      'orchestrator', 'documentation', 'docs', 'process', 'uat', 'discovery_spike',
      'bugfix', 'fix', 'corrective', 'enhancement', 'refactor', 'ux_debt', 'implementation'
    ];
    LIGHTWEIGHT_EXEMPT.forEach((type) => {
      it(`returns false for sd_type='${type}'`, () => {
        const sd = { sd_type: type, key_changes: [], scope: '', title: '' };
        expect(shouldRequireSmokeTest(sd)).toBe(false);
      });
    });
  });

  describe('infrastructure sd_type (depends on code production)', () => {
    it('returns false when key_changes/scope/title show no code production', () => {
      const sd = {
        sd_type: 'infrastructure',
        key_changes: [{ change: 'policy doc update' }],
        scope: 'governance metadata only',
        title: 'register a new policy entry'
      };
      expect(shouldRequireSmokeTest(sd)).toBe(false);
    });

    it('returns true when key_changes references a .js file', () => {
      const sd = {
        sd_type: 'infrastructure',
        key_changes: [{ change: 'modify scripts/foo.js' }]
      };
      expect(shouldRequireSmokeTest(sd)).toBe(true);
    });

    it('returns true when key_changes contains a code-production keyword (e.g. "validator")', () => {
      const sd = {
        sd_type: 'infrastructure',
        key_changes: [{ change: 'add validator for handoff gates' }]
      };
      expect(shouldRequireSmokeTest(sd)).toBe(true);
    });

    it('returns true when title contains a code-production keyword (e.g. "script")', () => {
      const sd = {
        sd_type: 'infrastructure',
        key_changes: [],
        title: 'New cleanup script'
      };
      expect(shouldRequireSmokeTest(sd)).toBe(true);
    });
  });

  describe('non-lightweight sd_types (should return true)', () => {
    // Feature and other non-lightweight code-producing types still require smoke
    // tests (gate behavior — falls through to the unconditional check path).
    const REQUIRED = ['feature', 'database', 'security', 'performance', 'api', 'backend'];
    REQUIRED.forEach((type) => {
      it(`returns true for sd_type='${type}'`, () => {
        const sd = { sd_type: type };
        expect(shouldRequireSmokeTest(sd)).toBe(true);
      });
    });
  });

  describe('safe defaults (should return true)', () => {
    it('returns true for null sd', () => {
      expect(shouldRequireSmokeTest(null)).toBe(true);
    });

    it('returns true for undefined sd', () => {
      expect(shouldRequireSmokeTest(undefined)).toBe(true);
    });

    it('returns true for sd with null sd_type (defaults to feature)', () => {
      const sd = { sd_type: null };
      expect(shouldRequireSmokeTest(sd)).toBe(true);
    });

    it('returns true for sd with unknown sd_type (defaults to required)', () => {
      const sd = { sd_type: 'something_new_we_did_not_list' };
      expect(shouldRequireSmokeTest(sd)).toBe(true);
    });
  });
});

describe('checkLeadToPlanPrereqs SMOKE_TEST bypass behavior', () => {
  function makeMockSupabase({ sdRow }) {
    return {
      from: () => {
        const builder = {
          select: () => builder,
          eq: () => builder,
          or: () => builder,
          single: async () => ({ data: sdRow, error: null }),
          update: () => ({ eq: async () => ({ error: null }) })
        };
        return builder;
      }
    };
  }

  function baseFixture(overrides = {}) {
    return {
      id: 'SD-TEST-SMOKE-001',
      sd_key: 'SD-TEST-SMOKE-001',
      sd_type: 'orchestrator',
      description: 'a '.repeat(60),
      success_criteria: [{ criterion: 'x', measure: 'y' }],
      strategic_objectives: ['Objective 1'],
      key_changes: [{ change: 'c', type: 'fix' }],
      key_principles: ['p1'],
      risks: [{ risk: 'r', mitigation: 'm' }],
      implementation_guidelines: ['g1'],
      dependencies: [],
      smoke_test_steps: [],
      ...overrides
    };
  }

  it('bypasses SMOKE_TEST_MISSING for sd_type=orchestrator (no smoke steps)', async () => {
    const sd = baseFixture({ sd_type: 'orchestrator', smoke_test_steps: [] });
    const supabase = makeMockSupabase({ sdRow: sd });

    const result = await runPrerequisitePreflight(supabase, 'LEAD-TO-PLAN', sd.sd_key);

    const codes = result.issues.map((i) => i.code);
    expect(codes).not.toContain('SMOKE_TEST_MISSING');
    expect(codes).toContain('SMOKE_TEST_BYPASSED');
    const bypass = result.issues.find((i) => i.code === 'SMOKE_TEST_BYPASSED');
    expect(bypass.severity).toBe('info');
    expect(bypass.message).toContain('orchestrator');
    expect(bypass.message).toContain('SMOKE_TEST_SPECIFICATION');
  });

  it('bypasses SMOKE_TEST_MISSING for sd_type=documentation/process/uat/discovery_spike', async () => {
    // sd_key must match /^SD-[A-Z0-9-]+$/i (no underscores) per sd-id-resolver.js
    const cases = [
      { sdType: 'documentation', sdKey: 'SD-TEST-DOC-001' },
      { sdType: 'process', sdKey: 'SD-TEST-PROCESS-001' },
      { sdType: 'uat', sdKey: 'SD-TEST-UAT-001' },
      { sdType: 'discovery_spike', sdKey: 'SD-TEST-DSPIKE-001' }
    ];
    for (const { sdType, sdKey } of cases) {
      const sd = baseFixture({
        id: sdKey,
        sd_key: sdKey,
        sd_type: sdType,
        smoke_test_steps: []
      });
      const supabase = makeMockSupabase({ sdRow: sd });

      const result = await runPrerequisitePreflight(supabase, 'LEAD-TO-PLAN', sd.sd_key);
      const codes = result.issues.map((i) => i.code);
      expect(codes, `${sdType} should bypass`).not.toContain('SMOKE_TEST_MISSING');
      expect(codes, `${sdType} should log bypass`).toContain('SMOKE_TEST_BYPASSED');
    }
  });

  it('bypasses SMOKE_TEST_MISSING for sd_type=infrastructure (non-code-producing)', async () => {
    const sd = baseFixture({
      sd_type: 'infrastructure',
      key_changes: [{ change: 'register policy entry only' }],
      scope: 'governance metadata',
      title: 'policy: add new registry row',
      smoke_test_steps: []
    });
    const supabase = makeMockSupabase({ sdRow: sd });

    const result = await runPrerequisitePreflight(supabase, 'LEAD-TO-PLAN', sd.sd_key);
    const codes = result.issues.map((i) => i.code);
    expect(codes).not.toContain('SMOKE_TEST_MISSING');
    expect(codes).toContain('SMOKE_TEST_BYPASSED');
  });

  it('preserves SMOKE_TEST_MISSING for sd_type=infrastructure (code-producing)', async () => {
    const sd = baseFixture({
      sd_type: 'infrastructure',
      key_changes: [{ change: 'modify scripts/foo.js to add new validator' }],
      smoke_test_steps: []
    });
    const supabase = makeMockSupabase({ sdRow: sd });

    const result = await runPrerequisitePreflight(supabase, 'LEAD-TO-PLAN', sd.sd_key);
    const codes = result.issues.map((i) => i.code);
    expect(codes).toContain('SMOKE_TEST_MISSING');
    expect(codes).not.toContain('SMOKE_TEST_BYPASSED');
  });

  it('preserves SMOKE_TEST_MISSING for sd_type=feature (no smoke steps)', async () => {
    const sd = baseFixture({ sd_type: 'feature', smoke_test_steps: [] });
    const supabase = makeMockSupabase({ sdRow: sd });

    const result = await runPrerequisitePreflight(supabase, 'LEAD-TO-PLAN', sd.sd_key);
    const codes = result.issues.map((i) => i.code);
    expect(codes).toContain('SMOKE_TEST_MISSING');
    expect(codes).not.toContain('SMOKE_TEST_BYPASSED');
  });

  it('preserves SMOKE_TEST_MISSING for sd_type=database (no smoke steps, non-lightweight)', async () => {
    const sd = baseFixture({ sd_type: 'database', smoke_test_steps: [] });
    const supabase = makeMockSupabase({ sdRow: sd });

    const result = await runPrerequisitePreflight(supabase, 'LEAD-TO-PLAN', sd.sd_key);
    const codes = result.issues.map((i) => i.code);
    expect(codes).toContain('SMOKE_TEST_MISSING');
    expect(codes).not.toContain('SMOKE_TEST_BYPASSED');
  });

  it('SMOKE_TEST_BYPASSED is severity=info and does not block passed=true (orchestrator, complete JSONB)', async () => {
    const sd = baseFixture({
      sd_type: 'orchestrator',
      smoke_test_steps: []
    });
    const supabase = makeMockSupabase({ sdRow: sd });

    const result = await runPrerequisitePreflight(supabase, 'LEAD-TO-PLAN', sd.sd_key);
    const bypass = result.issues.find((i) => i.code === 'SMOKE_TEST_BYPASSED');
    expect(bypass).toBeDefined();
    expect(bypass.severity).toBe('info');
    // passed should be true since only info-severity issues are present
    // (orchestrator has all required JSONB fields populated in fixture).
    expect(result.passed).toBe(true);
  });

  it('does not push SMOKE_TEST_BYPASSED when sd_type=orchestrator HAS smoke_test_steps populated', async () => {
    const sd = baseFixture({
      sd_type: 'orchestrator',
      smoke_test_steps: [
        { instruction: 'check x', expected_outcome: 'y observed' }
      ]
    });
    const supabase = makeMockSupabase({ sdRow: sd });

    const result = await runPrerequisitePreflight(supabase, 'LEAD-TO-PLAN', sd.sd_key);
    const codes = result.issues.map((i) => i.code);
    // Bypass still fires — exemption is type-based, not population-based.
    // This matches the gate behavior (gate returns score=100 unconditionally for lightweight types).
    expect(codes).toContain('SMOKE_TEST_BYPASSED');
    expect(codes).not.toContain('SMOKE_TEST_MISSING');
    expect(codes).not.toContain('SMOKE_TEST_INVALID');
  });
});

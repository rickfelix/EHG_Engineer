import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies before importing source
vi.mock('../../../../sd-type-checker.js', () => ({
  isInfrastructureSDSync: vi.fn(() => false),
  getThresholdProfile: vi.fn(async () => ({ retrospectiveQuality: 70 })),
}));

vi.mock('../../../../sd-quality-validation.js', () => ({
  validateSDCompletionReadiness: vi.fn(),
  getSDImprovementGuidance: vi.fn(() => 'Improve retrospective quality'),
}));

import { isInfrastructureSDSync, getThresholdProfile } from '../../../../sd-type-checker.js';
import { validateSDCompletionReadiness, getSDImprovementGuidance } from '../../../../sd-quality-validation.js';
import { createRetrospectiveQualityGate } from './retrospective-quality.js';
import { createMockSD } from '../../../../../../tests/factories/validator-context-factory.js';

/** Build a Supabase mock that returns different data per table */
function buildSupabase({ children = [], retrospective = null, childError = null, handoffRow = null }) {
  const makeChainable = (resolveValue) => {
    const c = {
      select: () => c, eq: () => c, neq: () => c, or: () => c, gt: () => c, gte: () => c, lt: () => c, lte: () => c, is: () => c,
      order: () => c, limit: () => c,
      single: () => Promise.resolve(resolveValue),
      maybeSingle: () => Promise.resolve(resolveValue),
      then: (fn) => Promise.resolve(resolveValue).then(fn),
    };
    return c;
  };

  return {
    from: vi.fn((table) => {
      if (table === 'strategic_directives_v2') {
        return { select: () => makeChainable({ data: children, error: childError }) };
      }
      if (table === 'retrospectives') {
        return { select: () => makeChainable({ data: retrospective, error: null }) };
      }
      if (table === 'sd_phase_handoffs') {
        return { select: () => makeChainable({ data: handoffRow, error: null }) };
      }
      return { select: () => makeChainable({ data: [], error: null }) };
    }),
    rpc: vi.fn(),
  };
}

describe('RETROSPECTIVE_QUALITY_GATE', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('has correct gate metadata', () => {
    const gate = createRetrospectiveQualityGate(buildSupabase({}));
    expect(gate.name).toBe('RETROSPECTIVE_QUALITY_GATE');
    expect(gate.required).toBe(true);
  });

  it('auto-passes for orchestrator with all children completed and published retro', async () => {
    const children = [
      { id: 'child-1', title: 'Child 1', status: 'completed' },
      { id: 'child-2', title: 'Child 2', status: 'completed' },
    ];
    const retro = { id: 'retro-1', quality_score: 75, status: 'PUBLISHED' };
    const supabase = buildSupabase({ children, retrospective: retro });
    const gate = createRetrospectiveQualityGate(supabase);

    // SD-LEO-INFRA-RETRO-INTEGRITY-RUN-001 FR-3: the orchestrator fast-path no longer gates on
    // the STORED retrospectives.quality_score (a diagnostic gauge this SD measured to be
    // writer-fabricated). It now requires a MEASURED assessment, so this test states that
    // precondition explicitly instead of inheriting a pass from the stored number.
    // The mock's un-stubbed default is undefined, which fails closed — correct by design.
    validateSDCompletionReadiness.mockResolvedValue({ passed: true, score: 75, issues: [], warnings: [] });

    const ctx = { sd: createMockSD({ id: 'parent-uuid' }) };
    const result = await gate.validator(ctx);

    expect(result.passed).toBe(true);
    expect(result.details.orchestrator_auto_pass).toBe(true);
    // Still 75, but now the ASSESSED score rather than the stored gauge.
    expect(result.score).toBe(75);
  });

  // SD-LEO-INFRA-RETRO-INTEGRITY-RUN-001 FR-3 — THE REFUSE HALF.
  //
  // Added because mutation-testing exposed that it was missing: disabling the new assessment
  // guard killed ZERO tests, meaning the accept case alone could not tell a working guard from
  // an absent one. That is the exact defect class this SD exists to abolish, found in my own
  // control, so it is fixed here rather than noted.
  it('DECLINES the orchestrator fast-path when the retrospective does not pass assessment', async () => {
    const children = [
      { id: 'child-1', title: 'Child 1', status: 'completed' },
      { id: 'child-2', title: 'Child 2', status: 'completed' },
    ];
    // A high STORED gauge that would have auto-passed under the old quality_score >= 60 predicate.
    const retro = { id: 'retro-1', quality_score: 95, status: 'PUBLISHED' };
    const supabase = buildSupabase({ children, retrospective: retro });
    const gate = createRetrospectiveQualityGate(supabase);

    // ...but the MEASURED assessment says no.
    validateSDCompletionReadiness.mockResolvedValue({ passed: false, score: 20, issues: ['thin'], warnings: [] });

    const ctx = { sd: createMockSD({ id: 'parent-uuid' }) };
    const result = await gate.validator(ctx);

    // It must NOT auto-pass on the stored gauge; the fast-path declines and standard validation runs.
    expect(result.details?.orchestrator_auto_pass).toBeUndefined();
    expect(result.passed).toBe(false);
  });

  it('auto-passes for database type SD with retrospective', async () => {
    const retro = { id: 'retro-2', quality_score: 65 };
    const supabase = buildSupabase({ retrospective: retro });
    const gate = createRetrospectiveQualityGate(supabase);

    const ctx = { sd: createMockSD({ sd_type: 'database', id: 'db-uuid' }) };
    const result = await gate.validator(ctx);

    expect(result.passed).toBe(true);
    expect(result.details.database_auto_pass).toBe(true);
  });

  it('auto-passes for bugfix type SD with retrospective', async () => {
    const retro = { id: 'retro-3', quality_score: 55 };
    const supabase = buildSupabase({ retrospective: retro });
    const gate = createRetrospectiveQualityGate(supabase);

    const ctx = { sd: createMockSD({ sd_type: 'bugfix', id: 'fix-uuid' }) };
    const result = await gate.validator(ctx);

    expect(result.passed).toBe(true);
    expect(result.details.bugfix_auto_pass).toBe(true);
  });

  it('fails when retrospective score is below threshold for feature SD', async () => {
    const retro = { id: 'retro-4', quality_score: 40 };
    const supabase = buildSupabase({ retrospective: retro });
    const gate = createRetrospectiveQualityGate(supabase);

    validateSDCompletionReadiness.mockResolvedValue({
      score: 55,
      issues: ['Boilerplate key_learnings detected'],
      warnings: [],
      improvements: [{ criterion: 'learning_specificity', score: 3, weight: 0.4, suggestion: 'Add specific details' }],
    });
    getThresholdProfile.mockResolvedValue({ retrospectiveQuality: 70 });

    const ctx = { sd: createMockSD({ sd_type: 'feature', id: 'feat-uuid' }) };
    const result = await gate.validator(ctx);

    expect(result.passed).toBe(false);
    expect(result.score).toBe(55);
    expect(result.issues).toContain('Boilerplate key_learnings detected');
  });

  it('passes when retrospective score meets threshold for feature SD', async () => {
    const retro = { id: 'retro-5', quality_score: 80 };
    const supabase = buildSupabase({ retrospective: retro });
    const gate = createRetrospectiveQualityGate(supabase);

    validateSDCompletionReadiness.mockResolvedValue({
      score: 82,
      issues: [],
      warnings: ['Minor: could improve action_items'],
      improvements: [],
    });
    getThresholdProfile.mockResolvedValue({ retrospectiveQuality: 70 });

    const ctx = { sd: createMockSD({ sd_type: 'feature', id: 'feat-uuid-2' }) };
    const result = await gate.validator(ctx);

    expect(result.passed).toBe(true);
    expect(result.score).toBe(82);
  });

  // SD-LEO-INFRA-WIRE-EXISTING-RETROSPECTIVEQUALITYRUBRIC-001: the infrastructure existence
  // auto-pass is deliberately DELETED. These tests previously ratified passed:true on retro
  // existence — the hole that let 70.4% of SDs (3935/5591 measured) clear completion without
  // content scoring. Infra/process/doc SDs now flow to the standard blended validation; FR-0
  // measured that thin-but-SD-specific retros pass it (67 >= 55), so no PAT-AUTO-047 re-break.
  it('infrastructure SD with a CONTENT-WORTHY retro passes via the STANDARD path (no auto-pass)', async () => {
    const retro = { id: 'retro-6', quality_score: 45 };
    const supabase = buildSupabase({ retrospective: retro });
    // FR-0 anchor: thin-legit-specific infra retro scored 67 blended against threshold 55.
    validateSDCompletionReadiness.mockResolvedValue({ passed: true, score: 67, issues: [], warnings: [], improvements: [] });
    getThresholdProfile.mockResolvedValue({ retrospectiveQuality: 55 });
    const gate = createRetrospectiveQualityGate(supabase);

    const ctx = { sd: createMockSD({ sd_type: 'infrastructure', id: 'infra-uuid' }) };
    const result = await gate.validator(ctx);

    expect(result.passed).toBe(true);
    expect(result.score).toBe(67);
    expect(result.details?.infrastructure_auto_pass).toBeUndefined();
    expect(validateSDCompletionReadiness).toHaveBeenCalled();
  });

  it('infrastructure SD with a BOILERPLATE retro FAILS — existence alone no longer passes', async () => {
    const retro = { id: 'retro-7', quality_score: 70 };
    const supabase = buildSupabase({ retrospective: retro });
    // FR-0 anchor: template-boilerplate blended ~49 after the -25 detectBoilerplate penalty.
    validateSDCompletionReadiness.mockResolvedValue({ passed: false, score: 49, issues: ['boilerplate'], warnings: [], improvements: [] });
    getThresholdProfile.mockResolvedValue({ retrospectiveQuality: 55 });
    const gate = createRetrospectiveQualityGate(supabase);

    const ctx = { sd: createMockSD({ sd_type: 'infrastructure', id: 'infra-uuid-2' }) };
    const result = await gate.validator(ctx);

    expect(result.passed).toBe(false);
    expect(result.score).toBe(49);
    expect(result.details?.infrastructure_auto_pass).toBeUndefined();
  });

  // SD-LEO-INFRA-RETROSPECTIVE-GATES-FAIL-001 — new failure-mode tests.
  // The shared retro-filters helper applies three filters (existence, retro_type,
  // freshness). Any row that fails a filter is returned to the gate as null —
  // so the four new "failure mode" tests here all exercise the helper-returns-null
  // path at the gate level. Filter-level unit tests live in retro-filters.test.js.
  it('hard-fails when no retrospective exists (zero rows / helper returns null)', async () => {
    // AC1: zero rows in retrospectives for this SD
    const supabase = buildSupabase({ retrospective: null });
    const gate = createRetrospectiveQualityGate(supabase);

    const ctx = { sd: createMockSD({ sd_type: 'feature', id: 'none-uuid', sd_key: 'SD-NONE-TEST-001' }) };
    const result = await gate.validator(ctx);

    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.issues[0]).toMatch(/No SD-completion retrospective found for SD SD-NONE-TEST-001/);
    expect(result.remediation).toMatch(/generate-retrospective\.js/);
    // AC1 acceptance: validateSDCompletionReadiness must NOT be called on null retro
    expect(validateSDCompletionReadiness).not.toHaveBeenCalled();
  });

  it('hard-fails when only a handoff-time retro exists (pre-LEAD timestamp filtered out)', async () => {
    // AC2: helper filters out handoff-time retros via created_at > leadToPlanAcceptedAt.
    // At the gate level this is indistinguishable from zero rows — the helper returns null.
    const supabase = buildSupabase({ retrospective: null });
    const gate = createRetrospectiveQualityGate(supabase);

    const ctx = { sd: createMockSD({ sd_type: 'feature', id: 'stale-uuid', sd_key: 'SD-STALE-RETRO-001' }) };
    const result = await gate.validator(ctx);

    expect(result.passed).toBe(false);
    expect(result.issues[0]).toMatch(/must be retro_type=SD_COMPLETION with created_at >/);
    expect(result.remediation).toMatch(/handoff-time retrospective does not satisfy this gate/);
    expect(validateSDCompletionReadiness).not.toHaveBeenCalled();
  });

  it('hard-fails when only a non-SD_COMPLETION retro exists (retro_type filter rejected)', async () => {
    // AC3: retro_type filter excludes SPRINT/INCIDENT/AUDIT rows. The helper returns null
    // when no row passes the filter — gate behaviour is identical to AC1/AC2 failure modes.
    const supabase = buildSupabase({ retrospective: null });
    const gate = createRetrospectiveQualityGate(supabase);

    const ctx = { sd: createMockSD({ sd_type: 'feature', id: 'sprint-uuid', sd_key: 'SD-WRONG-TYPE-001' }) };
    const result = await gate.validator(ctx);

    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.issues[0]).toMatch(/No SD-completion retrospective found for SD SD-WRONG-TYPE-001/);
    expect(validateSDCompletionReadiness).not.toHaveBeenCalled();
  });

  it('infrastructure with a valid SD-completion retro is CONTENT-scored, never existence-passed', async () => {
    // Rewritten by SD-LEO-INFRA-WIRE-EXISTING-RETROSPECTIVEQUALITYRUBRIC-001: this test used to
    // ratify the existence fast-path ("passes ... unchanged") — the 70.4% hole. The retro-filter
    // regression it guarded (a valid three-filter retro reaches scoring) is preserved: the retro
    // must arrive AND be scored, not short-circuited.
    const retro = { id: 'retro-valid', quality_score: 70, retro_type: 'SD_COMPLETION', status: 'PUBLISHED' };
    const supabase = buildSupabase({ retrospective: retro });
    validateSDCompletionReadiness.mockResolvedValue({ passed: true, score: 67, issues: [], warnings: [], improvements: [] });
    getThresholdProfile.mockResolvedValue({ retrospectiveQuality: 55 });
    const gate = createRetrospectiveQualityGate(supabase);

    const ctx = { sd: createMockSD({ sd_type: 'infrastructure', id: 'infra-valid-uuid' }) };
    const result = await gate.validator(ctx);

    expect(result.passed).toBe(true);
    expect(result.details?.infrastructure_auto_pass).toBeUndefined();
    // The valid retro reached the CONTENT scorer — the filter regression this test guards.
    expect(validateSDCompletionReadiness).toHaveBeenCalled();
  });
});

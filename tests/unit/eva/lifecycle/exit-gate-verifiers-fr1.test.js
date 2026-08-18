/**
 * Behavioral tests for the 9 FR-1 verifiers newly registered by
 * SD-FDBK-FIX-EXIT-GATE-CONFORMANCE-001 (verifyTitleValidated ..
 * verifyLaunchReadinessGreen in lib/eva/lifecycle/exit-gate-verifiers.js).
 *
 * TESTING finding N3: these 9 verifiers had zero behavioral coverage — only
 * the live registry resolution count (7/21 -> 16/21) was checked. A fail-
 * closed binding gate is a total stage lockout on a silent regression (a
 * typo'd `match` key, an inverted condition, a renamed source column) with
 * no test to catch it before it reaches production. This file closes that
 * gap the same way exit-gate-verifier-verdict.test.js already does for the
 * pre-existing verifyBuildMvpBuildPresent: resolve the verifier via the
 * EXACT gate string it documents backing (so a `match` key typo fails this
 * suite), then exercise its satisfied/unsatisfied paths against a mock.
 */
import { describe, it, expect } from 'vitest';
import { resolveVerifier } from '../../../../lib/eva/lifecycle/exit-gate-verifiers.js';

const VID = '11111111-2222-3333-4444-555555555555';
const STAGE = 3;

/** Chain mock covering every builder method the FR-1 verifiers call
 * (from/select/eq/is/not/limit/maybeSingle). Each call returns the same
 * chain; only the terminal maybeSingle() resolution is configurable. */
function mockSupabase({ data = null, error = null } = {}) {
  const chain = {
    from() { return chain; },
    select() { return chain; },
    eq() { return chain; },
    is() { return chain; },
    not() { return chain; },
    limit() { return chain; },
    async maybeSingle() { return { data, error }; },
  };
  return chain;
}

describe('verifyTitleValidated (gate string: "Title validated (3-120 chars)")', () => {
  const verifier = resolveVerifier('Title validated (3-120 chars)');
  it('resolves to a registered verifier', () => expect(verifier).toBeTypeOf('function'));

  it('satisfied: name length within [3,120]', async () => {
    const r = await verifier({ supabase: mockSupabase({ data: { name: 'A Real Venture' } }), ventureId: VID });
    expect(r.satisfied).toBe(true);
  });

  it('unsatisfied: name shorter than 3 chars', async () => {
    const r = await verifier({ supabase: mockSupabase({ data: { name: 'AB' } }), ventureId: VID });
    expect(r.satisfied).toBe(false);
    expect(r.reason).toMatch(/outside \[3,120\]/);
  });

  it('unsatisfied (fail-closed): ventures.name missing', async () => {
    const r = await verifier({ supabase: mockSupabase({ data: { name: null } }), ventureId: VID });
    expect(r.satisfied).toBe(false);
    expect(r.reason).toMatch(/missing/);
  });
});

describe('verifyDescriptionValidated (gate string: "Description validated (20-2000 chars)")', () => {
  const verifier = resolveVerifier('Description validated (20-2000 chars)');
  it('resolves to a registered verifier', () => expect(verifier).toBeTypeOf('function'));

  it('satisfied: description length within [20,2000]', async () => {
    const r = await verifier({
      supabase: mockSupabase({ data: { artifact_data: { description: 'A'.repeat(50) } } }),
      ventureId: VID,
    });
    expect(r.satisfied).toBe(true);
  });

  it('unsatisfied: description shorter than 20 chars', async () => {
    const r = await verifier({
      supabase: mockSupabase({ data: { artifact_data: { description: 'too short' } } }),
      ventureId: VID,
    });
    expect(r.satisfied).toBe(false);
    expect(r.reason).toMatch(/outside \[20,2000\]/);
  });

  it('unsatisfied (fail-closed): truth_idea_brief artifact missing', async () => {
    const r = await verifier({ supabase: mockSupabase({ data: null }), ventureId: VID });
    expect(r.satisfied).toBe(false);
  });
});

describe('verifyChairmanDecisionMade (gate string: "Chairman decision: advance/revise/reject")', () => {
  const verifier = resolveVerifier('Chairman decision: advance/revise/reject');
  it('resolves to a registered verifier', () => expect(verifier).toBeTypeOf('function'));

  it('satisfied: a recorded decision exists, even using the REAL enum value (not the gate-string prose)', async () => {
    // Documented vocabulary drift: live enum is ['pass','revise','kill'], never 'advance'/'reject'.
    const r = await verifier({
      supabase: mockSupabase({ data: { id: 'd1', decision: 'pass' } }),
      ventureId: VID, fromStage: STAGE,
    });
    expect(r.satisfied).toBe(true);
  });

  it('unsatisfied (fail-closed): no decision row for this lifecycle_stage', async () => {
    const r = await verifier({ supabase: mockSupabase({ data: null }), ventureId: VID, fromStage: STAGE });
    expect(r.satisfied).toBe(false);
    expect(r.reason).toMatch(new RegExp(`lifecycle_stage=${STAGE}`));
  });

  it('unsatisfied (fail-closed): query error', async () => {
    const r = await verifier({
      supabase: mockSupabase({ error: { message: 'boom' } }), ventureId: VID, fromStage: STAGE,
    });
    expect(r.satisfied).toBe(false);
    expect(r.reason).toMatch(/fail-closed/);
  });
});

describe('verifyFinancialModelComplete (gate string: "Financial model complete")', () => {
  const verifier = resolveVerifier('Financial model complete');
  it('resolves to a registered verifier', () => expect(verifier).toBeTypeOf('function'));

  it('satisfied: truth_financial_model artifact present', async () => {
    const r = await verifier({ supabase: mockSupabase({ data: { id: 'a1' } }), ventureId: VID });
    expect(r.satisfied).toBe(true);
  });

  it('unsatisfied: truth_financial_model artifact missing', async () => {
    const r = await verifier({ supabase: mockSupabase({ data: null }), ventureId: VID });
    expect(r.satisfied).toBe(false);
  });
});

describe('verifyUnitEconomicsViable (gate string: "Unit economics viable")', () => {
  const verifier = resolveVerifier('Unit economics viable');
  it('resolves to a registered verifier', () => expect(verifier).toBeTypeOf('function'));

  it('satisfied: blockProgression=false (e.g. a "pass" kill-gate decision)', async () => {
    const r = await verifier({
      supabase: mockSupabase({ data: { artifact_data: { blockProgression: false, decision: 'pass' } } }),
      ventureId: VID,
    });
    expect(r.satisfied).toBe(true);
  });

  it('unsatisfied: blockProgression=true on a "conditional_pass" decision (NOT just "kill")', async () => {
    // stage-05.js's evaluateKillGate: conditional_pass ALSO sets blockProgression=true — this is
    // the exact naive-check trap the verifier's own doc comment warns against (decision!=='kill'
    // would have wrongly passed this case).
    const r = await verifier({
      supabase: mockSupabase({ data: { artifact_data: { blockProgression: true, decision: 'conditional_pass' } } }),
      ventureId: VID,
    });
    expect(r.satisfied).toBe(false);
    expect(r.reason).toMatch(/conditional_pass/);
  });

  it('unsatisfied (fail-closed): blockProgression field missing', async () => {
    const r = await verifier({
      supabase: mockSupabase({ data: { artifact_data: { decision: 'pass' } } }),
      ventureId: VID,
    });
    expect(r.satisfied).toBe(false);
    expect(r.reason).toMatch(/blockProgression missing/);
  });
});

describe('verifyNoCriticalSecurityIssues (gate string: "No critical security issues")', () => {
  const verifier = resolveVerifier('No critical security issues');
  it('resolves to a registered verifier', () => expect(verifier).toBeTypeOf('function'));

  it('satisfied: by_severity.critical === 0', async () => {
    const r = await verifier({
      supabase: mockSupabase({ data: { artifact_data: { summary: { by_severity: { critical: 0 } } } } }),
      ventureId: VID,
    });
    expect(r.satisfied).toBe(true);
  });

  it('unsatisfied: by_severity.critical > 0', async () => {
    const r = await verifier({
      supabase: mockSupabase({ data: { artifact_data: { summary: { by_severity: { critical: 2 } } } } }),
      ventureId: VID,
    });
    expect(r.satisfied).toBe(false);
    expect(r.reason).toMatch(/2 critical/);
  });

  it('unsatisfied (fail-closed): summary.by_severity.critical missing (e.g. a typo like "critcal")', async () => {
    const r = await verifier({
      supabase: mockSupabase({ data: { artifact_data: { summary: { by_severity: {} } } } }),
      ventureId: VID,
    });
    expect(r.satisfied).toBe(false);
    expect(r.reason).toMatch(/missing/);
  });
});

describe('verifyNoExposedSecrets (gate string: "No exposed secrets")', () => {
  const verifier = resolveVerifier('No exposed secrets');
  it('resolves to a registered verifier', () => expect(verifier).toBeTypeOf('function'));

  it('satisfied: by_check.secret_detection === 0', async () => {
    const r = await verifier({
      supabase: mockSupabase({ data: { artifact_data: { summary: { by_check: { secret_detection: 0 } } } } }),
      ventureId: VID,
    });
    expect(r.satisfied).toBe(true);
  });

  it('unsatisfied: by_check.secret_detection > 0', async () => {
    const r = await verifier({
      supabase: mockSupabase({ data: { artifact_data: { summary: { by_check: { secret_detection: 1 } } } } }),
      ventureId: VID,
    });
    expect(r.satisfied).toBe(false);
    expect(r.reason).toMatch(/1 exposed secret/);
  });
});

describe('verifyLintPasses (gate string: "Lint passes")', () => {
  const verifier = resolveVerifier('Lint passes');
  it('resolves to a registered verifier', () => expect(verifier).toBeTypeOf('function'));

  it('satisfied: by_check.lint === 0', async () => {
    const r = await verifier({
      supabase: mockSupabase({ data: { artifact_data: { summary: { by_check: { lint: 0 } } } } }),
      ventureId: VID,
    });
    expect(r.satisfied).toBe(true);
  });

  it('unsatisfied: by_check.lint > 0', async () => {
    const r = await verifier({
      supabase: mockSupabase({ data: { artifact_data: { summary: { by_check: { lint: 5 } } } } }),
      ventureId: VID,
    });
    expect(r.satisfied).toBe(false);
    expect(r.reason).toMatch(/5 lint finding/);
  });

  it('unsatisfied (fail-closed): code_quality_report artifact missing entirely', async () => {
    const r = await verifier({ supabase: mockSupabase({ data: null }), ventureId: VID });
    expect(r.satisfied).toBe(false);
    expect(r.reason).toMatch(/fail-closed/);
  });
});

describe('verifyLaunchReadinessGreen (gate string: "All categories green OR chairman override")', () => {
  const verifier = resolveVerifier('All categories green OR chairman override');
  it('resolves to a registered verifier', () => expect(verifier).toBeTypeOf('function'));

  it('satisfied: verdict === READY', async () => {
    const r = await verifier({
      supabase: mockSupabase({ data: { artifact_data: { verdict: 'READY' } } }),
      ventureId: VID,
    });
    expect(r.satisfied).toBe(true);
  });

  it('unsatisfied: verdict is NOT_READY (documented gap: chairman-override half is not machine-checkable)', async () => {
    const r = await verifier({
      supabase: mockSupabase({ data: { artifact_data: { verdict: 'NOT_READY' } } }),
      ventureId: VID,
    });
    expect(r.satisfied).toBe(false);
    expect(r.reason).toMatch(/chairman-override path is not yet machine-verifiable/);
  });

  it('unsatisfied (fail-closed): launch_readiness_checklist artifact missing', async () => {
    const r = await verifier({ supabase: mockSupabase({ data: null }), ventureId: VID });
    expect(r.satisfied).toBe(false);
  });
});

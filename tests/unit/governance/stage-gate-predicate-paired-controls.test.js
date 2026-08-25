/**
 * SD-LEO-INFRA-STAGE-GATE-PREDICATE-001 (FR-6) — paired, non-quarantinable CI controls.
 *
 * REVISED DURING PLAN-TO-EXEC (TESTING sub-agent finding): the db-tier CI project
 * (.github/workflows/unit-tier.yml) runs with continue-on-error:true,
 * passWithNoTests:true, and a global beforeEach(ctx.skip()) (tests/setup.db.js) — any
 * test placed there structurally CANNOT fail CI. These controls therefore run in the
 * GATING unit-test project, fully mocked, with NO live DB dependency. Separately, no
 * non-demo test venture exists in the live DB (130/152 real ventures are is_demo=true,
 * every test-named venture is demo — and per this predicate's own scope rule, a demo
 * venture is invisible to it and could never trigger a BLOCK) — so the "fenced test
 * venture" here is a MOCKED fixture object, not a live row.
 *
 * NEGATIVE control: fenced non-demo venture at stage 1 + a stage-24-required action ->
 * the guard must FIRE (armed forced true, independent of the live flag state).
 * POSITIVE control: the same shape at stage 24 -> the guard must PASS.
 * An explicit precondition assertion at the top of each test fails loudly if the
 * fixture object is malformed, per TESTING's finding that a literal file-deletion
 * mutation test never mutates anything observable.
 *
 * DO NOT add this file to tests/quarantine-manifest.json.
 */
import { describe, it, expect, vi } from 'vitest';
import { checkStageGate } from '../../../lib/governance/stage-gate-predicate.js';

/** The fenced, non-demo CI test venture fixture — a mock, not a live DB row. */
const FENCED_TEST_VENTURE = Object.freeze({ id: 'ci-fenced-stage-gate-venture', is_demo: false });

function assertFixtureValid(venture, stage) {
  if (!venture || venture.is_demo !== false || typeof stage !== 'number') {
    throw new Error('FR-6 fixture invariant violated: fenced test venture must be a non-demo object with a numeric stage');
  }
}

function makeSupabase(stage) {
  const insert = vi.fn().mockResolvedValue({ error: null });
  // SECURITY finding SG-M9-V (round 3): this flag proves the override query reached its
  // terminal .maybeSingle() rather than throwing partway through and being swallowed by
  // hasActiveOverride's catch -- the exact "passes for the wrong reason" failure mode M9
  // found. If a future edit shortens/lengthens the real query without updating this mock,
  // the chain throws BEFORE this flag flips, and the NEGATIVE control's assertion below
  // catches it instead of silently passing on blocked:true for the wrong reason.
  let overrideQueryReached = false;
  return {
    from: (table) => {
      if (table === 'ventures') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { is_demo: false, current_lifecycle_stage: stage }, error: null }) }) }) };
      }
      if (table === 'chairman_decisions') {
        // SECURITY finding M9 (EXEC-TO-PLAN review), UPDATED post ship-gate-review atomic-claim
        // rewrite: both controls run armed:true, which now routes to the ATOMIC UPDATE claim
        // path (not the read-only select used only in shadow/unarmed mode) -- override_key,
        // decision_type, AND venture_id (SECURITY finding H3) are .eq() filters, followed by
        // .is()/.gt()/.select()/.maybeSingle(). A shorter mock chain silently threw a TypeError
        // swallowed by hasActiveOverride's catch, so this control passed for the wrong reason
        // (a broken query, not a real "no override" evaluation).
        return {
          update: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ is: () => ({ gt: () => ({ select: () => ({
            maybeSingle: async () => { overrideQueryReached = true; return { data: null, error: null }; },
          }) }) }) }) }) }) }),
        };
      }
      if (table === 'audit_log') return { insert };
      throw new Error(`unexpected table: ${table}`);
    },
    _insert: insert,
    _overrideQueryReached: () => overrideQueryReached,
  };
}

describe('FR-6: paired non-quarantinable CI controls (stage-gate predicate)', () => {
  it('NEGATIVE control: fenced venture at stage 1, requiredStage 24 — the guard must FIRE', async () => {
    assertFixtureValid(FENCED_TEST_VENTURE, 1);
    const supabase = makeSupabase(1);
    const r = await checkStageGate({
      supabase,
      ventureId: FENCED_TEST_VENTURE.id,
      requiredStage: 24,
      actorType: 'sd',
      actorId: 'CI-NEGATIVE-CONTROL-SD',
      armed: true, // forced, independent of the live/build flag state
    });
    expect(r.blocked).toBe(true);
    expect(r.verdict).toBe('BLOCK');
    // The block must be the REAL "no override matched" verdict, not a swallowed TypeError
    // from a mock chain that no longer matches the real query shape (SECURITY SG-M9-V).
    expect(supabase._overrideQueryReached()).toBe(true);
  });

  it('POSITIVE control: fenced venture at stage 24, requiredStage 24 — the guard must PASS', async () => {
    assertFixtureValid(FENCED_TEST_VENTURE, 24);
    const supabase = makeSupabase(24);
    const r = await checkStageGate({
      supabase,
      ventureId: FENCED_TEST_VENTURE.id,
      requiredStage: 24,
      actorType: 'sd',
      actorId: 'CI-POSITIVE-CONTROL-SD',
      armed: true,
    });
    expect(r.blocked).toBe(false);
    expect(r.verdict).toBe('PASS');
  });

  it('FR-6 AC-4: the fixture-presence assertion itself fails loudly on a malformed fixture (not a dead mutation)', () => {
    expect(() => assertFixtureValid(null, 1)).toThrow(/fixture invariant violated/);
    expect(() => assertFixtureValid({ is_demo: true }, 1)).toThrow(/fixture invariant violated/);
    expect(() => assertFixtureValid(FENCED_TEST_VENTURE, 'not-a-number')).toThrow(/fixture invariant violated/);
    expect(() => assertFixtureValid(FENCED_TEST_VENTURE, 1)).not.toThrow();
  });
});

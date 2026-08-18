/**
 * DB Invariant: every live venture_stages gate string resolves against the
 * exit-gate-verifiers.js registry.
 *
 * Originated on SD-MAN-INFRA-VENTURE-CRACK-GATE-001 (FR-4/TR-1/TR-6/TS-9);
 * extended + baseline-updated by SD-FDBK-FIX-EXIT-GATE-CONFORMANCE-001 (FR-1
 * resolved 9 of the original 14 unresolvable binding strings; FR-2 extracted
 * the comparison logic into the pure lib/eva/lifecycle/gate-conformance.js
 * so this test and a DB-free unit-tier test — tests/unit/eva/lifecycle/
 * gate-conformance.test.js — share ONE implementation instead of drifting).
 *
 * WHY THIS EXISTS (prospective TESTING, evidence 910016cf-54a3-4594-9ff4-cd8c870fe6b4):
 * the gate string lives in DB data (venture_stages.metadata.gates.exit / .exit_observe) while
 * the verifier match token lives in code (lib/eva/lifecycle/exit-gate-verifiers.js) — both ends
 * can be individually "correct" (a passing unit test asserting the literal string a test author
 * typed) while disagreeing with each other. Two green endpoints do not prove the wire.
 *
 * TWO DIFFERENT INVARIANTS, deliberately asymmetric:
 *
 * 1. `exit` (BINDING gates): exit-gate-enforcer.js is fail-CLOSED on an unresolvable binding
 *    verifier — a typo is a total stage lockout, not a degraded check. MEASURED at authoring
 *    time (2026-08-18) by SD-MAN-INFRA-VENTURE-CRACK-GATE-001: 14 of 21 live binding gate
 *    strings were unresolvable. SD-FDBK-FIX-EXIT-GATE-CONFORMANCE-001 FR-1 resolved 9 of those
 *    14 (real, code-verified backing data for each — see exit-gate-verifiers.js's FR-1 comment
 *    block). The remaining 5 have NO real backing implementation anywhere in the codebase and
 *    are documented as an explicit non-binding disposition (see exit-gate-verifiers.js's
 *    "NON-BINDING DISPOSITION" comment) — NEW_BASELINE = 5, not 0, and that is by design, not an
 *    oversight. This test asserts a BASELINE REGRESSION GUARD: the unresolvable count must never
 *    exceed the measured baseline. If it does, someone added a NEW binding gate string without
 *    registering its verifier in the same commit (the exact TR-1 violation this test exists to
 *    catch).
 *
 * 2. `exit_observe` (SHADOW gates): structurally different risk. exit-gate-enforcer.js hits a
 *    bare `continue` on an unresolvable observe gate before this SD's FR-3 — after FR-3, an
 *    unresolvable observe gate fires a fail-loud system_events row instead of silently vanishing
 *    (see exit-gate-enforcer.js's observe-mode branch and its test coverage). This invariant
 *    still holds independently: 0 of 5 live observe gate strings are unresolvable today — a HARD
 *    invariant (zero-tolerance), not a baseline, because a single silent regression here is the
 *    specific failure mode TR-6/FR-3 were written to close.
 *
 * SKIPS BY DESIGN IN ORDINARY CI (matches all sibling files in this directory): per
 * tests/helpers/db-available.js (QF-20260726-459), this repo has ZERO designated non-production
 * Supabase targets provisioned, so describeDb() skips everywhere by default rather than risk
 * running against the live 148+-venture production database (the exact incident that fix
 * addresses). This is NOT a gap in this test -- it is the correct, deliberately-conservative,
 * repo-wide behavior (testing-agent finding F1: widening this guard to "run anyway" would
 * re-arm the exact incident QF-20260726-459 closed). Run manually with
 * VITEST_DB_ALLOW_REF=<designated-non-prod-ref> if one is ever provisioned. For unskipped,
 * DB-free CI coverage of the SAME comparison logic, see tests/unit/eva/lifecycle/
 * gate-conformance.test.js (FR-2 AC-1).
 */

import { it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { describeDb, HAS_REAL_DB } from '../helpers/db-available.js';
import { computeGateConformance } from '../../lib/eva/lifecycle/gate-conformance.js';

// Measured 2026-08-18: 14 unresolvable at authoring time (SD-MAN-INFRA-VENTURE-CRACK-GATE-001);
// SD-FDBK-FIX-EXIT-GATE-CONFORMANCE-001 FR-1 resolved 9 with real backing data, leaving 5
// documented as non-binding (no real implementation exists to verify against — see
// exit-gate-verifiers.js's disposition comment). Baseline updated in the same commit as FR-1
// per this SD's PRD SC-1, per NC-EXEC guidance against silently stale regression thresholds.
const BINDING_UNRESOLVABLE_BASELINE = 5;

describeDb('venture_stages gate strings resolve against exit-gate-verifiers.js', () => {
  let sb;
  let stages;

  beforeAll(async () => {
    if (!HAS_REAL_DB) return;
    sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data, error } = await sb
      .from('venture_stages')
      .select('stage_number, stage_name, metadata')
      .order('stage_number');
    if (error) throw error;
    stages = data;
  });

  it('exit (binding) gate strings: unresolvable count does not exceed the measured baseline', () => {
    if (!HAS_REAL_DB) return;
    const { unresolvableBinding } = computeGateConformance(stages);
    if (unresolvableBinding.length > BINDING_UNRESOLVABLE_BASELINE) {
      const newOnes = unresolvableBinding.length - BINDING_UNRESOLVABLE_BASELINE;
      const list = unresolvableBinding.map((e) => `S${e.stage} ${e.stageName ?? ''}: "${e.gateString}"`).join('\n  ');
      throw new Error(
        `${unresolvableBinding.length} unresolvable binding gate string(s), ${newOnes} more than the ` +
        `${BINDING_UNRESOLVABLE_BASELINE}-string baseline. A NEW gate string was added without ` +
        'registering its verifier in exit-gate-verifiers.js — this is TR-1\'s exact failure mode ' +
        `(fail-closed, total stage lockout on the next advanceStage() call for that stage). Full list:\n  ${list}`
      );
    }
    if (unresolvableBinding.length > 0) {
      const list = unresolvableBinding.map((e) => `S${e.stage}: "${e.gateString}"`).join('; ');
      console.warn(
        `[KNOWN, DOCUMENTED DISPOSITION] ${unresolvableBinding.length} binding gate string(s) unresolvable ` +
        `(baseline ${BINDING_UNRESOLVABLE_BASELINE}) — no real backing implementation exists for these, ` +
        `see exit-gate-verifiers.js's disposition comment: ${list}`
      );
    }
  });

  it('exit_observe (shadow) gate strings: zero unresolvable, no baseline tolerance', () => {
    if (!HAS_REAL_DB) return;
    const { unresolvableObserve } = computeGateConformance(stages);
    expect(
      unresolvableObserve.map((e) => `S${e.stage}: "${e.gateString}"`),
      'Unresolvable shadow (exit_observe) gate string(s) found — as of FR-3, these now fire a ' +
      'fail-loud system_events row (not silently skipped), but the underlying string should still ' +
      'never drift unresolvable in the first place: '
    ).toHaveLength(0);
  });
});

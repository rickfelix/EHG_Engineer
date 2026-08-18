/**
 * DB Invariant: every live venture_stages gate string resolves against the
 * exit-gate-verifiers.js registry.
 *
 * SD: SD-MAN-INFRA-VENTURE-CRACK-GATE-001 (FR-4/TR-1/TR-6/TS-9)
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
 *    time (2026-08-18): 14 of 21 live binding gate strings are ALREADY unresolvable (only S19,
 *    S24, S26 fully resolve) — a PRE-EXISTING condition, not introduced by this SD, and NOT
 *    something this test unilaterally fixes (signalled separately to the coordinator, signal_id
 *    7178f834-3288-4cea-8ddf-136411392e27, for fleet-wide remediation). Hard-failing on the
 *    current count would break CI over a defect this SD does not own fixing. This test instead
 *    asserts a BASELINE REGRESSION GUARD: the unresolvable count must never exceed the measured
 *    baseline. If it does, someone added a NEW binding gate string without registering its
 *    verifier in the same commit (the exact TR-1 violation this test exists to catch).
 *
 * 2. `exit_observe` (SHADOW gates): structurally different risk. exit-gate-enforcer.js hits a
 *    bare `continue` on an unresolvable observe gate — no would_block_by entry, no system_events
 *    row, only a console.warn. A typo'd observe gate is TELEMETRICALLY IDENTICAL to a fully-
 *    satisfied one, which means TR-2's would-block-rate promotion criterion cannot see it: a
 *    typo reads as "0% block, safe to promote", and promotion is exactly what turns that typo
 *    into a real lockout (invariant 1, above). MEASURED: 0 of 5 live observe gate strings are
 *    unresolvable today — this is a HARD invariant (zero-tolerance), not a baseline, because a
 *    single silent regression here is the specific failure mode TR-6 was written to close.
 *
 * SKIPS BY DESIGN IN ORDINARY CI (matches all 3 sibling files in this directory): per
 * tests/helpers/db-available.js (QF-20260726-459), this repo has ZERO designated non-production
 * Supabase targets provisioned, so describeDb() skips everywhere by default rather than risk
 * running against the live 148+-venture production database (the exact incident that fix
 * addresses). This is NOT a gap in this test -- it is the correct, deliberately-conservative,
 * repo-wide behavior. Run manually with VITEST_DB_ALLOW_REF=<designated-non-prod-ref> if one is
 * ever provisioned, or invoke the equivalent standalone check (.artifacts/tst-gate-conformance.mjs,
 * testing-agent's original seed, produces the same numbers this test asserts) directly against
 * live data as a manual pre-flight step before a TR-2 promotion decision.
 */

import { it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { describeDb, HAS_REAL_DB } from '../helpers/db-available.js';
import { resolveVerifier } from '../../lib/eva/lifecycle/exit-gate-verifiers.js';

// Measured live 2026-08-18 (testing-agent evidence 910016cf; re-measured by EXEC-phase Golf-3
// before authoring this test). Only S19/S24/S26 fully resolve their binding gates.
const BINDING_UNRESOLVABLE_BASELINE = 14;

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
    const unresolvable = [];
    for (const stage of stages) {
      const exitGates = Array.isArray(stage.metadata?.gates?.exit) ? stage.metadata.gates.exit : [];
      for (const gateString of exitGates) {
        if (!resolveVerifier(gateString)) {
          unresolvable.push(`S${stage.stage_number} ${stage.stage_name}: "${gateString}"`);
        }
      }
    }
    if (unresolvable.length > BINDING_UNRESOLVABLE_BASELINE) {
      const newOnes = unresolvable.length - BINDING_UNRESOLVABLE_BASELINE;
      throw new Error(
        `${unresolvable.length} unresolvable binding gate string(s), ${newOnes} more than the ` +
        `${BINDING_UNRESOLVABLE_BASELINE}-string baseline. A NEW gate string was added without ` +
        'registering its verifier in exit-gate-verifiers.js — this is TR-1\'s exact failure mode ' +
        '(fail-closed, total stage lockout on the next advanceStage() call for that stage). ' +
        `Full list:\n  ${unresolvable.join('\n  ')}`
      );
    }
    // Equal-or-under the baseline is the expected state today — not a pass condition to hide,
    // logged so a CI reader sees the pre-existing debt without it failing the build.
    if (unresolvable.length > 0) {
      console.warn(
        `[KNOWN, PRE-EXISTING] ${unresolvable.length} binding gate string(s) unresolvable ` +
        `(baseline ${BINDING_UNRESOLVABLE_BASELINE}) — tracked separately, not this SD's to fix: ` +
        `${unresolvable.join('; ')}`
      );
    }
  });

  it('exit_observe (shadow) gate strings: zero unresolvable, no baseline tolerance', () => {
    if (!HAS_REAL_DB) return;
    const unresolvable = [];
    for (const stage of stages) {
      const observeGates = Array.isArray(stage.metadata?.gates?.exit_observe) ? stage.metadata.gates.exit_observe : [];
      for (const gateString of observeGates) {
        if (!resolveVerifier(gateString)) {
          unresolvable.push(`S${stage.stage_number} ${stage.stage_name}: "${gateString}"`);
        }
      }
    }
    expect(
      unresolvable,
      'Unresolvable shadow (exit_observe) gate string(s) found — these are SILENTLY skipped by ' +
      'exit-gate-enforcer.js (no would_block_by entry, no system_events row), which means any ' +
      'would-block-rate promotion criterion (TR-2) cannot see them and would read a typo as ' +
      '"safe to promote". Zero tolerance, unlike the binding-gate baseline above: ' +
      `${unresolvable.join('; ')}`
    ).toHaveLength(0);
  });
});

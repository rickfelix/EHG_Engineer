/**
 * TS-3 / FR-3 — a rejected handoff must name WHICH gate failed, structurally.
 * SD-LEO-INFRA-OPERATOR-CONTRACT-GATE-002
 *
 * HandoffRecorder already READ result.failedGate when building validation_details.summary.
 * Nobody set it: ResultBuilder.gateFailure() takes the gate name only to shape the reasonCode
 * and delegates to .rejected(), which returns no failedGate — while the skip-and-continue path
 * in BaseExecutor DOES carry it. Measured before the fix: failed_gate null on 25 of 25 rejected
 * rows, leaving the gate NAME recoverable only by string-parsing `message`.
 *
 * MUTATION M6: revert `gateFailureResult.failedGate = gateResults.failedGate` in BaseExecutor
 * and the first test here reddens.
 *
 * Unit tier deliberately. tests/integration/ belongs to ZERO vitest projects — measured at 0
 * tests across 177 files on disk, with the db project's passWithNoTests:true exiting 0 — so a
 * test placed there is indistinguishable from one that does not exist. This uses the same
 * zero-DB recorder seam as tests/unit/medium-effort-hardening.test.js.
 */
import { describe, it, expect } from 'vitest';
import { HandoffRecorder } from '../../../scripts/modules/handoff/recording/HandoffRecorder.js';
import { ResultBuilder } from '../../../scripts/modules/handoff/ResultBuilder.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function makeRecorder() {
  const inserts = [];
  const supabase = {
    from: (table) => ({
      insert: (row) => { inserts.push({ table, row }); return { select: () => Promise.resolve({ data: [row], error: null }) }; },
      update: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
      select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) }) }) }) }),
    }),
    rpc: () => Promise.resolve({ data: null, error: null }),
  };
  const recorder = new HandoffRecorder(supabase, {
    contentBuilder: { buildRejection: () => ({ executive_summary: 'r' }) },
    validationOrchestrator: { preValidateData: async () => ({ valid: true, errors: [] }) },
  });
  recorder._resolveToUUID = async () => '00000000-0000-0000-0000-000000000001';
  recorder._logGovernanceAudit = async () => {};
  return { recorder, inserts };
}

const rowFor = (inserts) => inserts.find((i) => i.table === 'sd_phase_handoffs')?.row;

describe('FR-3 — failed_gate is recorded structurally, not left to string-parsing', () => {
  it('a PHASE-TRANSITION rejection names the failing gate', async () => {
    const { recorder, inserts } = makeRecorder();
    await recorder.recordFailure('PLAN-TO-LEAD', 'SD-T-001', {
      actualScore: 0, message: 'OPERATOR_CONTRACT validation failed', reasonCode: 'OPERATOR_CONTRACT_FAILED',
      gateCount: 29, issues: ['x'], warnings: [], failedGate: 'OPERATOR_CONTRACT',
    });
    expect(rowFor(inserts).validation_details.summary.failed_gate).toBe('OPERATOR_CONTRACT');
  });

  it('M6: without failedGate on the result it is null — the pre-fix state, on 25 of 25 live rows', async () => {
    // Two-sided. This is what reverting the BaseExecutor assignment produces, and asserting it
    // keeps the first test from passing for an incidental reason.
    const { recorder, inserts } = makeRecorder();
    await recorder.recordFailure('PLAN-TO-LEAD', 'SD-T-001', {
      actualScore: 0, message: 'OPERATOR_CONTRACT validation failed', reasonCode: 'OPERATOR_CONTRACT_FAILED',
      gateCount: 29, issues: ['x'], warnings: [],
    });
    expect(rowFor(inserts).validation_details.summary.failed_gate ?? null).toBeNull();
  });
});

describe('ResultBuilder is the reason the field was empty', () => {
  it('gateFailure() takes the gate name but does NOT return failedGate', async () => {
    // Pins the actual cause. If ResultBuilder ever starts carrying it, the BaseExecutor
    // assignment becomes redundant and this test says so out loud rather than going quietly
    // green on a now-duplicated fact.
    const r = ResultBuilder.gateFailure('OPERATOR_CONTRACT', { issues: [], score: 0, max_score: 100, warnings: [], details: {} }, null);
    expect(r.reasonCode).toBe('OPERATOR_CONTRACT_FAILED');
    expect(r.failedGate).toBeUndefined();
  });
});

describe('the completion-action path is untouched', () => {
  it('LEAD-FINAL-APPROVAL still routes to leo_handoff_executions, not sd_phase_handoffs', async () => {
    // FR-3 deliberately changed only the phase-transition path. medium-effort-hardening.test.js
    // deep-equals gate_results on the completion-action path; that assertion is the tripwire
    // for anyone factoring the two paths into a shared helper, and must keep passing.
    const { recorder, inserts } = makeRecorder();
    await recorder.recordFailure('LEAD-FINAL-APPROVAL', 'SD-T-001', {
      actualScore: 40, message: 'gate failed', reasonCode: 'WIRE_CHECK_GATE_FAILED',
      gateCount: 5, issues: [], warnings: [], failedGate: 'WIRE_CHECK',
    });
    expect(inserts.some((i) => i.table === 'leo_handoff_executions')).toBe(true);
    expect(inserts.some((i) => i.table === 'sd_phase_handoffs')).toBe(false);
  });
});

describe('M6 — THE WIRE from BaseExecutor to the recorder', () => {
  /**
   * HONEST ABOUT THE INSTRUMENT. The tests above prove the recorder CONSUMES failedGate; they
   * pass `failedGate` in directly, so they never exercise BaseExecutor's assignment — and M6
   * (deleting that line) left all four GREEN. That is unit-tests-the-function-but-not-the-wiring,
   * the same class this SD exists to catch, committed inside it.
   *
   * I THEN CLAIMED BaseExecutor.execute() WAS NOT DRIVABLE FROM A UNIT TEST. That was FALSE,
   * and TESTING (row ee56bca1) falsified it BY CONSTRUCTION rather than by argument — the real
   * behaviour test now lives in base-executor-failed-gate-wire.test.js and drives
   * execute() -> HandoffRecorder.recordFailure -> validation_details.summary.failed_gate with
   * nothing hand-assembled in between. The unlock was that `gateResults` comes from an INJECTED
   * constructor dependency (this.validationOrchestrator.validateGates), so stubbing it lands
   * you on the branch. Worth knowing: the "not unit-testable" claim is repeated across three
   * BaseExecutor test files — an inherited assumption nobody had measured, and I repeated it.
   *
   * These source-shape assertions are KEPT as a cheap second signal, not as the acceptance.
   * A grep for a statement form is not a test for behaviour; the file named above is.
   */
  const src = readFileSync(resolve(process.cwd(), 'scripts/modules/handoff/executors/BaseExecutor.js'), 'utf8');

  it('the gate-failure branch assigns failedGate onto the result it returns', () => {
    // M6 deletes exactly this line.
    expect(src).toMatch(/gateFailureResult\.failedGate\s*=\s*gateResults\.failedGate/);
  });

  it('it is assigned on the SAME object that is returned, not a discarded local', () => {
    // The D1 defect earlier in this SD was a value built and thrown away. Pin that the
    // assignment target and the returned identifier are the same name.
    const i = src.indexOf('gateFailureResult.failedGate');
    expect(i).toBeGreaterThan(-1);
    expect(src.slice(i, i + 400)).toMatch(/return gateFailureResult;/);
  });

  it('the recorder end of the wire reads it — pinning BOTH ends, not just one', () => {
    const rec = readFileSync(resolve(process.cwd(), 'scripts/modules/handoff/recording/HandoffRecorder.js'), 'utf8');
    expect(rec).toMatch(/failed_gate:\s*result\.failedGate/);
  });
});

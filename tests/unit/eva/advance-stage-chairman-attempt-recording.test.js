/**
 * SD-LEO-INFRA-ALTIFYAI-INSTRUMENTATION-RETROFIT-001 (FR-1/FR-2/TR-4, TS-2/TS-3/TS-5) -- source-
 * inspection regression guards for the new recordGateAttempt() call site inside
 * _advanceStage(). TESTING's prospective review (e7445772, then re-verified in 56dc6248)
 * confirmed _advanceStage() has 7+ .from() table calls and 4 dynamic imports -- too large/
 * entangled to unit-test end-to-end by mocking supabase.rpc alone. This mirrors the existing,
 * accepted pattern in tests/unit/eva/orchestrator-gate-result-persist.test.js (call-count/
 * source-inspection guards), which is the feasible integration-level check for this call site;
 * _handleChairmanGate()'s own source-tagging is covered behaviourally in the sibling file
 * stage-execution-worker-chairman-gate-source.test.js.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(path.resolve('lib/eva/stage-execution-worker.js'), 'utf-8');

describe('SD-LEO-INFRA-ALTIFYAI-INSTRUMENTATION-RETROFIT-001 FR-1/FR-2 (TS-3): call-count + placement guard', () => {
  it('recordGateAttempt is dynamically imported and called exactly once in this file', () => {
    // MUTATION: a future edit that removes this call, or adds a duplicate, changes this count.
    const importCalls = source.split("await import('./artifact-persistence-service.js')").length - 1;
    const recordGateAttemptCalls = source.split('await recordGateAttempt(').length - 1;
    expect(recordGateAttemptCalls).toBe(1);
    expect(importCalls).toBeGreaterThanOrEqual(1); // shared with recordGateOverride/writeArtifact's existing dynamic imports
  });

  it("THE PRIMARY REGRESSION TEST (FR-2): the call is gated on source==='chairman_decision', not on any looser truthy check", () => {
    // MUTATION: replacing this exact guard with `if (result?._gateApproved)` alone would fire
    // recordGateAttempt() for all 5 _handleChairmanGate() branches (3 of them non-chairman),
    // reproducing the mislabeling risk this SD exists to close.
    expect(source).toContain("result?._chairmanGateSource === 'chairman_decision'");
  });

  it('the call site appears AFTER the raw ventures.current_lifecycle_stage UPDATE (single point of no return)', () => {
    const updateIdx = source.indexOf('.update({ current_lifecycle_stage: toStage })');
    const guardIdx = source.indexOf("result?._chairmanGateSource === 'chairman_decision'");
    expect(updateIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeGreaterThan(-1);
    // MUTATION: moving the guard before the UPDATE (e.g. into the chokepoint section above) would
    // let a venture blocked at an EARLIER chokepoint still reach this line -- exactly the
    // retry-amplification risk FR-2 exists to prevent.
    expect(guardIdx).toBeGreaterThan(updateIdx);
  });
});

describe('SD-LEO-INFRA-ALTIFYAI-INSTRUMENTATION-RETROFIT-001 (TS-5): gateType and non-fatal try/catch', () => {
  it("uses gateType 'stage_gate' (maps to a valid CHECK-constraint value), never the invalid 'chairman_gate'", () => {
    expect(source).toContain("gateType: 'stage_gate'");
    expect(source).not.toContain("gateType: 'chairman_gate'");
  });

  it('uses resolvedOutcome chairman_adjudicated, the reserved non-machine outcome value', () => {
    expect(source).toContain("resolvedOutcome: 'chairman_adjudicated'");
  });

  it('the recordGateAttempt call is wrapped in a non-fatal try/catch that only logs a warning', () => {
    const guardIdx = source.indexOf("result?._chairmanGateSource === 'chairman_decision'");
    const windowAfter = source.slice(guardIdx, guardIdx + 700);
    expect(windowAfter).toContain('try {');
    expect(windowAfter).toContain('catch (err)');
    expect(windowAfter).toContain('non-fatal');
    // A ledger-write failure must never re-throw and undo the already-committed stage advance.
    expect(windowAfter).not.toMatch(/catch \(err\) \{\s*throw/);
  });
});

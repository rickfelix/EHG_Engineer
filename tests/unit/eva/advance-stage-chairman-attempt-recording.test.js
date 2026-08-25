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
    // SD-LEO-INFRA-STAGE-WRITER-CHOKE-001 added a stage_write_token self-stamp to this same UPDATE.
    const updateIdx = source.indexOf(".update({ current_lifecycle_stage: toStage, stage_write_token: 'stage-execution-worker.js' })");
    const guardIdx = source.indexOf("result?._chairmanGateSource === 'chairman_decision'");
    expect(updateIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeGreaterThan(-1);
    // MUTATION: moving the guard before the UPDATE (e.g. into the chokepoint section above) would
    // let a venture blocked at an EARLIER chokepoint still reach this line -- exactly the
    // retry-amplification risk FR-2 exists to prevent.
    expect(guardIdx).toBeGreaterThan(updateIdx);
  });

  it('adversarial /ship-gate finding #1: the guard also requires the UPDATE above to have succeeded (!stageUpdateError)', () => {
    // MUTATION: without this, a silently-failed ventures.current_lifecycle_stage UPDATE (e.g. an
    // RLS denial or transient DB error swallowed elsewhere) would still let a durable
    // "chairman_adjudicated" eva_stage_gate_attempts row be written for an advance that never
    // actually happened -- a false ledger entry with no corresponding real stage change.
    expect(source).toContain('const { error: stageUpdateError } = await this._supabase');
    expect(source).toContain("if (!stageUpdateError && (result?._chairmanGateSource === 'chairman_decision' || chairmanGateSource === 'chairman_decision')) {");
  });
});

describe('SD-LEO-INFRA-ALTIFYAI-INSTRUMENTATION-RETROFIT-001 (VALIDATION c39db537 + 04f7f256 corrections): the 4 non-_handleChairmanGate() advance paths that re-confirm an already-approved decision', () => {
  it("THE VALIDATION REGRESSION TEST: all 4 call sites pass chairmanGateSource:'chairman_decision' explicitly, since each independently re-confirms an approved decision without ever calling _handleChairmanGate() in that tick", () => {
    // MUTATION: VALIDATION found these 4 call sites (P0-universal pre_exec_skip at :899,
    // pre_exec_skip_trigger, gate-specific pre_exec_skip at :1194ish, re_entry) each
    // independently re-confirm chairman_decisions.status==='approved' just above, then
    // previously called _advanceStage() with NO chairmanGateSource signal at all -- meaning
    // AltifyAI's real approvals reaching these code paths would still produce zero
    // eva_stage_gate_attempts rows post-fix, reproducing the exact defect this SD exists to
    // close. A SECOND review round (evidence 04f7f256) found a 4th site the first fix missed --
    // this count intentionally covers the full, re-verified inventory, not the first pass's.
    const occurrences = source.split("chairmanGateSource: 'chairman_decision'").length - 1;
    expect(occurrences).toBe(4);
  });

  it("_advanceStage()'s gate accepts EITHER result._chairmanGateSource OR the explicit top-level chairmanGateSource flag", () => {
    expect(source).toContain("result?._chairmanGateSource === 'chairman_decision' || chairmanGateSource === 'chairman_decision'");
  });

  it("both 'pre_exec_skip' call sites (P0-universal AND gate-specific) are tagged", () => {
    // MUTATION: these two sites share an identical advancementType string but live in
    // structurally distinct blocks (the P0 UNIVERSAL guard for non-BLOCKING stages, and the
    // gate-specific pre-execution guard for BLOCKING/hard-gate stages) -- both independently
    // confirm a genuine chairman approval, so both must carry the tag. Matched on the tag prefix
    // (not the full literal) since each site also threads a distinct chairmanDecisionId variable
    // (adversarial /ship-gate finding #2) after the shared prefix.
    const preExecSkipTagged = source.split("{ advancementType: 'pre_exec_skip', chairmanGateSource: 'chairman_decision', chairmanDecisionId:").length - 1;
    expect(preExecSkipTagged).toBe(2);
  });

  it('pre_exec_skip_trigger call site is tagged (DB-trigger-already-applied shortcut)', () => {
    expect(source).toContain("{ advancementType: 'pre_exec_skip_trigger', chairmanGateSource: 'chairman_decision', chairmanDecisionId:");
  });

  it('re_entry call site is tagged (worker re-entry after approval)', () => {
    expect(source).toContain("advancementType: 're_entry', chairmanGateSource: 'chairman_decision', chairmanDecisionId:");
  });

  it('all 4 tagged call sites also thread a real chairman_decisions.id via chairmanDecisionId (adversarial /ship-gate finding #2)', () => {
    // MUTATION: without this, `reasoning` in the recordGateAttempt() call can never reference
    // the actual chairman_decisions row, contradicting FR-1's own spec text.
    const chairmanDecisionIdTagged = source.split("chairmanGateSource: 'chairman_decision', chairmanDecisionId:").length - 1;
    expect(chairmanDecisionIdTagged).toBe(4);
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
    // Re-anchored (not a fixed-width window) after the adversarial /ship-gate finding #2 fix
    // widened the recordGateAttempt() call with a chairmanDecisionRef/reasoning-ternary/metadata
    // block, which had pushed `catch (err)` past a previous fixed 700-char offset.
    const guardIdx = source.indexOf("result?._chairmanGateSource === 'chairman_decision'");
    const tryIdx = source.indexOf('try {', guardIdx);
    const catchIdx = source.indexOf('catch (err)', tryIdx);
    expect(guardIdx).toBeGreaterThan(-1);
    expect(tryIdx).toBeGreaterThan(guardIdx);
    expect(catchIdx).toBeGreaterThan(tryIdx);
    const windowAfter = source.slice(guardIdx, catchIdx + 300);
    expect(windowAfter).toContain('try {');
    expect(windowAfter).toContain('catch (err)');
    expect(windowAfter).toContain('non-fatal');
    // A ledger-write failure must never re-throw and undo the already-committed stage advance.
    expect(windowAfter).not.toMatch(/catch \(err\) \{\s*throw/);
  });
});

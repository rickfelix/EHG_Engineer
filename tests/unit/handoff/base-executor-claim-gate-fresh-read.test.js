/**
 * SD-LEO-FIX-POST-MERGE-AUTOMATION-001 FR-2 — BaseExecutor's fresh-status re-read
 * before the claim-gate decision.
 *
 * Flagged by the EXEC-TO-PLAN TESTING review: evaluateClaimCheckForHandoff's new
 * sdStatus exemption is behaviorally tested in isolation (handoff-claim-gate.test.js),
 * but the glue code in BaseExecutor.js that (a) only re-reads when ownership is
 * 'unclaimed', (b) re-reads via sdRepo.getById rather than trusting the Step-1
 * snapshot, and (c) propagates the fresh row downstream when alreadyCompleted, was
 * untested. BaseExecutor.execute() is not practically unit-testable end-to-end (it
 * chains dozens of dynamic imports — migration checks, DFE escalation, telemetry
 * spans, etc.) — this file follows the same source-shape verification convention
 * already established for this exact class of embedded-in-execute() logic (see
 * base-executor-marker-race-retry.test.js).
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

function readSource(rel) {
  return fs.readFileSync(path.resolve(process.cwd(), rel), 'utf8');
}

describe('BaseExecutor claim-gate fresh-status re-read (SD-LEO-FIX-POST-MERGE-AUTOMATION-001)', () => {
  const src = readSource('scripts/modules/handoff/executors/BaseExecutor.js');

  it('only re-reads when ownership is unclaimed (happy path pays no extra query)', () => {
    expect(src).toMatch(/claimCheck\?\.ownership === 'unclaimed'/);
  });

  it('re-reads via sdRepo.getById, not a raw supabase call bypassing the repo layer', () => {
    expect(src).toMatch(/const refetched = await this\.sdRepo\.getById\(sdId\)/);
  });

  it('re-fetch failure is fail-soft (does not throw the whole handoff)', () => {
    expect(src).toMatch(/this\.sdRepo\.getById\(sdId\)\.catch\(\(\) => null\)/);
  });

  it('the fresh status (not the Step-1 snapshot) feeds evaluateClaimCheckForHandoff', () => {
    expect(src).toMatch(/evaluateClaimCheckForHandoff\(claimCheck, sdKeyForGate, freshSdForGate\?\.status\)/);
  });

  it('alreadyCompleted propagates the fresh row downstream by reassigning sd (not just a local var)', () => {
    // `sd` must be declared with `let` (reassignable) and reassigned on the exemption path,
    // so setup()/executeSpecific() downstream see status='completed', not a stale snapshot.
    expect(src).toMatch(/let sd = await this\.sdRepo\.getById\(sdId\);/);
    const alreadyCompletedIfIdx = src.indexOf('if (noClaim.alreadyCompleted) {');
    const reassignIdx = src.indexOf('sd = freshSdForGate;');
    expect(alreadyCompletedIfIdx).toBeGreaterThan(-1);
    expect(reassignIdx).toBeGreaterThan(alreadyCompletedIfIdx);
    expect(reassignIdx - alreadyCompletedIfIdx).toBeLessThan(500); // reassignment is inside this block, not some unrelated later spot
  });

  it('the block check still runs before the alreadyCompleted propagation (block takes precedence)', () => {
    const blockIdx = src.indexOf('if (noClaim.block) {');
    const alreadyCompletedIdx = src.indexOf('if (noClaim.alreadyCompleted) {');
    expect(blockIdx).toBeGreaterThan(-1);
    expect(alreadyCompletedIdx).toBeGreaterThan(blockIdx);
  });
});

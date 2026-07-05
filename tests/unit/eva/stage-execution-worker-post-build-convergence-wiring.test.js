/**
 * SD-LEO-INFRA-POST-BUILD-ARTIFACT-001-D — static-source-pin test for the S19 post-build
 * convergence gate wiring inside StageExecutionWorker._processVenture. `_processVenture` is a
 * large, heavily side-effecting method (existing stage-execution-worker.test.js's own harness
 * comment: "a while loop (currentStage <= 25)... tests MUST ensure the loop terminates") — the
 * new call is a small, isolated, try/catch-wrapped, non-blocking insertion whose branch logic is
 * already exhaustively covered by tests/unit/eva/post-build-convergence-gate.test.js. This test
 * pins the WIRING SHAPE (source-text assertions) rather than re-driving the whole stage loop:
 * that the call lands strictly after both existing S19 hard-gate blocks, is non-blocking
 * (no releaseState/break in its own try/catch), and passes the (supabase, ventureId, logger)
 * contract the unit-tested module expects.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SOURCE = readFileSync(resolve(process.cwd(), 'lib/eva/stage-execution-worker.js'), 'utf8');

describe('StageExecutionWorker source: post-build convergence gate wiring', () => {
  it('imports runS19ConvergenceGate from the new module', () => {
    expect(SOURCE).toMatch(/import\s*\{\s*runS19ConvergenceGate\s*\}\s*from\s*['"]\.\/post-build-convergence-gate\.js['"]/);
  });

  it('the gate call lands strictly AFTER both existing S19 hard-gate blocks (s19_sd_completion_invariant, s19_build_checkpoint_chairman)', () => {
    const completionGateIdx = SOURCE.indexOf("gate: 's19_sd_completion_invariant'");
    const checkpointGateIdx = SOURCE.indexOf("gate: 's19_build_checkpoint_chairman'");
    const convergenceCallIdx = SOURCE.indexOf('runS19ConvergenceGate(this._supabase, ventureId');
    expect(completionGateIdx).toBeGreaterThan(-1);
    expect(checkpointGateIdx).toBeGreaterThan(-1);
    expect(convergenceCallIdx).toBeGreaterThan(-1);
    expect(convergenceCallIdx).toBeGreaterThan(completionGateIdx);
    expect(convergenceCallIdx).toBeGreaterThan(checkpointGateIdx);
  });

  it('the gate call is wrapped in its own try/catch that never sets releaseState or breaks (non-blocking regression guard)', () => {
    const callIdx = SOURCE.indexOf('runS19ConvergenceGate(this._supabase, ventureId');
    // Isolate the immediately-enclosing try{...}catch block around the call (bounded window,
    // generous enough for the call + its surrounding log/warn lines, tight enough to not bleed
    // into the unrelated code above it).
    const windowStart = SOURCE.lastIndexOf('try {', callIdx);
    const windowEnd = SOURCE.indexOf('\n        }', callIdx);
    const block = SOURCE.slice(windowStart, windowEnd + 10);
    expect(block).not.toMatch(/releaseState\s*=/);
    expect(block).not.toMatch(/\bbreak\s*;/);
    expect(block).toMatch(/catch\s*\(/);
  });

  it('passes the (supabase, ventureId, {logger}) contract the unit-tested gate module expects', () => {
    expect(SOURCE).toMatch(/runS19ConvergenceGate\(this\._supabase,\s*ventureId,\s*\{\s*logger:\s*this\._logger\s*\}\)/);
  });
});

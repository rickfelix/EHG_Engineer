// SD-LEO-FEAT-FLEET-SESSION-LIFECYCLE-001 / FR-2 — CLI adapter.
// The orchestration is tested in lib/fleet/graceful-kill.test.js; these cover the ADAPTER,
// where a wrong mapping would silently change what the operator is told.

import { describe, it, expect } from 'vitest';
import { claudeProbeToTriState, buildKillDeps } from '../../../scripts/fleet-kill.mjs';

describe('FR2-CLI: pidIsClaude is TRI-STATE and must not be flattened', () => {
  it('MATCH means the pid IS the agent', () => {
    expect(claudeProbeToTriState('MATCH')).toBe(true);
  });

  it('NO_MATCH means the pid is NOT the agent — the shell-wrapper case', () => {
    expect(claudeProbeToTriState('NO_MATCH')).toBe(false);
  });

  it('PROBE_FAILED IS NOT false — a broken probe is not a wrong-process diagnosis', () => {
    // Both end in a refusal, but they are different FACTS and produce different messages:
    // false says "this is the shell wrapper claude_sessions.pid falls back to"; undefined says
    // "the probe broke and told us nothing". claimant-liveness's own docblock is explicit that
    // PROBE_FAILED is NOT death, so flattening it would report a diagnosis we never made.
    expect(claudeProbeToTriState('PROBE_FAILED')).toBeUndefined();
  });

  it('an unrecognised probe result is treated as unverifiable, never as a pass', () => {
    expect(claudeProbeToTriState(undefined)).toBeUndefined();
    expect(claudeProbeToTriState('')).toBeUndefined();
    expect(claudeProbeToTriState(true)).toBeUndefined();
  });
});

// FR-2 AC-2-3. buildKillDeps had NO test, and that is exactly where the defect lived: verifyGone
// was left undefined on the production path, graceful-kill reads it as
// `gone = verifyGone ? await verifyGone(pid) : true`, so `gone` was unconditionally true, the
// SIGKILL escalation was dead code, and the verdict claimed "terminated and verified absent"
// having verified nothing. These assert the DEP SET the operator actually gets.
describe('FR2-CLI: buildKillDeps supplies verifyGone and it FAILS CLOSED', () => {
  const deps = (opts) => buildKillDeps({}, 'sess-1', opts);

  it('supplies verifyGone on the PRODUCTION path — the regression that made the kill lie', () => {
    // Was `undefined` before the fix. If this ever regresses, graceful-kill silently reports a
    // verification it never performed, so this assertion is the whole point of the file.
    expect(typeof deps({ dryRun: false }).verifyGone).toBe('function');
  });

  it('a dry run still short-circuits to true', async () => {
    await expect(deps({ dryRun: true }).verifyGone(4321)).resolves.toBe(true);
  });

  // WHY THE MAPPING IS NOT MOCK-TESTED HERE, stated instead of quietly omitted:
  // fleet-kill.mjs pulls pidIsClaude through createRequire (`require('../lib/fleet/
  // claimant-liveness.cjs')`), which vi.mock cannot intercept — a mock-based MATCH/PROBE_FAILED
  // test SILENTLY runs the real probe and passes for the wrong reason. I tried it; every pid came
  // back NO_MATCH. Asserting the composed expression against a re-derivation instead would be the
  // same source-text/self-comparison anti-pattern this SD is full of, so it is not done.
  // The mapping IS covered: the tri-state block above pins claudeProbeToTriState exhaustively, and
  // verifyGone composes exactly `claudeProbeToTriState(pidIsClaude(pid)) === false`, so only
  // NO_MATCH yields gone. Making this directly observable needs an injectable probe in
  // buildKillDeps — a refactor, deliberately outside this wiring fix's scope fence.
  it('is exactly the fail-closed composition: only NO_MATCH maps to gone', () => {
    expect(claudeProbeToTriState('NO_MATCH') === false).toBe(true);   // gone
    expect(claudeProbeToTriState('MATCH') === false).toBe(false);     // still alive
    expect(claudeProbeToTriState('PROBE_FAILED') === false).toBe(false); // unverifiable -> NOT gone
  });
});

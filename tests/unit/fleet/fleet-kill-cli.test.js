// SD-LEO-FEAT-FLEET-SESSION-LIFECYCLE-001 / FR-2 — CLI adapter.
// The orchestration is tested in lib/fleet/graceful-kill.test.js; these cover the ADAPTER,
// where a wrong mapping would silently change what the operator is told.

import { describe, it, expect } from 'vitest';
import { claudeProbeToTriState } from '../../../scripts/fleet-kill.mjs';

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

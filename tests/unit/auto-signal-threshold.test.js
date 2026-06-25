/**
 * Auto-signal threshold decision — SD-LEO-INFRA-THRESHOLD-AUTO-SIGNAL-001 (FR-1).
 *
 * The enforcement layer now AUTO-EMITS a /signal at the RCA recurrence threshold instead of relying
 * on worker discretion. These tests pin the pure decision + arg-format helper (the hook fire-and-
 * forget spawns worker-signal.cjs with them). Critical invariants: fires EXACTLY ONCE per escalation
 * (on the ===2 crossing, not the 3rd hard-block), respects the LEO_AUTO_SIGNAL=off kill-switch, and
 * never fires without a real session identity.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { shouldEmitAutoSignal, buildAutoSignalArgs, shouldEmitGateAutoSignal, buildGateAutoSignalArgs } = require('../../lib/hooks/auto-signal-threshold.cjs');

const SID = '11111111-2222-4333-8444-555555555555';

describe('shouldEmitAutoSignal (FR-1)', () => {
  it('fires exactly on the 2nd-attempt crossing', () => {
    expect(shouldEmitAutoSignal({ attempts: 2, sessionId: SID, env: {} })).toBe(true);
  });

  it('does NOT fire on the 1st attempt (no recurrence yet)', () => {
    expect(shouldEmitAutoSignal({ attempts: 1, sessionId: SID, env: {} })).toBe(false);
  });

  it('does NOT re-fire on the 3rd+ attempt (dedupe — 3rd hard-blocks, already signalled at 2)', () => {
    expect(shouldEmitAutoSignal({ attempts: 3, sessionId: SID, env: {} })).toBe(false);
    expect(shouldEmitAutoSignal({ attempts: 5, sessionId: SID, env: {} })).toBe(false);
  });

  it('respects the LEO_AUTO_SIGNAL=off kill-switch', () => {
    expect(shouldEmitAutoSignal({ attempts: 2, sessionId: SID, env: { LEO_AUTO_SIGNAL: 'off' } })).toBe(false);
  });

  it('does not fire without a real session identity', () => {
    expect(shouldEmitAutoSignal({ attempts: 2, sessionId: undefined, env: {} })).toBe(false);
    expect(shouldEmitAutoSignal({ attempts: 2, sessionId: 'unknown', env: {} })).toBe(false);
  });

  it('ignores non-integer attempts (fail-safe)', () => {
    expect(shouldEmitAutoSignal({ attempts: NaN, sessionId: SID, env: {} })).toBe(false);
    expect(shouldEmitAutoSignal({ attempts: undefined, sessionId: SID, env: {} })).toBe(false);
  });
});

describe('shouldEmitAutoSignal — Control 3 progress re-scope (SD-LEO-INFRA-RCA-AUTOSIGNAL-FALSE-POSITIVE-001)', () => {
  it('SUPPRESSES the signal when the session is demonstrably progressing (progressStalled=false)', () => {
    expect(shouldEmitAutoSignal({ attempts: 2, sessionId: SID, progressStalled: false, env: {} })).toBe(false);
  });

  it('still fires at the ===2 crossing when progress is stalled (progressStalled=true)', () => {
    expect(shouldEmitAutoSignal({ attempts: 2, sessionId: SID, progressStalled: true, env: {} })).toBe(true);
  });

  it('preserves prior fire-on-crossing behavior when progress is unknown (progressStalled=undefined)', () => {
    expect(shouldEmitAutoSignal({ attempts: 2, sessionId: SID, env: {} })).toBe(true);
  });

  it('kill-switch and dedupe still win over progressStalled=true', () => {
    expect(shouldEmitAutoSignal({ attempts: 2, sessionId: SID, progressStalled: true, env: { LEO_AUTO_SIGNAL: 'off' } })).toBe(false);
    expect(shouldEmitAutoSignal({ attempts: 3, sessionId: SID, progressStalled: true, env: {} })).toBe(false);
  });
});

describe('buildAutoSignalArgs (FR-1)', () => {
  it('builds a stuck/high signal with a single-line bounded body referencing the SD', () => {
    const args = buildAutoSignalArgs({ toolName: 'Bash', signature: 'git reset --hard', attempts: 2, sdKey: 'SD-X-001' });
    expect(args[0]).toBe('stuck');
    expect(args).toContain('--severity');
    expect(args[args.indexOf('--severity') + 1]).toBe('high');
    const body = args[1];
    expect(body).toContain('Bash');
    expect(body).toContain('SD-X-001');
    expect(body).toContain('SD-LEO-INFRA-THRESHOLD-AUTO-SIGNAL-001');
    expect(body).not.toContain('\n');           // single-line (safe to pass as one argv element)
  });

  it('collapses whitespace and bounds a long/multi-line signature', () => {
    const longSig = 'a'.repeat(400) + '\n\tweird   spacing';
    const args = buildAutoSignalArgs({ toolName: 'Edit', signature: longSig, attempts: 2 });
    expect(args[1]).not.toContain('\n');
    expect(args[1].length).toBeLessThan(400);   // signature was truncated to <=120
  });

  it('omits the SD clause when no sdKey is known', () => {
    const args = buildAutoSignalArgs({ toolName: 'Bash', signature: 'sig', attempts: 2 });
    expect(args[1]).not.toContain('(SD ');
  });
});

// SD-LEO-INFRA-SIGNAL-THRESHOLD-AUTO-EMIT-001 (FR-1): the gate-2x enforcement-site decision.
describe('shouldEmitGateAutoSignal (gate-2x)', () => {
  it('fires exactly on the 2nd gate-retry crossing', () => {
    expect(shouldEmitGateAutoSignal({ retryCount: 2, sessionId: SID, env: {} })).toBe(true);
  });

  it('does NOT fire on the 1st retry (no recurrence yet)', () => {
    expect(shouldEmitGateAutoSignal({ retryCount: 1, sessionId: SID, env: {} })).toBe(false);
  });

  it('does NOT re-fire on the 3rd+ retry (dedupe — once per escalation)', () => {
    expect(shouldEmitGateAutoSignal({ retryCount: 3, sessionId: SID, env: {} })).toBe(false);
    expect(shouldEmitGateAutoSignal({ retryCount: 5, sessionId: SID, env: {} })).toBe(false);
  });

  it('respects the LEO_AUTO_SIGNAL=off kill-switch', () => {
    expect(shouldEmitGateAutoSignal({ retryCount: 2, sessionId: SID, env: { LEO_AUTO_SIGNAL: 'off' } })).toBe(false);
  });

  it('does not fire without a real session identity', () => {
    expect(shouldEmitGateAutoSignal({ retryCount: 2, sessionId: undefined, env: {} })).toBe(false);
    expect(shouldEmitGateAutoSignal({ retryCount: 2, sessionId: 'unknown', env: {} })).toBe(false);
  });

  it('ignores non-integer retryCount (fail-safe)', () => {
    expect(shouldEmitGateAutoSignal({ retryCount: NaN, sessionId: SID, env: {} })).toBe(false);
    expect(shouldEmitGateAutoSignal({ retryCount: undefined, sessionId: SID, env: {} })).toBe(false);
  });
});

describe('buildGateAutoSignalArgs (gate-2x)', () => {
  it('builds a stuck/high single-line body referencing the gate + SD', () => {
    const args = buildGateAutoSignalArgs({ gateName: 'WIRE_CHECK_GATE', sdKey: 'SD-X-001', retryCount: 2 });
    expect(args[0]).toBe('stuck');
    expect(args).toContain('--severity');
    expect(args[args.indexOf('--severity') + 1]).toBe('high');
    const body = args[1];
    expect(body).toContain('WIRE_CHECK_GATE');
    expect(body).toContain('SD-X-001');
    expect(body).toContain('SD-LEO-INFRA-SIGNAL-THRESHOLD-AUTO-EMIT-001');
    expect(body).not.toContain('\n');
  });

  it('bounds a long/multi-line gate name and defaults a missing retryCount', () => {
    const args = buildGateAutoSignalArgs({ gateName: 'g'.repeat(200) + '\n weird', sdKey: 'SD-Y' });
    expect(args[1]).not.toContain('\n');
    expect(args[1]).toContain('2x'); // retryCount defaults to 2
  });

  it('omits the SD clause when no sdKey is known and falls back to "a gate"', () => {
    const args = buildGateAutoSignalArgs({ retryCount: 2 });
    expect(args[1]).not.toContain('(SD ');
    expect(args[1]).toContain('a gate');
  });
});

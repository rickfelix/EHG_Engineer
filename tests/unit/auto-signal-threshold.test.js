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
const { shouldEmitAutoSignal, buildAutoSignalArgs } = require('../../lib/hooks/auto-signal-threshold.cjs');

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

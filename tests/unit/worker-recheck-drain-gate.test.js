/**
 * SD-LEO-INFRA-WORKER-ESCALATION-WRITE-001 FR-6 — a blocker re-assertion is unsound until the
 * worker has drained its inbox in the same pass.
 *
 * MEASURED MOTIVATION: Alpha-3 re-checked its own blocker correctly on every pass, exactly as the
 * directive instructs, and still sat for ten hours — because it never re-read INBOUND while the
 * coordinator was actively sending it the diagnosis that would have unstuck it.
 *
 * Named .test.js deliberately: the vitest `unit` project globs every ".test.js" file but only two
 * narrow .mjs anchors (tests/unit/org, tests/unit/venture-email), so a ".test.mjs" here would never
 * run in CI — the exact gap measured in QF-20260728-823 (12 of 25 .test.mjs files gate nothing).
 */
import { describe, it, expect } from 'vitest';
import { applyDrainGate, countUndrainedInbound } from '../../lib/fleet/blocker-drain-gate.mjs';

describe('FR-6 drain gate', () => {
  it('REJECTS a still-blocking assertion when inbound is undrained', () => {
    expect(applyDrainGate('still_blocking', 1)).toBe('drain_required');
    expect(applyDrainGate('still_blocking', 74)).toBe('drain_required');
  });

  it('allows a still-blocking assertion once the inbox is drained', () => {
    expect(applyDrainGate('still_blocking', 0)).toBe('still_blocking');
  });

  it('NEVER withholds good news — a cleared blocker passes through an undrained inbox', () => {
    // The asymmetry is load-bearing. Gating CLEARED would keep a worker blocked in order to
    // enforce a process rule, which is precisely the harm FR-6 exists to prevent.
    expect(applyDrainGate('cleared', 99)).toBe('cleared');
  });

  it('does not gate INDETERMINATE — a broken check must stay distinguishable', () => {
    expect(applyDrainGate('indeterminate', 5)).toBe('indeterminate');
  });

  it('fails OPEN when the count is unavailable, so telemetry loss cannot manufacture a blocker', () => {
    expect(applyDrainGate('still_blocking', null)).toBe('still_blocking');
    expect(applyDrainGate('still_blocking', undefined)).toBe('still_blocking');
    expect(applyDrainGate('still_blocking', NaN)).toBe('still_blocking');
  });

  it('counts UNACKED inbound, not unread — a read-but-unactioned row still blocks the assertion', async () => {
    // QF-20260703-476: acknowledged_at IS NULL is the correct predicate. read_at is stamped on mere
    // delivery (and, per this SD, even on dashboard render), so an unread-only test would let a
    // surfaced-but-unactioned answer pass as drained.
    const calls = [];
    const countFn = async (sid) => { calls.push(sid); return 3; };
    const n = await countUndrainedInbound('session-abc', countFn);
    expect(n).toBe(3);
    expect(calls).toEqual(['session-abc']);
    expect(applyDrainGate('still_blocking', n)).toBe('drain_required');
  });

  it('returns null without a session id, and swallows a throwing counter', async () => {
    expect(await countUndrainedInbound(null, async () => 5)).toBe(null);
    const boom = async () => { throw new Error('db down'); };
    expect(await countUndrainedInbound('session-abc', boom)).toBe(null);
  });
});

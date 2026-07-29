/**
 * QF-20260727-395 — WIRING test, differential.
 *
 * The row's whole complaint is that a correct instrument can be attached to the wrong side of the
 * conversation and nobody notices. A test that merely asserted "idle.cjs imports the assessor"
 * would be the same defect: an import proves the symbol resolves, not that the verdict is READ.
 *
 * So this drives the real idle step TWICE with inputs that differ in ONE field, and requires the
 * consumer's OBSERVABLE OUTPUT to differ. If both runs produced the same message, the signal is
 * computed-and-discarded and this test fails — which is the only outcome that would tell us the
 * wiring is decorative.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const idleStep = require('../../../lib/checkin/steps/idle.cjs');

// Minimal ctx: the idle step's other dependencies are stubbed to their no-op shapes so the only
// thing varying between runs is the belt input under test.
function makeCtx(base) {
  return {
    sb: {},
    sessionId: 'test-session',
    sessionMetadata: {},              // no model => not a Fable seat => the plain 'idle' return
    helpers: {
      // Force the adaptive-cadence block down its fail-open path so it cannot vary the message.
      getCommsActivitySignals: async () => { throw new Error('stubbed'); },
      computeAdaptiveCadence: () => ({ tight: false, intervalMs: 0, reason: '' }),
      DEFAULT_IDLE_WAKEUP_SECONDS: 1200,
    },
    base,
  };
}

// Charlie's 20:38Z measurement: 0 claimable, coordinator-owned bucket largest.
const BLOCKED_BASE = {
  belt_ranked_claimable: 21,
  belt_claimable_at_my_tier: 0,
  belt_ineligibility_breakdown: { needs_coordinator_review: 10, human_action_required: 9 },
};
// ONE field different: the largest bucket is now the chairman's queue, not the coordinator's.
const NOT_BLOCKED_BASE = {
  belt_ranked_claimable: 21,
  belt_claimable_at_my_tier: 0,
  belt_ineligibility_breakdown: { needs_coordinator_review: 2, human_action_required: 17 },
};

describe('QF-20260727-395 wiring: the idle step CONSUMES the belt-block verdict', () => {
  it('DIFFERENTIAL: the same step, one field different, produces DIFFERENT observable output', async () => {
    const blocked = await idleStep.run(makeCtx({ ...BLOCKED_BASE }));
    const notBlocked = await idleStep.run(makeCtx({ ...NOT_BLOCKED_BASE }));

    // The load-bearing assertion. Identical messages here would mean the verdict is computed and
    // thrown away -- an emit with no consumer, which this QF exists to prevent.
    expect(blocked.message).not.toBe(notBlocked.message);
    expect(blocked.message).toContain('BELT BLOCKED ON THE COORDINATOR');
    expect(notBlocked.message).not.toContain('BELT BLOCKED ON THE COORDINATOR');
  });

  it('names the bucket and the count, so the coordinator does not have to go hunting', async () => {
    const blocked = await idleStep.run(makeCtx({ ...BLOCKED_BASE }));
    expect(blocked.message).toContain('needs_coordinator_review');
    expect(blocked.message).toContain('10');
  });

  it('distinguishes "blocked on a ruling" from "work ran out" in the text itself', async () => {
    const blocked = await idleStep.run(makeCtx({ ...BLOCKED_BASE }));
    // The row is explicit that these two states look identical from every surface today.
    expect(blocked.message).toContain('NOT "work ran out"');
  });

  it('does NOT nag: holding a fence is named as correct behaviour, the invisibility is the defect', async () => {
    const blocked = await idleStep.run(makeCtx({ ...BLOCKED_BASE }));
    expect(blocked.message).toContain('correct');
    expect(blocked.message).toContain('not NOTICING is the defect');
  });

  it('exposes the structured verdict on ctx.base for consumers other than the message', async () => {
    const ctx = makeCtx({ ...BLOCKED_BASE });
    const out = await idleStep.run(ctx);
    expect(out.belt_block).toBeTruthy();
    expect(out.belt_block.verdict).toBe('BLOCKED_ON_COORDINATOR');
    expect(out.belt_block.largestBucket).toBe('needs_coordinator_review');
  });

  it('FAIL-OPEN: a missing breakdown yields NOT_MEASURED and still returns a normal idle', async () => {
    // An unwired upstream must not fabricate a healthy verdict, and must not break the check-in.
    const out = await idleStep.run(makeCtx({ belt_ranked_claimable: 0 }));
    expect(out.action).toBe('idle');
    expect(out.message).not.toContain('BELT BLOCKED ON THE COORDINATOR');
    expect(out.belt_block.verdict).toBe('NOT_MEASURED');
  });
});

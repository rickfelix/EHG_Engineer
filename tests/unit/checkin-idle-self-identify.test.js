/**
 * QF-20260831-738 — an idle-beside-claimable seat must self-identify instead of sitting silent.
 *
 * CHAIRMAN-PROPOSED MECHANISM (ratification f48e0abf): when a holderless seat's checkin resolves
 * idle but the belt shows claimable items it did not take, emit a self-identify signal (worker-signal
 * feedback lane) naming the items and why each was refused, and ask the question upward — once per
 * condition-onset (fingerprint of the ineligibility breakdown), never per tick.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const idleStep = require('../../lib/checkin/steps/idle.cjs');

const spawnMock = vi.fn();

function makeCtx({ base = {}, sessionMetadata = {} } = {}) {
  const metaWrites = [];
  return {
    metaWrites,
    ctx: {
      sb: {
        from: () => ({
          update: (m) => ({ eq: () => { metaWrites.push(m); return Promise.resolve({ data: null, error: null }); } }),
        }),
      },
      sessionId: 'S-1',
      sessionMetadata,
      base: { belt_ranked_claimable: 0, belt_claimable_at_my_tier: 0, work_class_fenced: [], coordinator_messages: [], ...base },
      helpers: {
        DEFAULT_IDLE_WAKEUP_SECONDS: 1200,
        getCommsActivitySignals: async () => ({}),
        computeAdaptiveCadence: () => ({ tight: false }),
        ws: { DIRECTIVE_KINDS: [] },
        spawnWorkerSignal: (sid, body) => spawnMock(sid, body),
      },
    },
  };
}

beforeEach(() => { spawnMock.mockClear(); });

describe('QF-20260831-738 — idle-beside-claimable self-identify', () => {
  it('emits a self-identify signal naming the reasons when claimable items exist but none are claimable to me', async () => {
    const { ctx } = makeCtx({ base: {
      belt_ranked_claimable: 5,
      belt_claimable_at_my_tier: 0,
      belt_ineligibility_breakdown: { human_action_required: 3, needs_coordinator_review: 2 },
    } });
    await idleStep.run(ctx);
    expect(spawnMock).toHaveBeenCalledTimes(1);
    const [sid, body] = spawnMock.mock.calls[0];
    expect(sid).toBe('S-1');
    expect(body).toContain('3x human_action_required');
    expect(body).toContain('2x needs_coordinator_review');
    expect(body).toContain('premise_measured_at=');
  });

  it('does NOT emit when the seat has an actual claim opportunity (claimableAtTier > 0)', async () => {
    const { ctx } = makeCtx({ base: { belt_ranked_claimable: 5, belt_claimable_at_my_tier: 2 } });
    await idleStep.run(ctx);
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('does NOT emit when the belt is genuinely empty (nothing to self-identify about)', async () => {
    const { ctx } = makeCtx({ base: { belt_ranked_claimable: 0, belt_claimable_at_my_tier: 0 } });
    await idleStep.run(ctx);
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('fires once per condition-onset, not once per tick — same fingerprint = no duplicate', async () => {
    const breakdown = { human_action_required: 3 };
    const { ctx: ctx1 } = makeCtx({ base: { belt_ranked_claimable: 3, belt_claimable_at_my_tier: 0, belt_ineligibility_breakdown: breakdown } });
    await idleStep.run(ctx1);
    expect(spawnMock).toHaveBeenCalledTimes(1);

    // Second tick: same fingerprint carried forward via sessionMetadata (as a real re-checkin would).
    const { ctx: ctx2 } = makeCtx({
      sessionMetadata: { idle_self_identify_fp: 'human_action_required:3' },
      base: { belt_ranked_claimable: 3, belt_claimable_at_my_tier: 0, belt_ineligibility_breakdown: breakdown },
    });
    await idleStep.run(ctx2);
    expect(spawnMock).toHaveBeenCalledTimes(1); // still 1 — no duplicate on an unchanged condition
  });

  it('re-fires when the condition changes (a genuinely new breakdown = a new onset)', async () => {
    const { ctx } = makeCtx({
      sessionMetadata: { idle_self_identify_fp: 'human_action_required:3' },
      base: { belt_ranked_claimable: 2, belt_claimable_at_my_tier: 0, belt_ineligibility_breakdown: { orchestrator_parent: 2 } },
    });
    await idleStep.run(ctx);
    expect(spawnMock).toHaveBeenCalledTimes(1);
  });
});

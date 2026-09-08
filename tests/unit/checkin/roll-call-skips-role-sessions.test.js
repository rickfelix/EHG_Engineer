/**
 * QF-20260904-935 — role seats (Adam, Solomon, coordinator) must not write a roll_call
 * row. registerRollCall hard-codes sender_type 'worker' and available=!mySd; running it
 * from a non-fleet role session produces a false availability record. Census (session_
 * coordination filtered on sender_session + payload.kind=roll_call) found no consumer
 * reading these rows for a liveness signal, so the fix skips the write entirely for any
 * session role-status-identity classifies as ROLE.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const rollCallStep = require('../../../lib/checkin/steps/roll-call.cjs');
const { runSteps } = require('../../../lib/checkin/pipeline.cjs');

/** ctx mirroring resolveCheckin's real construction (scripts/worker-checkin.cjs). */
function makeCtx({ metadata = {}, registerRollCallCalls = [] } = {}) {
  return {
    sb: {},
    sessionId: 'sess-under-test',
    coordinatorId: 'coord-1',
    callsign: 'Bravo',
    mySd: null,
    sessionRole: metadata.role || null,
    sessionMetadata: metadata,
    base: null,
    helpers: {
      registerRollCall: async (_sb, args) => {
        registerRollCallCalls.push(args);
        return { id: 'roll-call-row-1', deduped: false };
      },
      surfaceCoordinatorMessages: async () => [],
      fetchOutstandingSignals: async () => ({ count: 0 }),
      formatOutstandingWarning: () => null,
    },
  };
}

describe('QF-20260904-935: roll-call step skips role sessions', () => {
  it('a non_fleet role session (e.g. Adam) writes NO roll_call row', async () => {
    const calls = [];
    const ctx = makeCtx({ metadata: { non_fleet: true, role: 'adam' }, registerRollCallCalls: calls });

    await runSteps([rollCallStep], ctx);

    expect(calls).toEqual([]);
    expect(ctx.base.roll_call_id).toBeNull();
  });

  it('the coordinator role session (role:"coordinator" shape) writes NO self-addressed roll_call row', async () => {
    const calls = [];
    const ctx = makeCtx({ metadata: { role: 'coordinator' }, registerRollCallCalls: calls });

    await runSteps([rollCallStep], ctx);

    expect(calls).toEqual([]);
    expect(ctx.base.roll_call_id).toBeNull();
  });

  // QF-20260906-473: the REAL coordinator-election writer (lib/coordinator/resolve.cjs) stamps
  // is_coordinator:true, never role:'coordinator' -- the test above exercised a shape no live
  // session actually produces. Live-measured: 41 available:true roll_call rows leaked from the
  // real coordinator session (metadata carried is_coordinator:true with no role key at all)
  // through this exact step, via the same-turn-next-claim path in stop-loop-wakeup-reminder.cjs.
  it('QF-20260906-473: the REAL coordinator session shape (is_coordinator:true, no role key) writes NO roll_call row', async () => {
    const calls = [];
    const ctx = makeCtx({ metadata: { is_coordinator: true, tier_rank: 4 }, registerRollCallCalls: calls });

    await runSteps([rollCallStep], ctx);

    expect(calls).toEqual([]);
    expect(ctx.base.roll_call_id).toBeNull();
  });

  it('a role lifecycle variant (e.g. adam_retired) is still classified as ROLE and skipped', async () => {
    const calls = [];
    const ctx = makeCtx({ metadata: { role: 'adam_retired' }, registerRollCallCalls: calls });

    await runSteps([rollCallStep], ctx);

    expect(calls).toEqual([]);
  });

  it('NEGATIVE CONTROL: an ordinary worker session still registers its roll_call row', async () => {
    const calls = [];
    const ctx = makeCtx({ metadata: { fleet_identity: { callsign: 'Bravo' } }, registerRollCallCalls: calls });

    await runSteps([rollCallStep], ctx);

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ sessionId: 'sess-under-test', coordinatorId: 'coord-1' });
    expect(ctx.base.roll_call_id).toBe('roll-call-row-1');
  });

  it('NEGATIVE CONTROL: an unrecognized role string classifies as WORKER, not ROLE, and still registers', async () => {
    const calls = [];
    const ctx = makeCtx({ metadata: { role: 'gardener' }, registerRollCallCalls: calls });

    await runSteps([rollCallStep], ctx);

    expect(calls).toHaveLength(1);
  });
});

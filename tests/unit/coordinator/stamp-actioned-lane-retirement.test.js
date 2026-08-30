/**
 * QF-20260830-084 — coordinator-ack-adam.cjs stamped payload.actioned_at while
 * summarizePendingLane counted acknowledged_at IS NULL as pending: two retirement
 * predicates on one row. Measured: 46 fully-actioned adam_advisory rows read
 * permanently pending in the lane counter (up to 29h).
 *
 * Fix: stampActioned now writes acknowledged_at alongside payload.actioned_at, same
 * action, same timestamp -- one retirement predicate, satisfied at the single write
 * seam rather than patched into every reader.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require_ = createRequire(import.meta.url);
const { stampActioned } = require_('../../../lib/coordinator/adam-advisory-store.cjs');
const { summarizePendingLane } = require_('../../../lib/coordination/lane-pending-gauge.cjs');

function fakeClient() {
  const updates = [];
  return {
    updates,
    from() {
      return {
        update(payload) {
          updates.push(payload);
          return { eq: async () => ({ error: null }) };
        },
        insert: async () => ({ error: null }),
      };
    },
  };
}

const ROW = {
  id: 'adv-1',
  created_at: '2026-08-30T10:00:00Z',
  payload: { kind: 'adam_advisory', action_required: true },
};
const NOW = '2026-08-30T10:05:00Z';

describe('QF-20260830-084: stampActioned writes acknowledged_at, one retirement predicate', () => {
  it('the update call sets both payload.actioned_at and acknowledged_at to the same timestamp', async () => {
    const c = fakeClient();
    const { error } = await stampActioned(c, ROW, NOW);
    expect(error).toBeNull();
    expect(c.updates).toHaveLength(1);
    expect(c.updates[0].payload.actioned_at).toBe(NOW);
    expect(c.updates[0].acknowledged_at).toBe(NOW);
  });

  it('fixture: a row retired via the ack tool is not counted pending by the lane summary', () => {
    // Simulate the lane query's row shape after stampActioned wrote acknowledged_at.
    const retiredRow = { ...ROW, acknowledged_at: NOW };
    const summary = summarizePendingLane([retiredRow], { nowMs: Date.parse(NOW) + 1000 });
    expect(summary.total).toBe(0);
    expect(summary.actionable).toBe(0);
  });

  it('two-sided: a row NOT yet retired (no acknowledged_at) IS counted pending', () => {
    const summary = summarizePendingLane([ROW], { nowMs: Date.parse(NOW) + 1000 });
    expect(summary.total).toBe(1);
  });
});

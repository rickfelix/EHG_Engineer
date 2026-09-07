/**
 * QF-20260907-369 — a transiently-deferred WORK_ASSIGNMENT (not_before gate, or a fitness-check
 * query failure) is legitimately seen and processed by directed-assignment.cjs EVERY checkin
 * tick, but neither branch calls ackWithReceipt (by design -- the row must keep re-surfacing
 * until it can genuinely be claimed or purged). For a normal (non-adam) worker, ackMessage is
 * the ONLY place read_at is ever written for a WORK_ASSIGNMENT row, and it always stamps
 * read_at+acknowledged_at TOGETHER -- so a row stuck in either transient state never got read_at
 * set at all, no matter how many times it was correctly seen and deferred (measured specimen:
 * QF-20260903-936's assignment, deferred to 2026-09-11, unread past 33+ minutes across multiple
 * checkins that all correctly deferred it -- controlled comparison run by the coordinator).
 *
 * Fix: stamp read_at ONLY (never acknowledged_at) the first time a transiently-deferred
 * assignment is seen, mirroring the DELIVERED-only idiom already used elsewhere in this module
 * (surfaceCoordinatorMessages, ackMessage's own adam-directive branch). The row still
 * re-surfaces and re-attempts every tick exactly as before -- this is a pure visibility fix.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { resolveCheckin } = require('../../../scripts/worker-checkin.cjs');

function fakeSb({ qfRow, sdRow = null, coordinationUpdates }) {
  return {
    rpc: () => Promise.resolve({ data: { success: true }, error: null }),
    from(table) {
      const filters = {};
      return {
        select() { return this; }, gte() { return this; },
        order() { return this; }, limit() { return this; }, is() { return this; },
        eq(col, val) { filters[col] = val; return this; },
        maybeSingle() {
          if (table === 'claude_sessions') return Promise.resolve({ data: { metadata: { role: 'worker' }, sd_key: null }, error: null });
          if (table === 'strategic_directives_v2') return Promise.resolve({ data: sdRow, error: null });
          if (table === 'quick_fixes') return Promise.resolve({ data: qfRow, error: null });
          return Promise.resolve({ data: null, error: null });
        },
        update(payload) {
          if (table === 'session_coordination') coordinationUpdates.push(payload);
          return { eq() { return Promise.resolve({ error: null }); } };
        },
      };
    },
  };
}

async function runWithAssignment({ qfRow, assignmentReadAt = null }) {
  const coordinationUpdates = [];
  const sb = fakeSb({ qfRow, coordinationUpdates });
  const ws = require('../../../lib/fleet/worker-status.cjs');
  const orig = ws.getMessagesForSession;
  ws.getMessagesForSession = async () => [
    { id: 'msg-deferred-1', message_type: 'WORK_ASSIGNMENT', payload: { assigned_sd: 'QF-DEFERRED-001' }, read_at: assignmentReadAt },
  ];
  try {
    const res = await resolveCheckin(sb, 'sess-worker-1', { getCoordinator: async () => null });
    return { res, coordinationUpdates };
  } finally {
    ws.getMessagesForSession = orig;
  }
}

describe('directed-assignment: transiently-deferred WORK_ASSIGNMENT gets a DELIVERED-only read_at stamp (QF-20260907-369)', () => {
  it('stamps read_at (never acknowledged_at) on a not_before-deferred QF assignment the FIRST time it is seen', async () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const { res, coordinationUpdates } = await runWithAssignment({ qfRow: { status: 'open', not_before: future } });

    expect(res.directed_lane_verdict?.outcome).toBe('deferred');
    expect(res.assignment_deferred_not_before?.not_before).toBe(future);

    expect(coordinationUpdates).toHaveLength(1);
    expect(coordinationUpdates[0]).toEqual({ read_at: expect.any(String) });
    expect(coordinationUpdates[0].acknowledged_at).toBeUndefined();
  });

  it('does NOT write again when the row already carries read_at -- idempotent, no redundant update', async () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const alreadyDelivered = new Date(Date.now() - 5000).toISOString();
    const { coordinationUpdates } = await runWithAssignment({ qfRow: { status: 'open', not_before: future }, assignmentReadAt: alreadyDelivered });

    expect(coordinationUpdates).toEqual([]);
  });
});

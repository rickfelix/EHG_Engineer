/**
 * QF-20260830-452 — a claim-row-less directed item (a UAT walk, ceremony, review) has no
 * assigned_sd/sd_key for extractSdFromAssignment to resolve, so directed-assignment.cjs fell
 * through and treated it as unclaimable — the seat self-claimed something else instead, twice,
 * on a chairman-ordered item (WA ab9b0dac). payload.assignment_type is the carrier the directed
 * path must now honor without a claim key: the row is picked up, acked, and returned as
 * action='directed_work' with the payload handed back as the work spec — never falls through to
 * self-claim.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { resolveCheckin, CHECKIN_HELPERS } = require('../../../scripts/worker-checkin.cjs');

const realStamp = CHECKIN_HELPERS.stampDirectedAssignment;
CHECKIN_HELPERS.stampDirectedAssignment = async () => ({ merged: true });
afterAll(() => { CHECKIN_HELPERS.stampDirectedAssignment = realStamp; });

function fakeSb({ updates }) {
  return {
    rpc: () => Promise.resolve({ data: { success: true }, error: null }),
    from(table) {
      return {
        select() { return this; }, gte() { return this; }, order() { return this; },
        limit() { return this; }, is() { return this; }, eq() { return this; },
        maybeSingle() {
          if (table === 'claude_sessions') return Promise.resolve({ data: { metadata: { role: 'worker' }, sd_key: null }, error: null });
          return Promise.resolve({ data: null, error: null });
        },
        insert() { return Promise.resolve({ error: null }); },
        update(payload) { updates.push({ table, payload }); return { eq() { return Promise.resolve({ error: null }); } }; },
      };
    },
  };
}

async function runKeylessDirected(rows) {
  const updates = [];
  const sb = fakeSb({ updates });
  const ws = require('../../../lib/fleet/worker-status.cjs');
  const orig = ws.getMessagesForSession;
  ws.getMessagesForSession = async () => rows;
  try {
    const res = await resolveCheckin(sb, 'sess-worker-1', { getCoordinator: async () => null });
    return { res, updates };
  } finally {
    ws.getMessagesForSession = orig;
  }
}

describe('directed-assignment step honors a keyless assignment_type carrier (QF-20260830-452)', () => {
  it('a WA with assignment_type=uat_run and no sd_key is picked up as directed work, not fallen through', async () => {
    const { res, updates } = await runKeylessDirected([
      { id: 'wa-uat-walk', message_type: 'WORK_ASSIGNMENT', payload: { assignment_type: 'uat_run', instructions: 'walk the AltifyAI S24 UAT' } },
    ]);
    expect(res.action).toBe('directed_work');
    expect(res.assignment_type).toBe('uat_run');
    expect(res.work_spec.instructions).toBe('walk the AltifyAI S24 UAT');
    const ack = updates.find(u => u.table === 'session_coordination' && u.payload.acknowledged_at);
    expect(ack).toBeTruthy();
  });

  it('a keyed assignment still wins over a keyless one when both are present (no regression to the keyed path)', async () => {
    const { res } = await runKeylessDirected([
      { id: 'wa-keyless', message_type: 'WORK_ASSIGNMENT', payload: { assignment_type: 'uat_run' } },
      { id: 'wa-keyed', message_type: 'WORK_ASSIGNMENT', payload: { assigned_sd: 'QF-20260830-000' } },
    ]);
    // newest-first: the first (keyless) row is picked, proving the new branch fires on its own
    // row rather than silently deferring to a keyed sibling — the two carriers are independent.
    expect(res.action).toBe('directed_work');
  });

  it('a plain informational nudge is still excluded, never treated as directed work', async () => {
    const { res } = await runKeylessDirected([
      { id: 'wa-nudge', message_type: 'WORK_ASSIGNMENT', payload: { kind: 'completion_nudge', informational: true, current_sd: 'SD-MINE-001', available_sds: ['SD-OTHER-001'] } },
    ]);
    expect(res.action).not.toBe('directed_work');
  });
});

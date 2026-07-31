/**
 * SD-LEO-INFRA-WORKER-ESCALATION-WRITE-001 (FR-1) — the WORK_ASSIGNMENT lane of the receipt contract.
 *
 * MEASURED BEFORE THE CHANGE: 116 WORK_ASSIGNMENT rows in the retention window, ZERO with
 * acknowledged_at, ZERO receipts on this lane. So the lane's answered-rate was not low — it was
 * UNWRITTEN, which reads identically to "no assignment was ever answered". That is the
 * unmeasured-versus-unanswered conflation this SD exists to remove, and it was the coordinator's own
 * first-hand finding: a fulfilled assignment goes unstamped even when the target seat claims AND
 * ships the assigned SD.
 *
 * These drive the REAL pipeline through resolveCheckin (same harness as
 * directed-assignment-marker-write.test.js) rather than calling the step in isolation, so a receipt
 * only appears if the production path actually emits one.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { resolveCheckin } = require('../../../scripts/worker-checkin.cjs');

/** Records every insert so the receipt can be asserted; otherwise mirrors the sibling harness. */
function fakeSb({ sdRow, assignedKey, inserts, insertError = null }) {
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
          if (table === 'strategic_directives_v2') {
            if (filters.sd_key !== assignedKey || !sdRow) return Promise.resolve({ data: null, error: null });
            return Promise.resolve({ data: structuredClone(sdRow), error: null });
          }
          return Promise.resolve({ data: null, error: null });
        },
        insert(row) {
          inserts.push({ table, row });
          return Promise.resolve({ error: table === 'coordination_receipts' ? insertError : null });
        },
        update() { return { eq() { return Promise.resolve({ error: null }); } }; },
      };
    },
  };
}

async function runDirected({ sdRow, assignedKey, insertError = null }) {
  const inserts = [];
  const sb = fakeSb({ sdRow, assignedKey, inserts, insertError });
  const ws = require('../../../lib/fleet/worker-status.cjs');
  const orig = ws.getMessagesForSession;
  ws.getMessagesForSession = async () => [
    {
      id: 'msg-wa-1',
      message_type: 'WORK_ASSIGNMENT',
      payload: { assigned_sd: assignedKey },
      created_at: new Date(Date.now() - 60_000).toISOString(),
    },
  ];
  try {
    const res = await resolveCheckin(sb, 'sess-worker-1', { getCoordinator: async () => null });
    return { res, receipts: inserts.filter((i) => i.table === 'coordination_receipts').map((i) => i.row) };
  } finally {
    ws.getMessagesForSession = orig;
  }
}

const SD_ROW = (key, status = 'in_progress') => ({
  status, sd_type: 'feature', sd_key: key, target_application: null, metadata: {},
});

describe('FR-1: a disposed WORK_ASSIGNMENT writes a receipt', () => {
  let receipts;
  beforeEach(() => { receipts = null; });

  it('a FULFILLED assignment records disposition=actioned on the work_assignment lane', async () => {
    const r = await runDirected({ assignedKey: 'SD-WA-001', sdRow: SD_ROW('SD-WA-001') });
    expect(r.res.action).toBe('claimed_assignment');
    expect(r.receipts).toHaveLength(1);
    expect(r.receipts[0]).toMatchObject({
      coordination_id: 'msg-wa-1',
      lane: 'work_assignment',
      state: 'disposed',
      disposition: 'actioned',
    });
    expect(r.receipts[0].metadata).toMatchObject({ sd: 'SD-WA-001', fulfilled: true });

    // MUTATION: revert the ack to a bare ackMessage -> zero receipts. That is the shipped state,
    // and it is what made 116 assignments read as never-answered.
  });

  it('captures time-to-answer, which the 24h retention delete makes unrecoverable later', async () => {
    const r = await runDirected({ assignedKey: 'SD-WA-002', sdRow: SD_ROW('SD-WA-002') });
    expect(r.receipts[0].source_age_ms).toBeGreaterThanOrEqual(59_000);

    // MUTATION: stop passing sourceCreatedAt -> null age. The row is deleted at created+24h, so
    // this number cannot be reconstructed afterwards at any price.
  });

  it('a NON-fulfilment disposal is recorded too, and distinguishably', async () => {
    // The helper must not be wired only on the happy path. A stale assignment whose target already
    // reached a terminal status is still a DISPOSAL — it just is not an answer, so it is recorded
    // as superseded rather than actioned. Collapsing these would inflate the answered-rate.
    const r = await runDirected({ assignedKey: 'SD-WA-003', sdRow: SD_ROW('SD-WA-003', 'completed') });
    expect(r.res.action).not.toBe('claimed_assignment');
    expect(r.receipts).toHaveLength(1);
    expect(r.receipts[0]).toMatchObject({ lane: 'work_assignment', state: 'disposed', disposition: 'superseded' });

    // MUTATION: wire only the claimed branch -> zero receipts here, and the lane silently reports
    // only successes, which is a worse metric than none.
  });

  it('a LEDGER failure never breaks the claim — measurement must not become an outage', async () => {
    const r = await runDirected({
      assignedKey: 'SD-WA-004', sdRow: SD_ROW('SD-WA-004'),
      insertError: { message: 'ledger down' },
    });
    expect(r.res.action).toBe('claimed_assignment');

    // MUTATION: make the receipt write fatal -> the claim fails and a worker loses real work to a
    // bookkeeping error.
  });
});

describe('FR-1: every ack branch in this step goes through the receipt helper', () => {
  it('no ack bypasses the recorder', async () => {
    // STRUCTURAL, and deliberately so. This file has four ack branches added over time by four
    // different SDs; four copies of a receipt call is four chances for a fifth branch to forget one
    // — which is exactly how this lane ended up half-wired. Exactly ONE raw ackMessage may exist:
    // the one INSIDE ackWithReceipt.
    const { readFileSync } = require('node:fs');
    const src = readFileSync(new URL('../../../lib/checkin/steps/directed-assignment.cjs', import.meta.url), 'utf8');
    const raw = (src.match(/await ackMessage\(sb, assignment\.id/g) || []).length;
    expect(raw, 'a raw ackMessage outside ackWithReceipt would dispose an assignment unrecorded').toBe(1);
    expect((src.match(/ackWithReceipt\(DISPOSITIONS\./g) || []).length).toBeGreaterThanOrEqual(4);
  });
});

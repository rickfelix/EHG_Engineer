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
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { resolveCheckin } = require('../../../scripts/worker-checkin.cjs');

/** Records every insert so the receipt can be asserted; otherwise mirrors the sibling harness. */
function fakeSb({ sdRow, assignedKey, inserts, insertError = null, ackError = null, role = 'worker' }) {
  return {
    rpc: () => Promise.resolve({ data: { success: true }, error: null }),
    from(table) {
      const filters = {};
      return {
        select() { return this; }, gte() { return this; },
        order() { return this; }, limit() { return this; }, is() { return this; },
        eq(col, val) { filters[col] = val; return this; },
        maybeSingle() {
          if (table === 'claude_sessions') return Promise.resolve({ data: { metadata: { role }, sd_key: null }, error: null });
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
        update(payload) {
          return {
            eq() {
              if (table === 'session_coordination') {
                inserts.push({ table: '__ack__', row: payload });
                return Promise.resolve({ error: ackError });
              }
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
  };
}

async function runDirected({ sdRow, assignedKey, insertError = null, ackError = null, role = 'worker' }) {
  const inserts = [];
  const sb = fakeSb({ sdRow, assignedKey, inserts, insertError, ackError, role });
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
    return {
      res,
      receipts: inserts.filter((i) => i.table === 'coordination_receipts').map((i) => i.row),
      acks: inserts.filter((i) => i.table === '__ack__').map((i) => i.row),
    };
  } finally {
    ws.getMessagesForSession = orig;
  }
}

const SD_ROW = (key, status = 'in_progress') => ({
  status, sd_type: 'feature', sd_key: key, target_application: null, metadata: {},
});

describe('FR-1: a disposed WORK_ASSIGNMENT writes a receipt', () => {
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

describe('FR-1: a receipt asserts the ack LANDED, not merely that it was attempted', () => {
  // Both cases below were PROVEN live by SECURITY against the real ackMessage before the fix:
  // a disposal receipt was written where no acknowledged_at existed. Because the row then stays
  // unacked, getMessagesForSession({unackedOnly}) re-selects it next tick and receipts AGAIN —
  // once per check-in, unbounded, with nothing deduping at the DB.

  it('a FAILED ack writes NO receipt', async () => {
    const r = await runDirected({
      assignedKey: 'SD-WA-005', sdRow: SD_ROW('SD-WA-005'),
      ackError: { message: 'update failed' },
    });
    expect(r.acks.length, 'the ack was attempted').toBeGreaterThan(0);
    expect(r.receipts, 'no acknowledged_at landed, so nothing was disposed').toHaveLength(0);

    // MUTATION: drop the `ack.acknowledged !== true` gate -> a receipt appears for an ack that
    // never happened, and repeats every tick. That was the shipped state.
  });

  it('an ADAM-role session, which stamps read_at ONLY by design, writes NO receipt', async () => {
    /**
     * The sharper half. ackMessage deliberately leaves acknowledged_at unset for an adam-role
     * directive — WORK_ASSIGNMENT always counts as a directive — so a receipt written off it records
     * DELIVERED as DISPOSED. That is verbatim the defect this SD exists to remove ("read_at meant
     * rendered on a screen and was read as answered"), reintroduced in the lane built to measure it.
     *
     * *** DRIVES THE STEP DIRECTLY, AND THE FIRST VERSION OF THIS TEST DID NOT — IT WAS VACUOUS. ***
     * Routed through resolveCheckin with role='adam' the pipeline returns action:'idle' and never
     * reaches this step at all: zero session_coordination updates, zero receipts. So "0 receipts"
     * passed because NOTHING RAN, and it survived a mutation that deleted the very gate it claimed
     * to test. Verified by probe before rewriting.
     *
     * That also bounds the defect honestly: it is NOT reachable through the normal check-in path,
     * because an adam session short-circuits earlier. The gate is defensive, and this test asserts
     * the unit that holds the behaviour rather than a path that cannot exercise it.
     */
    const { CHECKIN_HELPERS } = require('../../../scripts/worker-checkin.cjs');
    const step = require('../../../lib/checkin/steps/directed-assignment.cjs');

    const writes = [];
    const sb = {
      from(table) {
        return {
          select() { return this; }, eq() { return this; }, gte() { return this; },
          order() { return this; }, limit() { return this; }, is() { return this; },
          maybeSingle: async () => ({ data: null, error: null }),
          insert: async (row) => { writes.push({ table, row }); return { error: null }; },
          update(payload) { return { eq: async () => { writes.push({ table: '__upd__' + table, row: payload }); return { error: null }; } }; },
        };
      },
    };

    const assignment = {
      id: 'adv-adam-1', message_type: 'WORK_ASSIGNMENT',
      payload: { assigned_sd: 'QF-ADAM-PROBE' }, created_at: new Date().toISOString(),
    };
    const helpers = {
      ...CHECKIN_HELPERS,
      ws: { getMessagesForSession: async () => [assignment] },
      tryClaim: async () => ({ ok: true }),
      stampDirectedAssignment: async () => ({ merged: true }),
    };

    await step.run({ sb, sessionId: 'sess-adam', sessionRole: 'adam', helpers, base: {} });

    const acked = writes.filter((w) => w.table === '__upd__session_coordination' && w.row.acknowledged_at);
    const readOnly = writes.filter((w) => w.table === '__upd__session_coordination' && w.row.read_at && !w.row.acknowledged_at);
    const receipts = writes.filter((w) => w.table === 'coordination_receipts');

    expect(readOnly.length, 'the step must have run and stamped read_at — otherwise this test is vacuous').toBeGreaterThan(0);
    expect(acked, 'adam must not auto-acknowledge a directive').toHaveLength(0);
    expect(receipts, 'delivered is not disposed').toHaveLength(0);

    // MUTATION: drop the `ack.acknowledged !== true` gate -> a receipt appears for a read_at-only
    // stamp, recording delivery as an answer. Fails.
  });
});

describe('FR-1: every ack branch in this step goes through the receipt helper', () => {
  it('no ack bypasses the recorder', async () => {
    // STRUCTURAL, and deliberately so. This file has four ack branches added over time by four
    // different SDs; four copies of a receipt call is four chances for a fifth branch to forget one
    // — which is exactly how this lane ended up half-wired. Exactly ONE raw ackMessage may exist:
    // the one INSIDE ackWithReceipt.
    //
    // MATCHES ANY ARGUMENT FORM, and that widening is the fix for a real hole: the original regex
    // pinned the literal `ackMessage(sb, assignment.id`, so a fifth branch written as
    // `const { id } = assignment; await ackMessage(sb, id, …)` SURVIVED it — the exact scenario the
    // guard exists to prevent. A guard keyed to one spelling of the call is a guard on the spelling,
    // not on the invariant.
    const { readFileSync } = require('node:fs');
    const src = readFileSync(new URL('../../../lib/checkin/steps/directed-assignment.cjs', import.meta.url), 'utf8');
    const raw = (src.match(/ackMessage\(/g) || []).length;
    expect(raw, 'a raw ackMessage outside ackWithReceipt would dispose an assignment unrecorded').toBe(1);
    expect((src.match(/ackWithReceipt\(DISPOSITIONS\./g) || []).length).toBeGreaterThanOrEqual(4);
  });
});

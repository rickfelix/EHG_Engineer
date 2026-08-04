// SD-LEO-INFRA-DRIVE-LOOP-INSTRUMENT-001-E — TS-6 (no liveness gate) and TS-7 (direction).
import { describe, it, expect } from 'vitest';
import { findInboundOverdue, asStall } from '../../../lib/escalation/inbox-sla.js';

const ME = 'session-me';
const OTHER = 'session-other';
const PAST = new Date(Date.now() - 60_000).toISOString();

const replyNeeded = (over) => ({
  payload: { reply_class: 'reply-needed', reply_expected_by: PAST },
  ...over,
});

/**
 * Supabase stub that RECORDS its filters, so the test can assert WHICH column the direction
 * was expressed on — not merely that some rows came back. A stub that ignores .eq() would make
 * the sender and inbox directions indistinguishable, which is the exact confusion under test.
 */
function stub(rows) {
  const eqCalls = [];
  const chain = {
    select() { return chain; },
    eq(col, val) { eqCalls.push([col, val]); return chain; },
    then(res) {
      // Honour the recorded filter so direction actually affects the result set.
      const filtered = rows.filter((r) => eqCalls.every(([c, v]) => r[c] === v));
      return Promise.resolve({ data: filtered, error: null }).then(res);
    },
  };
  return { eqCalls, from() { return chain; } };
}

describe('TS-7 — DIRECTION: the watcher is INBOUND (recipient), not the sender sweep', () => {
  it('returns the row addressed TO me and NOT the row I sent', async () => {
    // THE DISCRIMINATING FIXTURE. Both rows are overdue and reply-needed; the ONLY difference is
    // direction. A sender-scoped implementation returns the wrong one and every other assertion
    // in this suite would still pass — the two sweeps share table, window, and predicate.
    const rows = [
      replyNeeded({ id: 'inbound', target_session: ME, sender_session: OTHER }),
      replyNeeded({ id: 'outbound', target_session: OTHER, sender_session: ME }),
    ];
    const { overdue } = await findInboundOverdue(stub(rows), ME);
    expect(overdue.map((r) => r.id)).toEqual(['inbound']);
  });

  it('the direction is expressed on target_session — asserted on the FILTER, not the result', async () => {
    // Pins the mechanism as well as the outcome. A future edit could get the right rows for the
    // wrong reason (e.g. filtering in memory); this fails if the column ever flips to sender.
    const s = stub([]);
    await findInboundOverdue(s, ME);
    expect(s.eqCalls).toContainEqual(['target_session', ME]);
    expect(s.eqCalls.map(([c]) => c)).not.toContain('sender_session');
  });

  it('rejects a missing sessionId rather than scanning everything', async () => {
    for (const bad of ['', '   ', null, undefined, 42]) {
      await expect(findInboundOverdue(stub([]), bad)).rejects.toThrow(TypeError);
    }
  });
});

describe('TS-6 — NO LIVENESS GATE: it fires when nothing is alive', () => {
  it('returns overdue rows with ZERO live sessions present', async () => {
    // The sibling watchdog's incident: Adam's loops were dead overnight, and a liveness gate
    // would have treated the WORST backlog condition as an exemption. The stub models no
    // heartbeat data at all — if the implementation consulted liveness it would have to query
    // something that is not here, and this test would break rather than silently pass.
    const rows = [replyNeeded({ id: 'inbound', target_session: ME, sender_session: OTHER })];
    const { overdue } = await findInboundOverdue(stub(rows), ME);
    expect(overdue.map((r) => r.id)).toEqual(['inbound']);
  });

  it('POSITIVE CONTROL — it also stays silent when nothing is overdue', async () => {
    // Without this the test above passes for a watcher that fires unconditionally, which would
    // be a different defect wearing the same green.
    const future = new Date(Date.now() + 3_600_000).toISOString();
    const rows = [{
      id: 'not-yet', target_session: ME, sender_session: OTHER,
      payload: { reply_class: 'reply-needed', reply_expected_by: future },
    }];
    const { overdue } = await findInboundOverdue(stub(rows), ME);
    expect(overdue).toHaveLength(0);
  });

  it('the single-fire dedup gate is honoured (already pinged => not re-surfaced)', async () => {
    const rows = [{
      id: 'pinged', target_session: ME, sender_session: OTHER,
      payload: { reply_class: 'reply-needed', reply_expected_by: PAST, ping_sent_at: PAST },
    }];
    const { overdue } = await findInboundOverdue(stub(rows), ME);
    expect(overdue).toHaveLength(0);
  });

  it('an answered row is not surfaced', async () => {
    const rows = [{
      id: 'answered', target_session: ME, sender_session: OTHER,
      payload: { reply_class: 'reply-needed', reply_expected_by: PAST, correlation_id: 'c-1' },
    }];
    const { overdue } = await findInboundOverdue(stub(rows), ME, {
      answeredCorrelationIds: new Set(['c-1']),
    });
    expect(overdue).toHaveLength(0);
  });
});

describe('asStall — shape adaptation for the ladder', () => {
  it('carries who asked and when it was due, so the x5 brief can be interrogative', async () => {
    const row = {
      id: 'r1', target_session: ME, sender_session: OTHER, subject: 'need a ruling',
      payload: { reply_expected_by: PAST },
    };
    const stall = asStall(row, 5);
    expect(stall).toMatchObject({
      id: 'r1', stall_type: 'inbox_sla', owner: ME, ticks: 5,
      asked_by: OTHER, subject: 'need a ruling', expected_by: PAST,
    });
  });
});

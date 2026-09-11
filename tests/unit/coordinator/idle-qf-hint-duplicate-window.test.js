// QF-20260905-498: dedupe on (target_session, body) within a 30-minute window.
//
// MEASURED: the QF-20260905-284 idle-absorb hint reached Alpha (a seat on coordinator
// stand-down) three times verbatim, 7 and 9 minutes apart. HINT_SEND_CAP (QF-20260808-782) is a
// LIFETIME cap of 3 per (qf, target) pair -- it hit exactly at the 3rd send in this incident, so
// it never engaged in time to stop the rapid-fire repeat itself. This is a complementary,
// faster-acting guard: the SAME body to the SAME target within the window is a duplicate,
// independent of how many lifetime sends the pair has left.
import { describe, it, expect } from 'vitest';
import { deliverHints, DUPLICATE_HINT_WINDOW_MS } from '../../../scripts/coordinator-idle-qf-hint.mjs';

const QF = { id: 'QF-TEST-001', title: 'a hintable quick fix', severity: 'medium' };
const WORKER = { session_id: 'sess-worker-1', metadata: {} };

const freshSummary = () => ({
  idleWorkers: 0, hinted: 0, skippedGated: 0, attempted: 0,
  undelivered: 0, undeliveredReasons: [], skippedCapped: 0, capUnknown: 0,
});

function makeInsert(sent) {
  return async (_sb, row) => { sent.push(row); return { data: { id: 'row-1' }, error: null }; };
}

const run = async ({ duplicateOf, unknown = false } = {}) => {
  const sent = [];
  const summary = freshSummary();
  await deliverHints([WORKER], [QF], {
    summary,
    supabase: {},
    coordinatorId: 'coord-1',
    dryRun: false,
    insertRow: makeInsert(sent),
    countPriorHints: async () => 0, // never capped, isolates the duplicate-window check
    findRecentDuplicate: async () => (unknown ? { unknown: true } : { duplicateOf: duplicateOf ?? null }),
  });
  return { sent, summary };
};

describe('QF-20260905-498 idle-qf-hint duplicate window', () => {
  it('SENDS a first-time hint — no prior duplicate found', async () => {
    const { sent, summary } = await run({ duplicateOf: null });
    expect(sent).toHaveLength(1);
    expect(summary.hinted).toBe(1);
    expect(summary.skippedDuplicate).toBe(0);
  });

  it('SKIPS and prints the prior row id when a duplicate is found within the window', async () => {
    const { sent, summary } = await run({ duplicateOf: 'row-abc123' });
    expect(sent).toHaveLength(0);
    expect(summary.hinted).toBe(0);
    expect(summary.skippedDuplicate).toBe(1);
  });

  it('does NOT count a duplicate-skipped pair as attempted', async () => {
    const { summary } = await run({ duplicateOf: 'row-abc123' });
    expect(summary.attempted).toBe(0);
    expect(summary.undelivered).toBe(0);
  });

  it('UNKNOWN is not zero: an unreadable duplicate check still sends, but is counted as blind', async () => {
    const { sent, summary } = await run({ unknown: true });
    expect(sent).toHaveLength(1);
    expect(summary.duplicateUnknown).toBe(1);
    expect(summary.skippedDuplicate).toBe(0);
  });

  it('leaves the QF available for ANOTHER worker when one is deduped', async () => {
    const sent = [];
    const summary = freshSummary();
    const seenBefore = { session_id: 'sess-seen-before', metadata: {} };
    const fresh = { session_id: 'sess-fresh', metadata: {} };
    await deliverHints([seenBefore, fresh], [QF], {
      summary, supabase: {}, coordinatorId: 'c', dryRun: false,
      insertRow: makeInsert(sent),
      countPriorHints: async () => 0,
      findRecentDuplicate: async (_sb, { targetSession }) =>
        (targetSession === 'sess-seen-before' ? { duplicateOf: 'row-1' } : { duplicateOf: null }),
    });
    expect(summary.skippedDuplicate).toBe(1);
    expect(sent).toHaveLength(1);
    expect(sent[0].target_session).toBe('sess-fresh');
  });

  it('does not consult the duplicate check in dry-run', async () => {
    let consulted = false;
    const summary = freshSummary();
    await deliverHints([WORKER], [QF], {
      summary, supabase: {}, coordinatorId: 'c', dryRun: true,
      insertRow: async () => { throw new Error('dry-run must not send'); },
      findRecentDuplicate: async () => { consulted = true; return { duplicateOf: 'row-1' }; },
    });
    expect(consulted).toBe(false);
    expect(summary.hinted).toBe(1);
  });

  it('the REAL default findRecentDuplicateHintDefault survives a supabase that throws, and still delivers', async () => {
    const sent = [];
    const summary = freshSummary();
    await deliverHints([WORKER], [QF], {
      summary, supabase: {}, coordinatorId: 'c', dryRun: false,
      insertRow: makeInsert(sent),
      countPriorHints: async () => 0,
      // No findRecentDuplicate injected — exercises the real default against a client with no .from().
    });
    expect(sent).toHaveLength(1);
    expect(summary.duplicateUnknown).toBe(1);
  });

  it('DUPLICATE_HINT_WINDOW_MS is 30 minutes', () => {
    expect(DUPLICATE_HINT_WINDOW_MS).toBe(30 * 60 * 1000);
  });

  it('the REAL default queries session_coordination scoped to (target_session, body, created_at>=window) and finds the prior row', async () => {
    const calls = [];
    const chain = {
      select: (...a) => { calls.push(['select', ...a]); return chain; },
      eq: (...a) => { calls.push(['eq', ...a]); return chain; },
      gte: (...a) => { calls.push(['gte', ...a]); return chain; },
      order: (...a) => { calls.push(['order', ...a]); return chain; },
      limit: (...a) => { calls.push(['limit', ...a]); return Promise.resolve({ data: [{ id: 'c50b0952' }], error: null }); },
    };
    const supabase = { from: (table) => { calls.push(['from', table]); return chain; } };
    const sent = [];
    const summary = freshSummary();
    await deliverHints([WORKER], [QF], {
      summary, supabase, coordinatorId: 'c', dryRun: false,
      insertRow: makeInsert(sent),
      countPriorHints: async () => 0,
    });
    expect(sent).toHaveLength(0);
    expect(summary.skippedDuplicate).toBe(1);
    expect(calls[0]).toEqual(['from', 'session_coordination']);
    expect(calls.some((c) => c[0] === 'eq' && c[1] === 'target_session' && c[2] === WORKER.session_id)).toBe(true);
    expect(calls.some((c) => c[0] === 'eq' && c[1] === 'body')).toBe(true);
    expect(calls.some((c) => c[0] === 'gte' && c[1] === 'created_at')).toBe(true);
  });
});

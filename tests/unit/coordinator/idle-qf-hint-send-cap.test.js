// QF-20260808-782: cap the idle-QF hint sender. THE DURABLE FIX, not the mitigation.
//
// MEASURED: 82 byte-identical hints for ONE qf to ONE seat in 5.7h (04:08–09:50), plus 12 and 2
// for two others — 96 of that seat's last 127 inbox rows. They buried a direct coordinator
// feedback request for 2h20m. The coordinator dropped the loop from its battery as IMMEDIATE
// MITIGATION; that is not a fix, and a reader who sees the symptom stopped will wrongly close this
// as already-done. The sender itself had no cap: `eligibleIdleWorkers` is pure over live state
// with "no persistence, no backoff and no memory of who was hinted" (its own comment).
//
// An unacked hint after 3 sends means the reader is not reading that lane. It does not mean the
// reader needs 79 more.
import { describe, it, expect } from 'vitest';
import { deliverHints, HINT_SEND_CAP } from '../../../scripts/coordinator-idle-qf-hint.mjs';

const QF = { id: 'QF-TEST-001', title: 'a hintable quick fix', severity: 'medium' };
const WORKER = { session_id: 'sess-worker-1', metadata: {} };

const freshSummary = () => ({
  idleWorkers: 0, hinted: 0, skippedGated: 0, attempted: 0,
  undelivered: 0, undeliveredReasons: [], skippedCapped: 0, capUnknown: 0,
});

/** Records every send so we can assert on what actually left. */
function makeInsert(sent) {
  return async (_sb, row) => { sent.push(row); return { data: { id: 'row-1' }, error: null }; };
}

const run = async ({ prior, dryRun = false }) => {
  const sent = [];
  const summary = freshSummary();
  await deliverHints([WORKER], [QF], {
    summary,
    supabase: {},
    coordinatorId: 'coord-1',
    dryRun,
    insertRow: makeInsert(sent),
    countPriorHints: async () => prior,
  });
  return { sent, summary };
};

describe('QF-782 idle-qf-hint send cap', () => {
  it('SENDS a first-time hint — the cap must not block fresh work', async () => {
    // Two-sided control. A cap that blocks everything passes every "it stopped" assertion below
    // while silently starving the belt of hints entirely.
    const { sent, summary } = await run({ prior: 0 });
    expect(sent).toHaveLength(1);
    expect(summary.hinted).toBe(1);
    expect(summary.attempted).toBe(1);
    expect(summary.skippedCapped).toBe(0);
  });

  it('still sends at one BELOW the cap', async () => {
    const { sent, summary } = await run({ prior: HINT_SEND_CAP - 1 });
    expect(sent).toHaveLength(1);
    expect(summary.skippedCapped).toBe(0);
  });

  it('STOPS at the cap — this is the 82x bug', async () => {
    const { sent, summary } = await run({ prior: HINT_SEND_CAP });
    expect(sent).toHaveLength(0);
    expect(summary.hinted).toBe(0);
    expect(summary.skippedCapped).toBe(1);
  });

  it('STOPS well past the cap (the 82nd send never happens)', async () => {
    const { sent, summary } = await run({ prior: 82 });
    expect(sent).toHaveLength(0);
    expect(summary.skippedCapped).toBe(1);
  });

  it('does NOT count a capped pair as attempted — the delivery ratio stays honest', async () => {
    // Counting it would inflate the denominator and make a WORKING cap read as degraded delivery,
    // which is how a correct guard gets reverted by whoever watches the ratio.
    const { summary } = await run({ prior: HINT_SEND_CAP });
    expect(summary.attempted).toBe(0);
    expect(summary.undelivered).toBe(0);
  });

  describe('UNKNOWN is not zero', () => {
    it('an unreadable count still sends, but is COUNTED as blind', async () => {
      // Treating unknown as 0 would silently re-uncap the sender: every tick looks like "first
      // hint" forever. Sending matches today's behaviour rather than starving the seat — but the
      // blindness has to be visible, or a cap that cannot see is indistinguishable from a cap
      // that saw nothing.
      const { sent, summary } = await run({ prior: null });
      expect(sent).toHaveLength(1);
      expect(summary.capUnknown).toBe(1);
      expect(summary.skippedCapped).toBe(0);
    });

    it('the REAL default survives a supabase that throws, and still delivers', async () => {
      // No countPriorHints injected — this exercises countPriorHintsDefault for real, against a
      // client with no .from(). FR-5 precedent: one unreachable addressee once starved every
      // worker later in the loop, so a broken count must not kill the sweep.
      const sent = [];
      const summary = freshSummary();
      await deliverHints([WORKER], [QF], {
        summary, supabase: {}, coordinatorId: 'c', dryRun: false, insertRow: makeInsert(sent),
      });
      expect(sent).toHaveLength(1);
      expect(summary.hinted).toBe(1);
      expect(summary.capUnknown).toBe(1);
    });
  });

  it('leaves the QF available for ANOTHER worker when one is capped', async () => {
    // The worker has heard enough; the WORK is still unhinted. Dropping it would silently reduce
    // supply — the same reasoning the existing throw/error paths use.
    const sent = [];
    const summary = freshSummary();
    const capped = { session_id: 'sess-capped', metadata: {} };
    const fresh = { session_id: 'sess-fresh', metadata: {} };
    await deliverHints([capped, fresh], [QF], {
      summary, supabase: {}, coordinatorId: 'c', dryRun: false,
      insertRow: makeInsert(sent),
      countPriorHints: async (_sb, { targetSession }) =>
        (targetSession === 'sess-capped' ? HINT_SEND_CAP : 0),
    });
    expect(summary.skippedCapped).toBe(1);
    expect(sent).toHaveLength(1);
    expect(sent[0].target_session).toBe('sess-fresh');
  });

  it('does not consult the counter in dry-run', async () => {
    let consulted = false;
    const summary = freshSummary();
    await deliverHints([WORKER], [QF], {
      summary, supabase: {}, coordinatorId: 'c', dryRun: true,
      insertRow: async () => { throw new Error('dry-run must not send'); },
      countPriorHints: async () => { consulted = true; return 99; },
    });
    expect(consulted).toBe(false);
    expect(summary.hinted).toBe(1);
  });
});

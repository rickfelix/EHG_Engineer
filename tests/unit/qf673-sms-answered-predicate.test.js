// QF-20260808-673: surface chairman inbound that was never ANSWERED.
//
// THE OLD PREDICATE (`drained_at IS NULL`) MISSES THE REAL MISS. `drained_at` means CONSUMED FROM
// STAGING BY THE DRAINER, not "the chairman got a reply" — the read_at-is-not-delivery class.
// Witnessed: chairman SMS b09ced65 arrived 19:22:00Z, auto-drained 19:24:05Z (~2 min), never
// answered. The row races the drainer and loses, so the next tick's `drained_at IS NULL` returns
// nothing while the chairman is still waiting.
//
// PREMISE CORRECTION recorded here because the ticket's acceptance criterion says otherwise: it
// asks to ADD a chairman-reply outbound store, claiming none exists. One is already in service —
// `sms_outbound_obligations`. The ad-hoc reply path proves it (chairman-sms-gate enqueues an
// obligation, dispatches, then reads that row back for status/provider_message_id). Measured live:
// 590 rows to the chairman number, 589 with `sent_at`. Nothing needed adding.
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { surfaceSmsInbound, SMS_ANSWER_WINDOW_MIN } from '../../scripts/adam-quiet-tick.mjs';

const CHAIR = '+15550001111';
const ago = (min) => new Date(Date.now() - min * 60_000).toISOString();

/**
 * Chainable fake that RECORDS the query it was asked to build.
 *
 * THE RECORDING IS NOT A CONVENIENCE — IT IS THE ONLY THING THAT MAKES THE CORE DEFECT VISIBLE.
 * My first version had every builder method return the same object and the same fixture, so
 * `.is('drained_at', null)` and `.gte('received_at', …)` were indistinguishable: reverting the fix
 * to the old blind predicate left all 9 tests GREEN. The suite was asserting the post-filter logic
 * (answered / signature / chairman) while being completely blind to the staging PREDICATE, which
 * is the actual bug. A test that cannot observe its subject proves the logic, not the behaviour.
 */
function makeSb({ staging = [], stagingError = null, outbound = [], outboundError = null }) {
  const calls = [];
  const chain = (table, result) => {
    const rec = (m) => (...args) => { calls.push({ table, m, args }); return o; };
    const o = {
      select: rec('select'), is: rec('is'), gte: rec('gte'), eq: rec('eq'),
      not: rec('not'), order: rec('order'), limit: rec('limit'),
      then: (res) => res(result),
    };
    return o;
  };
  const sb = {
    from(table) {
      calls.push({ table, m: 'from', args: [] });
      if (table === 'sms_relay_staging') return chain(table, { data: staging, error: stagingError });
      if (table === 'sms_outbound_obligations') return chain(table, { data: outbound, error: outboundError });
      throw new Error('unexpected table ' + table);
    },
  };
  sb.calls = calls;
  sb.used = (table, m, arg0) =>
    calls.some((c) => c.table === table && c.m === m && (arg0 === undefined || c.args[0] === arg0));
  return sb;
}

const inbound = (over = {}) => ({
  id: 'in-1', from_phone: CHAIR, body_raw: 'Are you still waiting on solomon?',
  signature_valid: true, received_at: ago(20), ...over,
});

describe('QF-673 chairman inbound is surfaced by ANSWERED, not by drained_at', () => {
  // Set per-test, not at collection time: assigning (and restoring) in the describe body runs
  // during collection, BEFORE any test executes — the env would already be restored by the time
  // the assertions ran, and the chairman-number filtering tests would be measuring nothing.
  const prev = process.env.CHAIRMAN_PHONE;
  beforeEach(() => { process.env.CHAIRMAN_PHONE = CHAIR; });
  afterAll(() => {
    if (prev === undefined) delete process.env.CHAIRMAN_PHONE;
    else process.env.CHAIRMAN_PHONE = prev;
  });

  it('QUERIES BY WINDOW AND NEVER BY drained_at — the core defect', async () => {
    // THE test. Everything else asserts post-filter logic and would stay green with the old
    // predicate restored (verified by mutation). Only this observes the query itself.
    const sb = makeSb({ staging: [inbound()], outbound: [] });
    await surfaceSmsInbound(sb);
    expect(sb.used('sms_relay_staging', 'gte', 'received_at')).toBe(true);
    expect(sb.used('sms_relay_staging', 'is', 'drained_at')).toBe(false);
  });

  // QF-20260823-384: resolved_at was never read by this query at all -- an explicitly-dispositioned
  // row kept re-firing the hard interrupt. Distinct from the drained_at assertion above: resolved_at
  // IS a safe gate (an explicit operator action), where drained_at is not (an automatic event).
  it('QUERIES resolved_at IS NULL — a terminal-resolved row must never re-surface', async () => {
    const sb = makeSb({ staging: [inbound()], outbound: [] });
    await surfaceSmsInbound(sb);
    expect(sb.used('sms_relay_staging', 'is', 'resolved_at')).toBe(true);
  });

  it('cross-references the ANSWERED signal in sms_outbound_obligations', async () => {
    // The store the ticket said did not exist. If this read is ever dropped, "answered" silently
    // becomes unknowable and the alarm degrades to the old always/never behaviour.
    const sb = makeSb({ staging: [inbound()], outbound: [] });
    await surfaceSmsInbound(sb);
    expect(sb.used('sms_outbound_obligations', 'from')).toBe(true);
    expect(sb.used('sms_outbound_obligations', 'not', 'sent_at')).toBe(true);
  });

  it('surfaces a DRAINED but UNANSWERED inbound — the witnessed miss', async () => {
    // This is the case the old predicate could not see: the drainer already consumed the row.
    // Nothing here mentions drained_at, which is the point.
    const r = await surfaceSmsInbound(makeSb({ staging: [inbound()], outbound: [] }));
    expect(r.count).toBe(1);
    expect(r.rows[0].id).toBe('in-1');
  });

  it('does NOT surface an inbound that WAS answered after it arrived', async () => {
    // Two-sided. Without this, an alarm that fires on every inbound forever would pass the test
    // above and be indistinguishable from a working one.
    const r = await surfaceSmsInbound(makeSb({
      staging: [inbound({ received_at: ago(20) })],
      outbound: [{ sent_at: ago(10) }], // reply AFTER the inbound
    }));
    expect(r.count).toBe(0);
  });

  it('a reply sent BEFORE the inbound does not count as answering it', async () => {
    // Ordering is the whole predicate: an earlier outbound cannot be a reply to a later inbound.
    const r = await surfaceSmsInbound(makeSb({
      staging: [inbound({ received_at: ago(20) })],
      outbound: [{ sent_at: ago(45) }],
    }));
    expect(r.count).toBe(1);
  });

  it('UNKNOWN IS NOT ANSWERED — an unreadable reply store still surfaces', async () => {
    // Resolving a failed read to "answered" would silence a chairman-facing alarm on a query
    // error, the worst direction to fail on this channel.
    const r = await surfaceSmsInbound(makeSb({
      staging: [inbound()], outboundError: { message: 'boom' },
    }));
    expect(r.count).toBe(1);
    expect(r.answeredUnknown).toBe(true);
  });

  it('LABELS rather than drops: an invalid-signature row still surfaces', async () => {
    const r = await surfaceSmsInbound(makeSb({
      staging: [inbound({ signature_valid: false })], outbound: [],
    }));
    expect(r.count).toBe(1);
    expect(r.rows[0].signatureValid).toBe(false);
  });

  it('LABELS rather than drops: a phone mismatch still surfaces (never hide on formatting)', async () => {
    const r = await surfaceSmsInbound(makeSb({
      staging: [inbound({ from_phone: '+19998887777' })], outbound: [],
    }));
    expect(r.count).toBe(1);
    expect(r.rows[0].isChairman).toBe(false);
  });

  it('count always equals rows.length — preserves the #6907 render invariant', async () => {
    // `sms=N` must reconcile against N surfaced lines; a count computed independently of the
    // filtered set is exactly the disagreement #6906 fixed.
    for (const outbound of [[], [{ sent_at: ago(1) }]]) {
      const r = await surfaceSmsInbound(makeSb({ staging: [inbound()], outbound }));
      expect(r.count).toBe(r.rows.length);
    }
  });

  it('the window is a real bound, not decoration', async () => {
    expect(SMS_ANSWER_WINDOW_MIN).toBeGreaterThanOrEqual(30);
    expect(SMS_ANSWER_WINDOW_MIN).toBeLessThanOrEqual(120);
  });

  it('a staging read error reports the error and surfaces nothing', async () => {
    const r = await surfaceSmsInbound(makeSb({ stagingError: { message: 'staging down' } }));
    expect(r.count).toBe(0);
    expect(r.error).toBe('staging down');
  });


});

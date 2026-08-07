/**
 * SD-LEO-INFRA-WORKER-ESCALATION-WRITE-001 FR-2 (acceptance half).
 *
 * The load-bearing property is NOT that the arithmetic is right — it is that the query refuses to
 * report a number the data cannot support. Every measurement defect this SD fixed had the same
 * shape: an absence silently rendered as a value (a head:true count against a missing table
 * returning null and reading as empty; a read-stamp on render reading as an answer; a survivor
 * table whose acked rows had been deleted reading as 0.05% answered).
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { computeAnsweredRate, answeredBySeat, evaluateAcceptance } = require('../../lib/coordination/answered-rate.cjs');

const sig = (id, createdAt, callsign = 'Delta') => ({ id, created_at: createdAt, sender_callsign: callsign });
const disposed = (id, isRetention = false) => ({ coordination_id: id, lane: 'signal', state: 'disposed', is_retention: isRetention });

describe('computeAnsweredRate', () => {
  it('computes the rate over measurable signals', () => {
    const r = computeAnsweredRate({
      signals: [sig('a', '2026-07-31T10:00:00Z'), sig('b', '2026-07-31T10:05:00Z')],
      receipts: [disposed('a')],
    });
    expect(r.rate).toBe(0.5);
    expect(r.verdict).toBe('MEASURED');
  });

  it('a RETENTION receipt is not an answer', () => {
    const r = computeAnsweredRate({
      signals: [sig('a', '2026-07-31T10:00:00Z')],
      receipts: [disposed('a', true)],
    });
    expect(r.answered).toBe(0);
  });

  it('a delivered/seen receipt is not an answer either — only disposed is', () => {
    const r = computeAnsweredRate({
      signals: [sig('a', '2026-07-31T10:00:00Z')],
      receipts: [{ coordination_id: 'a', lane: 'signal', state: 'seen', is_retention: false }],
    });
    expect(r.answered).toBe(0);
  });

  // ── the reason this module exists ────────────────────────────────────────────────────────────
  it('UNMEASURED IS NOT UNANSWERED: signals inside a coverage gap leave BOTH numerator and denominator', () => {
    // Real incident: the receipt writer merged as d00db0c974e while the coordinator's root was
    // behind it and a live .git/index.lock blocked the pull, so 13 acks between 15:27:44Z and
    // 15:46:51Z ran pre-fix code and wrote no receipt. Those answers happened; only the recording
    // was missing. A naive query would report them as 13 unanswered signals.
    const gaps = [{ from: '2026-07-31T15:27:44Z', to: '2026-07-31T15:46:51Z', reason: 'writer not deployed' }];
    const r = computeAnsweredRate({
      signals: [sig('in-gap', '2026-07-31T15:30:00Z'), sig('outside', '2026-07-31T16:00:00Z')],
      receipts: [disposed('outside')],
      coverageGaps: gaps,
    });
    expect(r.total).toBe(1);        // the gap signal is not counted against the rate
    expect(r.excluded).toBe(1);
    expect(r.rate).toBe(1);         // NOT 0.5 — the missing receipt was never measurable
  });

  it('returns UNKNOWN (null), never 0, when every signal falls in a coverage gap', () => {
    const r = computeAnsweredRate({
      signals: [sig('a', '2026-07-31T15:30:00Z')],
      receipts: [],
      coverageGaps: [{ from: '2026-07-31T15:00:00Z', to: '2026-07-31T16:00:00Z', reason: 'writer not deployed' }],
    });
    expect(r.rate).toBe(null);
    expect(r.rate).not.toBe(0);
    expect(r.verdict).toBe('UNKNOWN_ALL_SIGNALS_IN_COVERAGE_GAP');
  });

  it('an empty window is UNKNOWN, not a perfect score', () => {
    const r = computeAnsweredRate({ signals: [], receipts: [] });
    expect(r.rate).toBe(null);
    expect(r.verdict).toBe('UNKNOWN_NO_SIGNALS_IN_WINDOW');
  });

  it('is TOTAL on junk input', () => {
    expect(computeAnsweredRate().rate).toBe(null);
    expect(computeAnsweredRate({ signals: null, receipts: null }).rate).toBe(null);
  });
});

describe('answeredBySeat groups by callsign, not by ephemeral session id', () => {
  it('aggregates a seat across its many session ids', () => {
    const { seats } = answeredBySeat({
      signals: [sig('a', '2026-07-31T10:00:00Z', 'Delta'), sig('b', '2026-07-31T10:01:00Z', 'Delta'), sig('c', '2026-07-31T10:02:00Z', 'Bravo')],
      receipts: [disposed('a')],
    });
    const delta = seats.find((s) => s.seat === 'Delta');
    expect(delta).toEqual({ seat: 'Delta', sent: 2, answered: 1 });
    expect(seats.find((s) => s.seat === 'Bravo').answered).toBe(0);
  });
});

describe('evaluateAcceptance', () => {
  const many = (n, prefix, callsign, from) =>
    Array.from({ length: n }, (_, i) => sig(`${prefix}${i}`, from, callsign));

  it('UNKNOWN FAILS — a criterion must never pass because nothing could be measured', () => {
    const r = evaluateAcceptance({ signals: [], receipts: [] });
    expect(r.pass).toBe(false);
    expect(r.reason).toBe('UNKNOWN_NO_SIGNALS_IN_WINDOW');
  });

  it('fails below the floor', () => {
    const signals = many(10, 's', 'Delta', '2026-07-31T10:00:00Z');
    const receipts = signals.slice(0, 5).map((s) => disposed(s.id));
    expect(evaluateAcceptance({ signals, receipts }).reason).toBe('BELOW_FLOOR');
  });

  it('fails when a seat sits at zero even if the overall floor is met', () => {
    const delta = many(20, 'd', 'Delta', '2026-07-31T10:00:00Z');
    const bravo = many(5, 'b', 'Bravo', '2026-07-31T10:00:00Z');
    const receipts = delta.map((s) => disposed(s.id)); // Bravo answered zero times
    const r = evaluateAcceptance({ signals: [...delta, ...bravo], receipts });
    expect(r.rate).toBe(0.8);
    expect(r.zeroSeats).toEqual(['Bravo']);
    expect(r.pass).toBe(false);
  });

  it('ignores a seat with too few signals for a zero to mean anything', () => {
    const delta = many(20, 'd', 'Delta', '2026-07-31T10:00:00Z');
    const newbie = many(2, 'n', 'Echo', '2026-07-31T10:00:00Z');
    const receipts = delta.map((s) => disposed(s.id));
    const r = evaluateAcceptance({ signals: [...delta, ...newbie], receipts }, { floor: 0.9, minSent: 5 });
    expect(r.zeroSeats).toEqual([]);
  });

  it('passes only when the floor is met AND no seat is at zero', () => {
    const delta = many(10, 'd', 'Delta', '2026-07-31T10:00:00Z');
    const bravo = many(10, 'b', 'Bravo', '2026-07-31T10:00:00Z');
    const receipts = [...delta, ...bravo].map((s) => disposed(s.id));
    expect(evaluateAcceptance({ signals: [...delta, ...bravo], receipts })).toMatchObject({ pass: true, reason: 'PASS', rate: 1 });
  });
});

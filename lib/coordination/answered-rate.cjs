/**
 * SD-LEO-INFRA-WORKER-ESCALATION-WRITE-001 (FR-2, acceptance half) — compute the answered rate
 * from the DURABLE ledger, and refuse to report a number the data cannot support.
 *
 * READ THE LEDGER, NEVER session_coordination. cleanup_expired_coordination() deletes ACKED rows at
 * created+24h while UNACKED rows persist, so a survivor-table rate measures the deletion policy
 * rather than anyone's conduct. Measured 2026-07-31: 0 of 31 acked rows survived 24h against 1,930
 * unacked that did; to DISPLAY 60% there the true rate would have to be 98.6%.
 *
 * ── THE DISTINCTION THIS MODULE EXISTS TO PROTECT ──────────────────────────────────────────────
 * UNMEASURED IS NOT UNANSWERED. A window in which the writer was not deployed produces zero
 * receipts — identical, to a naive query, to a window in which nobody answered anything. Reporting
 * the first as the second manufactures a damning number out of a deployment gap.
 *
 * This is not hypothetical. The receipt writer merged to origin/main as d00db0c974e while the
 * coordinator's root was still behind it and a live .git/index.lock blocked the pull, so THIRTEEN
 * acks between 15:27:44Z and 15:46:51Z on 2026-07-31 ran pre-fix code and wrote no receipt. Those
 * acks happened. The answers were real. Only the recording was missing.
 *
 * It is also the same shape as the two other measurement defects this SD already fixed: a head:true
 * count against a missing table returns null and reads as an empty table; a read-stamp on render
 * read as an answer. In every case an absence was silently rendered as a value. So this module
 * returns UNKNOWN rather than 0 whenever coverage cannot be established, exactly as
 * countFailedRuns does for CI.
 *
 * CommonJS to match lib/coordination/receipt-ledger.cjs.
 */

'use strict';

/**
 * PURE/TOTAL. Compute the answered rate over receipts, excluding retention stamps and any window
 * the writer was not deployed for.
 *
 * @param {object} input
 * @param {Array<object>} input.receipts  ledger rows: { coordination_id, lane, state, is_retention, created_at }
 * @param {Array<object>} input.signals   the population that SHOULD have receipts: { id, created_at, severity }
 * @param {Array<{from:string,to:string,reason:string}>} [input.coverageGaps] windows with no writer deployed
 * @returns {{answered:number|null, total:number, rate:number|null, excluded:number, gaps:Array, verdict:string}}
 *
 * rate is null — never 0 — when no signal in the window is measurable. `verdict` names why, so a
 * caller cannot render UNKNOWN as a healthy zero by accident.
 */
function computeAnsweredRate(input = {}) {
  const receipts = Array.isArray(input.receipts) ? input.receipts : [];
  const signals = Array.isArray(input.signals) ? input.signals : [];
  const gaps = Array.isArray(input.coverageGaps) ? input.coverageGaps : [];

  const inGap = (iso) => {
    if (!iso) return false;
    const t = Date.parse(/Z$|[+-]\d{2}:?\d{2}$/.test(String(iso)) ? iso : iso + 'Z');
    if (!Number.isFinite(t)) return false;
    return gaps.some((g) => {
      const from = Date.parse(g.from);
      const to = g.to ? Date.parse(g.to) : Infinity;
      return t >= from && t <= to;
    });
  };

  // A signal raised inside a coverage gap is UNMEASURABLE, not unanswered — drop it from BOTH
  // numerator and denominator rather than counting it as a miss.
  const measurable = signals.filter((s) => !inGap(s && s.created_at));
  const excluded = signals.length - measurable.length;

  if (measurable.length === 0) {
    return {
      answered: null,
      total: 0,
      rate: null,
      excluded,
      gaps,
      verdict: excluded > 0 ? 'UNKNOWN_ALL_SIGNALS_IN_COVERAGE_GAP' : 'UNKNOWN_NO_SIGNALS_IN_WINDOW',
    };
  }

  // A retention stamp is not an answer (FR-7). Counting it would let flood control improve the very
  // gauge that exists to notice nobody replied.
  const answeredIds = new Set(
    receipts
      .filter((r) => r && r.state === 'disposed' && r.is_retention !== true)
      .map((r) => r.coordination_id)
  );
  const answered = measurable.filter((s) => answeredIds.has(s && s.id)).length;

  return {
    answered,
    total: measurable.length,
    rate: answered / measurable.length,
    excluded,
    gaps,
    verdict: 'MEASURED',
  };
}

/**
 * PURE/TOTAL. Per-seat answered counts, so "NO SEAT AT ZERO" is checkable.
 *
 * Grouped by payload.sender_callsign, NOT sender_session: sender_session is an ephemeral UUID, so
 * grouping on it inflates the seat count (36 apparent seats vs 8 real ones) and lets a seat that
 * sent its first signals near the window edge show a structurally-fixed zero.
 */
function answeredBySeat(input = {}) {
  const { receipts = [], signals = [], coverageGaps = [] } = input;
  const { verdict } = computeAnsweredRate({ receipts, signals, coverageGaps });
  const answeredIds = new Set(
    (receipts || []).filter((r) => r && r.state === 'disposed' && r.is_retention !== true).map((r) => r.coordination_id)
  );
  const bySeat = new Map();
  for (const s of signals || []) {
    // READS BOTH SHAPES, because the docblock above and the code disagreed and the DATA sides with
    // the docblock. Live session_coordination rows carry sender_callsign INSIDE payload — there is
    // no top-level column of that name (verified: "column session_coordination.sender_callsign does
    // not exist"). So a caller passing raw DB rows bucketed EVERY seat as 'unknown', collapsing the
    // per-seat breakdown to one row and making "NO SEAT AT ZERO" unfalsifiable — while still
    // returning a confident-looking number. Found while wiring the first production reader; it could
    // not surface earlier because the only caller was a test supplying the flattened shape.
    const seat = (s && (s.sender_callsign ?? (s.payload && s.payload.sender_callsign))) || 'unknown';
    const cur = bySeat.get(seat) || { seat, sent: 0, answered: 0 };
    cur.sent += 1;
    if (answeredIds.has(s && s.id)) cur.answered += 1;
    bySeat.set(seat, cur);
  }
  return { seats: [...bySeat.values()].sort((a, b) => b.sent - a.sent), verdict };
}

/**
 * PURE/TOTAL. Apply the SD's acceptance thresholds.
 *
 * An UNKNOWN rate FAILS rather than passes. A criterion that passes because nothing could be
 * measured is exactly the false-green this SD exists to remove — the same reason coordinator-ack-
 * signal.cjs running without error was rejected as evidence that signals get answered.
 *
 * minSent guards the seat rule: a seat with fewer than that many signals in the window has too
 * little data for a zero to mean anything.
 */
function evaluateAcceptance(input = {}, { floor = 0.85, minSent = 5 } = {}) {
  const rate = computeAnsweredRate(input);
  const { seats } = answeredBySeat(input);
  const zeroSeats = seats.filter((s) => s.sent >= minSent && s.answered === 0).map((s) => s.seat);

  if (rate.rate === null) {
    return { pass: false, reason: rate.verdict, rate: null, floor, zeroSeats, excluded: rate.excluded };
  }
  const meetsFloor = rate.rate >= floor;
  return {
    pass: meetsFloor && zeroSeats.length === 0,
    reason: !meetsFloor ? 'BELOW_FLOOR' : zeroSeats.length ? 'SEAT_AT_ZERO' : 'PASS',
    rate: rate.rate,
    floor,
    zeroSeats,
    excluded: rate.excluded,
  };
}

module.exports = { computeAnsweredRate, answeredBySeat, evaluateAcceptance };

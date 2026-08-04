/**
 * FLEET HEALTH VERDICT — SD-LEO-INFRA-FLEET-HEALTH-VERDICT-001.
 *
 * THE VERDICT USED TO BE SATISFIED BY THE CONDITION IT SHOULD REPORT. scripts/fleet-dashboard.cjs
 * counted sessions passing a heartbeat-led OR and called >=3 of them HEALTHY. Heartbeats do not stop
 * when a seat freezes, exits its loop, or misses an armed wake, so THREE STALLED SEATS — exactly the
 * threshold — were by themselves sufficient to print FLEET HEALTH [OK]. That is not hypothetical:
 * operator escalations about stalled seats coexisted with [OK] for an afternoon, and the contradicting
 * number was already on screen (the stale count printed directly beneath the verdict).
 *
 * WHY THIS IS A SEPARATE MODULE: the fix must be exercisable without a database. Every `.db.test.js`
 * in this repo silently SKIPS, so a suite that needed live rows would report green having executed
 * nothing — the same silent-false-negative class this SD exists to remove.
 *
 * SCOPE LIMIT, CARRIED FORWARD DELIBERATELY (lib/fleet/stuck-seat-predicate.cjs:32): this is a
 * LIVENESS GAUGE, NOT A TAMPER-EVIDENT CONTROL. Both columns it reads are writable by the seat being
 * judged. The threat model is an ACCIDENT — a wedged worker — and a wedged worker is by definition not
 * writing. A fix that advertised a repaired verdict while dropping this caveat would let a reader trust
 * the dashboard more than it earns, which is precisely how the broken verdict came to be believed.
 */

'use strict';

const { classifySeat, VERDICT } = require('./stuck-seat-predicate.cjs');

/**
 * Four-valued health. UNKNOWN is first-class and is NOT a flavour of DOWN: DOWN is a measured claim
 * that no seat is working, UNKNOWN is the admission that the gauge could not measure. Collapsing them
 * would page an operator for an instrument outage, and the reverse (collapsing into HEALTHY) is the
 * defect this module exists to remove.
 */
const HEALTH = Object.freeze({ HEALTHY: 'HEALTHY', DEGRADED: 'DEGRADED', DOWN: 'DOWN', UNKNOWN: 'UNKNOWN' });

/** Exact exclusion reasons. Tests pin these strings, not their truthiness — a truthy assertion cannot
 *  tell "excluded by the rule under test" from "excluded by an earlier guard". */
const EXCLUDED = Object.freeze({
  LOOP_EXITED: 'loop_exited',
  NO_LIVENESS_ROW: 'no_liveness_row',
  TOOL_SILENT: 'tool_silent_past_cut_point',
  NO_TOOL_CLOCK: 'last_tool_at_never_written'
});

/**
 * Decide whether ONE session counts toward fleet health.
 *
 * @param {object} session   - a v_active_sessions row (carries loop_state; NOT last_tool_at).
 * @param {object|undefined} liveness - the matching claude_sessions row (last_tool_at, metadata).
 * @param {object} opts - { cutPointMinutes, now }
 * @returns {{live: boolean, reason: string|null}}
 */
function countsAsLive(session, liveness, opts) {
  // RULE 1 IS CATEGORICAL AND IS CHECKED FIRST SO NOTHING CAN RESCUE IT. An exited loop is
  // unambiguous — the seat said so itself. Specimen e3610a71 was counted active purely because its
  // heartbeat was 11 seconds old while its loop had exited and its tools had been silent 152 minutes.
  // Ordering matters: were this checked after classification, a seat that exited moments after a tool
  // call would classify HEALTHY and be counted, which is the bug wearing a new hat.
  if (session && session.loop_state === 'exited') {
    return { live: false, reason: EXCLUDED.LOOP_EXITED };
  }

  // A seat with no liveness row cannot be classified. NOT COUNTING IT IS THE POINT: a seat whose
  // liveness could not be established is in the same epistemic position as a frozen one, and the
  // present defect IS a category that should not count being counted. Whether this is a per-seat gap
  // or a total instrument failure is decided by the caller, which can see the whole population.
  if (!liveness) {
    return { live: false, reason: EXCLUDED.NO_LIVENESS_ROW };
  }

  const seat = classifySeat(liveness, { cutPointMinutes: opts.cutPointMinutes, now: opts.now });

  // NO WAKE-OVERDUE EXCLUSION, AND THE REASON IS MEASURED RATHER THAN ASSUMED. This module briefly
  // excluded seats sitting past their own armed wake deadline; the live fleet falsified that within
  // minutes. expected_wake_at is written when a wakeup is ARMED and is never cleared when the session
  // actually wakes, so "overdue" is the STEADY STATE OF A WORKING SEAT: measured 2026-08-04, seat
  // 28303922 read 504 minutes overdue with a 3-minute-old tool clock, and e3610a71 read 14 minutes
  // overdue while executing the tool call that took the measurement. Four of seven claimed seats were
  // excluded, at least three of them demonstrably working.
  // THE POINT GENERALISES, AND IT IS THIS SD'S OWN THESIS TURNED ON ITS AUTHOR: a field that does not
  // stop meaning something when the seat is fine cannot testify that the seat is broken. That is
  // exactly the heartbeat's failure, reproduced one field over by the fix written to repair it.
  // classifySeat returns `wake` as a DIAGNOSTIC and deliberately does not verdict on it; that judgement
  // is restored here rather than overridden.

  // UNKNOWN MUST NOT BECOME THE NEW COUNTS-AS-HEALTHY. classifySeat returns THREE verdicts and only
  // one of them is evidence of work. last_tool_at has documented silent-loss paths, so folding UNKNOWN
  // into the healthy tally would let the blindest seats score cleanest — and it would look like an
  // improvement while doing it, because the health number would rise.
  if (seat.verdict === VERDICT.STUCK) return { live: false, reason: EXCLUDED.TOOL_SILENT };
  if (seat.verdict === VERDICT.UNKNOWN) return { live: false, reason: EXCLUDED.NO_TOOL_CLOCK };
  return { live: true, reason: null };
}

/**
 * Compute the fleet health verdict over a population.
 *
 * @param {object} args
 * @param {Array<object>} args.sessions        - claimed sessions (the old activeSessions population).
 * @param {Array<object>} args.livenessRows    - claude_sessions rows from fetchPopulation().
 * @param {boolean} args.truncated             - fetchPopulation's truncation flag.
 * @param {number} args.cutPointMinutes

 * @param {number|Date} [args.now]
 * @returns {{verdict: string, live: number, evaluated: number, excluded: Array, blindReason: string|null}}
 */
function computeHealthVerdict(args) {
  const sessions = args.sessions || [];
  const index = new Map();
  for (const row of args.livenessRows || []) {
    if (row && row.session_id) index.set(row.session_id, row);
  }

  const excluded = [];
  let live = 0;
  for (const s of sessions) {
    const r = countsAsLive(s, index.get(s.session_id), {
      cutPointMinutes: args.cutPointMinutes,
      now: args.now
    });
    if (r.live) live++;
    else excluded.push({ session_id: s.session_id, reason: r.reason });
  }

  // INSTRUMENT BLINDNESS IS NOT A FLEET STATE, AND THIS IS THE FAILURE MODE THE PRD DID NOT ANTICIPATE.
  // v_active_sessions does not expose last_tool_at at all (measured, not assumed), so liveness arrives
  // by joining a second query. If that join is truncated, or if it matched NOTHING while seats exist,
  // then every seat classifies unclassifiable and a naive count would report DOWN across a possibly
  // healthy fleet — the original defect inverted, and far louder. Reporting UNKNOWN says what is true:
  // the gauge could not measure. A verdict that cannot fail toward alarm is as useless as one that
  // cannot fail toward alert.
  let blindReason = null;
  if (args.truncated) {
    blindReason = 'liveness_population_truncated';
  } else if (sessions.length > 0 && excluded.length === sessions.length &&
             excluded.every((e) => e.reason === EXCLUDED.NO_LIVENESS_ROW)) {
    blindReason = 'liveness_join_matched_nothing';
  }
  if (blindReason) {
    return { verdict: HEALTH.UNKNOWN, live, evaluated: sessions.length, excluded, blindReason };
  }

  const verdict = live >= 3 ? HEALTH.HEALTHY : live >= 1 ? HEALTH.DEGRADED : HEALTH.DOWN;
  return { verdict, live, evaluated: sessions.length, excluded, blindReason: null };
}

module.exports = { computeHealthVerdict, countsAsLive, HEALTH, EXCLUDED };

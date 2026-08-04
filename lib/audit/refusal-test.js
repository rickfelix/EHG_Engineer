/**
 * LIFETIME-REFUSAL TEST — SD-LEO-INFRA-NORMATIVE-SIGNAL-AUDIT-001, FR-1/FR-2.
 *
 * A GAUGE THAT HAS NEVER REFUSED ANYTHING GRADES NOTHING. Proving that is harder than it looks, and
 * getting it wrong MANUFACTURES THE DEFECT THIS AUDIT EXISTS TO FIND — a confident false verdict
 * about whether a signal can fail. Both mistakes below were made for real during this SD's LEAD
 * phase, against live data, and are seeded as tests rather than described:
 *
 *   1. DISTINCT-VALUES-IN-A-SAMPLE. Reading a 1000-row unordered page and counting distinct verdict
 *      values reported sub_agent_execution_results as "never discriminated". Its actual distribution
 *      is PASS 23243, CONDITIONAL_PASS 1445, WARNING 586, FAIL 226, BLOCKED 1198. The page happened
 *      to be all BLOCKED. Nothing about the output looked wrong.
 *
 *   2. EXACT COUNTS OVER A SAMPLED DOMAIN — the half-fix, and the more dangerous one. Switching to
 *      exact per-value counts fixed the COUNTING and left the value ENUMERATION sampled, so the same
 *      gauge produced the SAME false verdict from arithmetic that was now individually correct.
 *      TWO SAMPLING SURFACES: closing one leaves the other, and the second is invisible precisely
 *      because the first was fixed.
 *
 * So the verdict is withheld unless the enumerated counts RECONCILE against an exact total. An
 * unreconciled population yields REFUSED — not a caveated NEVER_REFUSED, because a caveat attached to
 * a plausible verdict is dropped on the second reading and the verdict survives.
 *
 * UNMEASURABLE IS A VERDICT, NOT AN OMISSION (FR-2). A guard that declines to judge a small-n gauge
 * and then drops it from the report has folded it into CLEAR by absence — the exact invariant
 * lib/governance/drive-state/contract.cjs exists to enforce ("a probe that reports CLEAR for an axis
 * it cannot see is the exact defect"). That bug was independently reinvented here once already.
 */

'use strict';

/**
 * Verdicts. UNMEASURABLE and REFUSED are first-class outcomes and are always reported: a gauge
 * missing from the output is indistinguishable from one never considered.
 */
const VERDICT = Object.freeze({
  DISCRIMINATES: 'DISCRIMINATES',
  NEVER_REFUSED: 'NEVER_REFUSED',
  UNMEASURABLE: 'UNMEASURABLE',
  REFUSED: 'REFUSED',
  ABSENT: 'ABSENT',
});

/** Below this, a gauge has not had enough opportunities to refuse for silence to mean anything. */
const MIN_N = 20;

/**
 * Judge one gauge from an already-collected tally.
 *
 * The caller supplies exact counts keyed by verdict value AND the exact row total, because this
 * module deliberately does not fetch: the fetching is where both historical failures happened, so
 * the reconciliation is enforced here on whatever the caller managed to collect.
 *
 * @param {object} args
 * @param {string} args.gauge
 * @param {string|null} args.column - the verdict-shaped column, or null if none was found
 * @param {Record<string, number>|null} args.counts - exact count per enumerated value
 * @param {number|null} args.total - exact row count, or null if the object is absent
 * @param {string} [args.reader] - the code path that consumes this gauge
 * @returns {{gauge, verdict, reason, ...}}
 */
function judgeGauge(args) {
  const { gauge, column, counts, total, reader } = args;

  // ABSENT and EMPTY are different, and a head-count cannot tell them apart: select(count:'exact',
  // head:true) on a MISSING table returns count=null with NO error. Reporting that null as 0 would
  // read as "exists and has never fired" — a false verdict of this audit's own class.
  if (total === null || total === undefined) {
    return { gauge, verdict: VERDICT.ABSENT, reason: 'object does not exist (null count is absence, not zero)', reader };
  }

  if (!column) {
    return {
      gauge, verdict: VERDICT.UNMEASURABLE,
      reason: 'no verdict-shaped column; grading path must be traced by READER, not by column name',
      total, reader,
    };
  }

  const enumerated = Object.values(counts || {}).reduce((a, b) => a + (Number(b) || 0), 0);

  // THE RECONCILIATION. Checked BEFORE the n-threshold, because an unreconciled tally cannot support
  // any verdict — including "too small to judge", which would itself be a claim about the population.
  if (enumerated !== total) {
    return {
      gauge, verdict: VERDICT.REFUSED, column, total, enumerated, counts,
      reason: 'enumerated ' + enumerated + ' of ' + total + ' rows — the value domain was sampled, not '
        + 'enumerated, so no verdict about refusal is supportable. Enumerate from the database.',
      reader,
    };
  }

  if (total < MIN_N) {
    // Reported, never omitted. Note this fires even when the gauge visibly discriminates: with too
    // few observations, "it refuses" is as unsupported as "it never refuses".
    return {
      gauge, verdict: VERDICT.UNMEASURABLE, column, total, counts,
      reason: 'n=' + total + ' < ' + MIN_N + ' — too few opportunities to refuse for silence to carry meaning',
      reader,
    };
  }

  const distinct = Object.values(counts).filter((c) => Number(c) > 0).length;
  return distinct > 1
    ? { gauge, verdict: VERDICT.DISCRIMINATES, column, total, counts, reason: 'observed ' + distinct + ' distinct outcomes', reader }
    : { gauge, verdict: VERDICT.NEVER_REFUSED, column, total, counts, reason: 'every one of ' + total + ' rows carries the same outcome — this gauge grades nothing', reader };
}

/**
 * Summarise a run. THE COUNT IS PART OF THE DELIVERABLE, and every judged gauge appears — the audit's
 * own denominator is meaningless if the report silently drops what it could not judge.
 */
function summarise(results) {
  const by = {};
  for (const r of results) by[r.verdict] = (by[r.verdict] || 0) + 1;
  const judged = results.length;
  return {
    population: judged,
    by_verdict: by,
    // Surfaced explicitly rather than left to be noticed: these are the gauges the audit could not
    // speak to, and their count is the honest limit of its coverage.
    unspoken: (by[VERDICT.UNMEASURABLE] || 0) + (by[VERDICT.REFUSED] || 0) + (by[VERDICT.ABSENT] || 0),
    grades_nothing: by[VERDICT.NEVER_REFUSED] || 0,
  };
}

module.exports = { judgeGauge, summarise, VERDICT, MIN_N };

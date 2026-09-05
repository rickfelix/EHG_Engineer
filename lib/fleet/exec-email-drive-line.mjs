// exec-email-drive-line.mjs
// SD-FDBK-INFRA-ENCODE-DRIVE-SIX-GOAL-001 — the chairman-facing per-leg drive-score breakdown
// line, shared VERBATIM by the two chairman surfaces that render a drive number in one morning:
// the chairman morning-brief SMS (scripts/cron/chairman-morning-review-sweep.mjs) and the chairman
// exec-summary email (scripts/adam-exec-summary.mjs). ONE query, ONE per-leg conversion, ONE call
// into the formatter — so the two surfaces structurally CANNOT disagree about which row is "the
// current score" in one morning (they are not two implementations that happen to agree; they are
// the same implementation, called twice). Mirrors the existing exec-email-* modules in this
// directory (exec-email-alignment.mjs, exec-email-ops-actuals.mjs, exec-email-rung-rollup.js):
// PURE where possible, FAIL-SOFT everywhere, `io.supabase` convention.
//
// PURE + FAIL-SOFT: composeDriveLine() never throws. A read failure, an absent row, an unreadable
// score, or a row with nothing measured all degrade to null (the caller renders nothing for this
// line) -- the same contract every sibling exec-email-* helper in this file's directory keeps.

import { POINTS_PER_LEG } from '../drive-loop/score/aggregate.js';
import { RATIFIED_LEG_IDS, SPEC_LEG_COUNT } from '../drive-loop/score/drive-score-legs.js';
import { formatDriveBreakdown } from '../../scripts/drive-report-sms.mjs';

const usable = (n) => Number.isFinite(n) && n >= 0;

// The FIXED ratified maximum (6), never aggregate.js's own run-scoped `possible` (which shrinks
// when a leg is unavailable -- correct for that file's own audit purpose, but the WRONG number to
// show the chairman here). The chairman directive frames every drive read against the STANDING
// goal: "6/6", every time, even on a run where a leg could not be measured -- that gap is what the
// per-leg breakdown's "unavailable" marker is for, not a shrinking denominator that quietly hides it.
export const RATIFIED_POSSIBLE = SPEC_LEG_COUNT * POINTS_PER_LEG;

/**
 * PURE: convert a drive_reports row's `drive_score` into formatDriveBreakdown's input shape.
 * Returns null when the row cannot supply a usable score, OR when not even one ratified leg has a
 * measured value -- in both cases there is nothing honest to frame against 6/6 yet.
 * @param {object} report a drive_reports row (needs .drive_score)
 * @returns {{score:number, possible:number, legs:Array<{id:string,value:number|null}>, topLeverLeg:string} | null}
 */
export function driveBreakdownFactsFromReport(report) {
  const score = report?.drive_score;
  const value = score?.score?.value;
  if (!usable(value)) return null;

  const measuredLegs = Array.isArray(score?.measured_legs) ? score.measured_legs : [];
  // ALL ratified legs are represented, even ones this run's measured_legs never mentions -- an
  // unavailable leg must be SHOWN unavailable, not silently dropped from the breakdown. The
  // chairman directive asks every drive read to be framed per leg against 6/6, every time, and a
  // breakdown that quietly omits the leg nobody could measure is the same false-reassurance shape
  // aggregate.js's own header exists to prevent, one layer up.
  const legs = RATIFIED_LEG_IDS.map((id) => {
    const m = measuredLegs.find((l) => l && l.leg === id);
    const v = m && usable(m.value) ? m.value : null;
    return { id, value: v };
  });

  const anyMeasured = legs.some((l) => l.value !== null);
  if (!anyMeasured) return null; // an old-shape row, or a run with nothing measured at all

  return { score: value, possible: RATIFIED_POSSIBLE, legs, topLeverLeg: selectTopLeverLeg(legs) };
}

/**
 * PURE: which ratified leg is the biggest remaining lever.
 *
 * An UNAVAILABLE leg wins first, deterministically (ratified id order) when more than one is
 * unavailable -- "cannot even measure this" is at least as urgent as "measured and low", and it is
 * Solomon's own DRIVE-SCORE DIAGNOSIS duty to systemic-flag exactly this shape (a ratification
 * question, e.g. leg4_capacity's TIGHT-only earning rule) as a legitimate lever category. Crowning
 * a MEASURED leg's numeric gap as "the" lever while a sibling leg is unmeasured would bury the more
 * urgent fact under a smaller, merely-numeric one.
 *
 * Otherwise: the MEASURED leg with the largest remaining gap to its own per-leg max
 * (POINTS_PER_LEG). Ties resolve to the first in ratified id order (stable `reduce`, strict `>`).
 * @param {Array<{id:string, value:number|null}>} legs
 * @returns {string|null}
 */
export function selectTopLeverLeg(legs) {
  if (!Array.isArray(legs) || legs.length === 0) return null;
  const unavailable = legs.find((l) => l.value === null);
  if (unavailable) return unavailable.id;

  const measured = legs.filter((l) => l.value !== null);
  if (measured.length === 0) return null;
  return measured.reduce((worst, l) =>
    (POINTS_PER_LEG - l.value) > (POINTS_PER_LEG - worst.value) ? l : worst
  ).id;
}

export const TRAILING_WINDOW = 10;
const FLAT_WINDOW = 6;

/**
 * PURE (SD-LEO-FIX-DRIVE-SCORE-GRADIENT-001, FR-4): build the "distinct/N = M (target >= 3)"
 * disclosure clause, plus the word "flat" when the newest 6 readings are identical, from a list of
 * trailing drive_score.score.value readings, NEWEST FIRST.
 *
 * N is the ACTUAL number of usable readings available, never a hardcoded 10 -- early in the fleet's
 * history (or after a gap) fewer than 10 rows may exist, and asserting a false 10 there would
 * misstate the denominator rather than disclose it. "flat" is asserted ONLY when at least 6 usable
 * readings exist AND all 6 of the newest are identical -- a short history is insufficient evidence
 * of a plateau, not proof of one.
 * @param {number[]} trailingScores newest-first score values, any length (including 0)
 * @returns {string}
 */
export function driveFlatnessClause(trailingScores) {
  const scores = Array.isArray(trailingScores) ? trailingScores.filter(usable) : [];
  const n = scores.length;
  const distinct = new Set(scores).size;
  const newestSix = scores.slice(0, FLAT_WINDOW);
  const isFlat = newestSix.length === FLAT_WINDOW && new Set(newestSix).size === 1;
  return `distinct/${n} = ${distinct} (target >= 3)${isFlat ? ', flat' : ''}`;
}

/**
 * Query the latest drive_reports row and render the chairman-facing per-leg breakdown line.
 * THE ONE QUERY both chairman surfaces share: `generated_at` desc, `limit(1)` -- so the morning
 * brief and the exec-summary can never render two different drive numbers from two different rows
 * in one morning (they call this same function). Fail-soft throughout: never throws.
 * @param {{ supabase: object }} io
 * @returns {Promise<{ line: string, runId: string|null, generatedAt: string|null } | null>}
 */
export async function composeDriveLine(io) {
  const db = io && io.supabase;
  if (!db) return null;
  try {
    // Widened (SD-LEO-FIX-DRIVE-SCORE-GRADIENT-001, FR-4) from limit(1) to limit(TRAILING_WINDOW):
    // one query now serves BOTH the latest row (rows[0], unchanged behavior) and the flatness/
    // distinct-count clause below, rather than a second round-trip.
    const { data, error } = await db
      .from('drive_reports')
      .select('run_id, generated_at, drive_score')
      .order('generated_at', { ascending: false })
      .limit(TRAILING_WINDOW);
    if (error) return null;
    const rows = Array.isArray(data) ? data : [];
    const row = rows[0] ?? null;
    if (!row) return null;

    const facts = driveBreakdownFactsFromReport(row);
    if (!facts) return null;

    // Traceability (SD FR-8): the date the row was generated, so a reader can tell which run's
    // score this is without a second query. Appended HERE, outside formatDriveBreakdown, so that
    // function's own pinned string format (score/legs/top-lever only) stays exactly what its own
    // unit tests exercise -- this is composition, not a change to the formatter's contract.
    const dateTag = typeof row.generated_at === 'string' ? ` (as of ${row.generated_at.slice(0, 10)})` : '';
    const trailingScores = rows.map((r) => r?.drive_score?.score?.value);
    const clause = driveFlatnessClause(trailingScores);
    return {
      line: `${formatDriveBreakdown(facts)}${dateTag} | ${clause}`,
      runId: row.run_id ?? null,
      generatedAt: row.generated_at ?? null,
    };
  } catch {
    return null;
  }
}

export default {
  RATIFIED_POSSIBLE,
  TRAILING_WINDOW,
  driveBreakdownFactsFromReport,
  selectTopLeverLeg,
  driveFlatnessClause,
  composeDriveLine,
};

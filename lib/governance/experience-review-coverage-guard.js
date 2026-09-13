/**
 * SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-D (X3) — experience-review coverage trip-wire for
 * ventures at Stage 20 or later. Preventive-class per ratification 49656c8c / D5: this SD
 * ships the gauge; the programme's own "two consecutive weekly clear readings" graduation
 * criterion belongs to the PARENT SD's tracking, not this gauge's own pass/fail contract.
 *
 * PURE MODULE — no DB access. scripts/gauges/experience-review-coverage-check.mjs is the executor.
 *
 * TRI-STATE, NOT BINARY (TESTING evidence, this SD): a naive {alarmed: boolean} mirrors
 * wind-down-recurrence-guard.js's shape but collapses "nothing to check yet" (zero qualifying
 * ventures) into the same alarmed:false reading as "checked and clean" (every qualifying
 * venture is covered). Both are healthy in the sense of never alarming, but they answer
 * different questions, so `status` carries the distinction explicitly rather than letting a
 * caller infer it from a boolean alone.
 *
 * ACTIVE-ONLY, PER-VENTURE (live-measured 2026-09-13: 56 ventures at stage>=20, split across
 * {active, cancelled}): a single global existence check across ALL such ventures would
 * false-CLEAR the moment any one covered venture exists while an uncovered active venture goes
 * unnoticed, and would false-ALARM on cancelled test fixtures that will never receive a real
 * review. The qualifying population is therefore status='active' AND current_lifecycle_stage>=20,
 * and the alarm fires if ANY qualifying venture has zero venture_experience_review_runs rows.
 */

/**
 * @param {Object} input
 * @param {string[]} input.qualifyingVentureIds - ids of ventures with status='active' AND
 *   current_lifecycle_stage>=20, as measured by the caller right now.
 * @param {Set<string>|string[]} input.coveredVentureIds - venture ids with at least one
 *   venture_experience_review_runs row (any run_mode).
 * @returns {{status: 'not_applicable'|'clear'|'alarmed', alarmed: boolean, uncoveredCount: number, qualifyingCount: number, reason: string}}
 */
export function evaluateExperienceReviewCoverage({ qualifyingVentureIds, coveredVentureIds } = {}) {
  if (!Array.isArray(qualifyingVentureIds)) {
    return {
      status: 'not_applicable',
      alarmed: false,
      uncoveredCount: 0,
      qualifyingCount: 0,
      reason: 'insufficient data: qualifyingVentureIds is not an array',
    };
  }
  if (qualifyingVentureIds.length === 0) {
    return {
      status: 'not_applicable',
      alarmed: false,
      uncoveredCount: 0,
      qualifyingCount: 0,
      reason: 'no active venture is at stage 20 or later yet -- nothing to check',
    };
  }

  const covered = coveredVentureIds instanceof Set ? coveredVentureIds : new Set(coveredVentureIds || []);
  const uncovered = qualifyingVentureIds.filter((id) => !covered.has(id));

  if (uncovered.length > 0) {
    return {
      status: 'alarmed',
      alarmed: true,
      uncoveredCount: uncovered.length,
      qualifyingCount: qualifyingVentureIds.length,
      reason: `${uncovered.length} of ${qualifyingVentureIds.length} active venture(s) at stage>=20 have zero venture_experience_review_runs rows`,
    };
  }

  return {
    status: 'clear',
    alarmed: false,
    uncoveredCount: 0,
    qualifyingCount: qualifyingVentureIds.length,
    reason: `all ${qualifyingVentureIds.length} active venture(s) at stage>=20 have at least one venture_experience_review_runs row`,
  };
}

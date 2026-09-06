/**
 * GATE-THRESHOLD SHADOW RE-SCORE — pure computation. QF-20260902-515.
 *
 * Re-scores a fixed population of ai_quality_assessments rows (weighted_score only) against a
 * current and a candidate pass_threshold, WITHOUT changing anything. This is the missing
 * verification-plan instrument Solomon's ruling (84c92184) required before f10c6ef5's parked
 * tuning candidate can be decided: how many verdicts flip PASS to FAIL (or FAIL to PASS) per
 * sd_type x content_type x current_threshold cell, over the same population the view already
 * counted (assessments scored under that current_threshold in the trailing 28 days).
 *
 * ONE REPRESENTATION: MIN_SAMPLE is imported from tuning-rules.js, not redefined, so the shadow
 * floor can never drift from the view's own n>=10 floor.
 */
'use strict';

import { MIN_SAMPLE } from './tuning-rules.js';
import { getPassThreshold } from '../../scripts/modules/ai-quality-evaluator/scoring.js';
import { SD_TYPE_PASS_THRESHOLDS } from '../../scripts/modules/ai-quality-evaluator/config.js';

/**
 * @param {Array<{weighted_score: number}>} rows - raw assessment rows for one
 *   sd_type x content_type x current_threshold cell (already time/pass_threshold filtered).
 * @param {number} currentThreshold
 * @param {number} candidateThreshold
 * @returns {{
 *   n: number, currentPass: number, candidatePass: number,
 *   currentPassRatePct: number|null, candidatePassRatePct: number|null,
 *   passToFailFlips: number, failToPassFlips: number, sampleFloorVerdict: 'MEETS_FLOOR'|'BELOW_FLOOR'
 * }}
 */
export function computeShadowRescore(rows, currentThreshold, candidateThreshold) {
  const n = rows.length;
  let currentPass = 0, candidatePass = 0, passToFailFlips = 0, failToPassFlips = 0;

  for (const row of rows) {
    const score = Number(row.weighted_score);
    const passedCurrent = score >= currentThreshold;
    const passedCandidate = score >= candidateThreshold;
    if (passedCurrent) currentPass++;
    if (passedCandidate) candidatePass++;
    if (passedCurrent && !passedCandidate) passToFailFlips++;
    if (!passedCurrent && passedCandidate) failToPassFlips++;
  }

  const pct = (count) => (n > 0 ? Math.round((count / n) * 1000) / 10 : null);

  return {
    n,
    currentPass,
    candidatePass,
    currentPassRatePct: pct(currentPass),
    candidatePassRatePct: pct(candidatePass),
    passToFailFlips,
    failToPassFlips,
    sampleFloorVerdict: n >= MIN_SAMPLE ? 'MEETS_FLOOR' : 'BELOW_FLOOR',
  };
}

/**
 * SD-LEO-INFRA-GATE-THRESHOLD-TUNING-003-E (FR-1). The re-score population filter must key on
 * the LIVE threshold (config.js's SD_TYPE_PASS_THRESHOLDS, resolved through getPassThreshold —
 * the single source of truth per QF-20260830-735), never
 * v_ai_quality_tuning_recommendations.current_threshold — that column is a HISTORICAL trace (the
 * pass_threshold recorded on each ai_quality_assessments row at assessment time), so for any pair
 * whose threshold has already been raised, filtering by it re-scores only the stale pre-raise
 * population and reports a vacuous flip count. Pure — no DB access — so callers building a
 * post-apply audit query can never accidentally trust the view's stale column.
 *
 * @param {string} sdType
 * @param {string} contentType
 * @returns {number} the live pass threshold for this pair
 */
export function resolveLiveRescoreThreshold(sdType, contentType) {
  return getPassThreshold(contentType, { sd_type: sdType });
}

/**
 * SD-LEO-INFRA-GATE-THRESHOLD-TUNING-003-E (FR-3). Every (sd_type, content_type) pair actually
 * configured in SD_TYPE_PASS_THRESHOLDS, including each sd_type's own 'default' cell — the
 * enumeration a coverage test iterates so a future config.js edit that adds an unresolvable pair
 * is caught in CI rather than silently producing a wrong population filter.
 *
 * @returns {Array<{sdType: string, contentType: string}>}
 */
export function enumerateConfiguredThresholdPairs() {
  const pairs = [];
  for (const [sdType, entry] of Object.entries(SD_TYPE_PASS_THRESHOLDS)) {
    for (const contentType of Object.keys(entry)) {
      pairs.push({ sdType, contentType: contentType === 'default' ? null : contentType });
    }
  }
  return pairs;
}

export { MIN_SAMPLE };

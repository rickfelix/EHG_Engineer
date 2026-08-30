/**
 * Eval cost caps for the weekly Gemini scan (SD-LEO-ORCH-GEMINI-MODEL-SCAN-001-I).
 *
 * Mirrors lib/cost/governor.js's classifyAnomaly/DEFAULT_THRESHOLDS shape (pure
 * threshold predicates, no I/O) applied to the scan's own eval spend -- NOT sibling
 * G's cancelled cost-governor purpose-key work. G was cancelled because no code in
 * lib/cost/governor.js consumes a Gemini-pin purpose key at all (its only Gemini-pin
 * code, TIER_LADDER, is explicitly a non-purpose-routing fallback ladder per sibling
 * B's own allowlist). This module has zero dependency on that cancelled deliverable.
 */

export const CYCLE_CAP_USD = 5;
export const PER_CANDIDATE_CAP_USD = 1;

/** @returns {boolean} true when spending `nextUsd` more would stay within the cycle cap */
export function withinCycleCap(spentUsd, nextUsd, capUsd = CYCLE_CAP_USD) {
  return (spentUsd + nextUsd) <= capUsd;
}

/** @returns {boolean} true when a single candidate's cost stays within the per-candidate cap */
export function withinPerCandidateCap(candidateUsd, capUsd = PER_CANDIDATE_CAP_USD) {
  return candidateUsd <= capUsd;
}

/**
 * Shared Stale Session Threshold Configuration
 * SD-LEO-INFRA-CLAIM-SYSTEM-IMPROVEMENTS-001 (FR-004) — original
 * SD-LEO-INFRA-EXPOSE-CLAIM-OWNER-001 (FR-2) — two-threshold model documented
 *
 * Two-threshold model (intentional, not a bug):
 *
 *   1. LIVENESS / CLAIM threshold = 300s (DEFAULT_STALE_THRESHOLD_SECONDS).
 *      The boundary at which a session is treated as no-longer-claim-holding.
 *      Used by: claim-guard.mjs, stale-session-sweep.cjs (status='ACTIVE'
 *      boundary at line 122), fleet-dashboard.cjs (idle classification, line
 *      65), /claim command, sd-next recommendations.
 *      Tuning rationale: short enough that a crashed session yields its claim
 *      quickly, long enough that a session loading context / between tool
 *      calls is not prematurely reclaimed. The PID-liveness fallback covers
 *      the in-between case (status='ALIVE_NO_HEARTBEAT').
 *      Override: STALE_SESSION_THRESHOLD_SECONDS env var.
 *
 *   2. DISPLAY-STALE threshold = 600s (DISPLAY_STALE_THRESHOLD_SECONDS).
 *      The boundary at which v_active_sessions.computed_status flips to
 *      'stale' in dashboards. Intentionally LARGER than the liveness
 *      threshold so a session momentarily over the 300s mark is not shown
 *      as stale to a human reading the dashboard — display flap costs
 *      attention without changing claim semantics.
 *      Encoded in the SQL view (database/migrations/20260406_v_active_sessions
 *      _stale_threshold_600s.sql; preserved by 20260426 and 20260526) as a
 *      hardcoded numeric. The JS constant exported here is for documentation
 *      and discoverability — the view does not import JS.
 *
 * The two thresholds measure DIFFERENT things on purpose. Collapsing them to
 * one value reverts the deliberate 20260406 board decision and trades display
 * flap for claim-churn (or vice versa). Touch with explicit RCA evidence only.
 *
 * Prior comment claimed "Default: 300 ... matches v_active_sessions view".
 * That was false from migration 20260406 onward and was caught by RCA 269e55cc
 * (writer-consumer asymmetry, 5th witness of PAT-LEO-INFRA-WRITER-CONSUMER-
 * ASYMMETRY-001).
 */

const DEFAULT_STALE_THRESHOLD_SECONDS = 300;
const DISPLAY_STALE_THRESHOLD_SECONDS = 600;

/**
 * Get the liveness/claim stale threshold in seconds.
 * Reads from STALE_SESSION_THRESHOLD_SECONDS env var, falls back to 300s.
 * Do NOT use this value for display formatting — see DISPLAY_STALE_THRESHOLD_SECONDS.
 * @returns {number} Liveness threshold in seconds.
 */
export function getStaleThresholdSeconds() {
  const envVal = process.env.STALE_SESSION_THRESHOLD_SECONDS;
  if (envVal) {
    const parsed = parseInt(envVal, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_STALE_THRESHOLD_SECONDS;
}

export { DEFAULT_STALE_THRESHOLD_SECONDS, DISPLAY_STALE_THRESHOLD_SECONDS };
export default {
  getStaleThresholdSeconds,
  DEFAULT_STALE_THRESHOLD_SECONDS,
  DISPLAY_STALE_THRESHOLD_SECONDS,
};

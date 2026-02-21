/**
 * Shared Stale Session Threshold Configuration
 * SD-LEO-INFRA-CLAIM-SYSTEM-IMPROVEMENTS-001 (FR-004)
 *
 * Single source of truth for session staleness threshold.
 * Used by: claim-guard.mjs, v_active_sessions view, cleanup_stale_sessions RPC,
 *          /claim command, sd-next recommendations.
 *
 * Override via STALE_SESSION_THRESHOLD_SECONDS environment variable.
 * Default: 300 seconds (5 minutes) — matches v_active_sessions view.
 */

const DEFAULT_STALE_THRESHOLD_SECONDS = 300;

/**
 * Get the stale session threshold in seconds.
 * Reads from STALE_SESSION_THRESHOLD_SECONDS env var, falls back to 300s default.
 * @returns {number} Threshold in seconds
 */
export function getStaleThresholdSeconds() {
  const envVal = process.env.STALE_SESSION_THRESHOLD_SECONDS;
  if (envVal) {
    const parsed = parseInt(envVal, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_STALE_THRESHOLD_SECONDS;
}

export { DEFAULT_STALE_THRESHOLD_SECONDS };
export default { getStaleThresholdSeconds, DEFAULT_STALE_THRESHOLD_SECONDS };

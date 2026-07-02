/**
 * gauge-runner liveness check (SD-LEO-INFRA-INVARIANT-GAUGES-FRAMEWORK-001 FR-4, invariant #0).
 *
 * A dead/silently-stopped gauge-runner is a WORSE failure than any single invariant drifting — it
 * produces a false all-clear (no findings, because nothing ran). This pure function decides whether
 * the runner's last heartbeat is stale enough to alarm. The caller (scripts/coordinator-hourly-
 * review.cjs) is a SEPARATE, independently-cron'd process from gauge-runner.mjs itself — genuinely
 * external, not the runner checking its own liveness.
 */

// Expected cadence + margin. The runner has no fixed cron in this SD (invocation cadence is owned
// by whatever wires it into a tick loop); this threshold is deliberately generous so a one-off
// missed tick doesn't false-alarm, while a genuinely dead runner (hours of silence) does.
export const STALE_HEARTBEAT_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2h

/**
 * Pure: is the gauge-runner's last heartbeat stale beyond the threshold?
 * @param {string|null|undefined} lastHeartbeatAt — ISO timestamp of the last successful run, or
 *   null/undefined if no heartbeat has ever been recorded (treated as alarm:true — never having
 *   run is itself the worst case of "not observably alive").
 * @param {number} nowMs
 * @param {number} [thresholdMs]
 * @returns {{ alarm: boolean, ageMs: number|null }}
 */
export function checkGaugeRunnerLiveness(lastHeartbeatAt, nowMs, thresholdMs = STALE_HEARTBEAT_THRESHOLD_MS) {
  if (!lastHeartbeatAt) return { alarm: true, ageMs: null };
  const ageMs = nowMs - new Date(lastHeartbeatAt).getTime();
  if (!Number.isFinite(ageMs)) return { alarm: true, ageMs: null };
  return { alarm: ageMs > thresholdMs, ageMs };
}

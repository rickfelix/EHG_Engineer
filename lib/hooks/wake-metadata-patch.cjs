/**
 * Pure builder for the claude_sessions.metadata patch written on a ScheduleWakeup
 * arm (scripts/hooks/post-tool-loop-state.cjs). Extracted so it is requirable and
 * unit-testable without triggering that file's top-level IIFE / process.exit(0).
 *
 * SD-LEO-INFRA-BURN-TELEMETRY-PER-001-B: wake_trigger_reason MUST be placed AFTER
 * ...priorMeta — a stale priorMeta.wake_trigger_reason (e.g. from a manual park)
 * would otherwise silently win over this write site's literal, since object
 * spread lets later keys overwrite earlier ones.
 */
function buildWakeMetadataPatch(priorMeta, delaySeconds, nowMs) {
  if (!(priorMeta && Number.isFinite(delaySeconds) && delaySeconds > 0)) return null;
  return {
    ...priorMeta,
    wake_armed_at: new Date(nowMs).toISOString(),
    wake_delay_seconds: delaySeconds,
    expected_wake_at: new Date(nowMs + delaySeconds * 1000).toISOString(),
    wake_trigger_reason: 'wakeup-timer',
  };
}

module.exports = { buildWakeMetadataPatch };

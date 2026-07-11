/**
 * Class-split invocation helpers (SD-LEO-INFRA-OPERATIVE-AGENT-OWNERSHIP-001-A, FR-5/TR-1).
 *
 * The GHA durable invoker sets LIVENESS_CLASSES=self_stamped,eva_scheduler_heartbeat —
 * role_session (claude_sessions_heartbeat) rows are PID-anchored via lib/fleet/session-liveness.cjs
 * hasPidAlive, which resolves host-local PIDs; evaluating them from a CI runner degrades to
 * stale-timestamp-only reads and false-OVERDUEs every live session (the exact silent-false-death
 * class the watcher exists to prevent). The dev-host STANDARD_LOOPS entry runs the complementary
 * filter (claude_sessions_heartbeat only) so no row is double-evaluated across the two venues.
 *
 * Pure module (no env, no DB) so the TR-1 pin tests import it without side effects.
 */

/** Unset/empty LIVENESS_CLASSES = no filter (pre-split behavior, byte-identical). */
export function parseLivenessClasses(raw) {
  if (!raw || typeof raw !== 'string' || raw.trim() === '') return null;
  return new Set(raw.split(',').map((s) => s.trim()).filter(Boolean));
}

export function partitionRowsByClasses(rows, classes) {
  if (!classes) return { evaluate: rows, skipped: [] };
  const evaluate = [];
  const skipped = [];
  for (const row of rows) (classes.has(row.liveness_source) ? evaluate : skipped).push(row);
  return { evaluate, skipped };
}

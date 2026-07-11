/**
 * Shared terminal-status predicate for orchestrator child SDs.
 *
 * A child is "terminal" — no longer something a worker or completion gate
 * should wait on — when it is either completed or cancelled; both are final
 * dispositions. QF-20260710-491: cancelled was excluded from every
 * "are children done?" computation except plan-to-lead/gates/prerequisite-check.js,
 * so any orchestrator with a cancelled child could never reach allComplete=true,
 * permanently stranding it at claim/routing and (had claim been forced)
 * re-stalling at LEAD-FINAL/completion-guardian.
 */
export const TERMINAL_CHILD_STATUSES = ['completed', 'cancelled'];

export function isTerminalChildStatus(status) {
  return TERMINAL_CHILD_STATUSES.includes(status);
}

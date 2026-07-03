/**
 * Shared pure CI-status helpers for every merge lane.
 *
 * SD-LEO-INFRA-SHIP-WITNESS-MERGEWORK-001 FR-1: extracted from
 * scripts/modules/complete-quick-fix/git-operations.js (QF-20260702-515), which
 * previously defined these functions locally for the quick-fix lane only. /ship's
 * lib/ship/auto-merge.mjs attemptAutoMerge() had no CI precondition at all. Pulling
 * these into a shared module lets both lanes (and the mergeWork() P1-P5 ladder,
 * lib/ship/merge-witness-ladder.mjs) use the same CI-status logic instead of each
 * lane reimplementing it independently.
 *
 * git-operations.js re-exports these three functions from here so the quick-fix
 * lane's existing imports and behavior are unchanged.
 */

/**
 * Classify a single statusCheckRollup entry as pending.
 * Handles both CheckRun shape ({status,conclusion}) and legacy StatusContext shape ({state}).
 */
export function isCheckPending(check) {
  if (check.status !== undefined) return check.status !== 'COMPLETED';
  if (check.state !== undefined) return check.state === 'PENDING' || check.state === 'EXPECTED';
  return false;
}

/** Classify a COMPLETED/non-pending check as failed. */
export function isCheckFailed(check) {
  if (check.conclusion != null) return ['FAILURE', 'TIMED_OUT', 'CANCELLED'].includes(check.conclusion);
  if (check.state !== undefined) return check.state === 'FAILURE' || check.state === 'ERROR';
  return false;
}

/** Pure summary of a PR's statusCheckRollup — no IO, fully unit-testable. */
export function summarizeCIStatus(statusCheckRollup) {
  const checks = Array.isArray(statusCheckRollup) ? statusCheckRollup : [];
  const pending = checks.filter(isCheckPending);
  const failed = checks.filter(c => !isCheckPending(c) && isCheckFailed(c));
  return { total: checks.length, pending: pending.length, failed: failed.length,
    isPending: pending.length > 0, hasFailed: failed.length > 0 };
}

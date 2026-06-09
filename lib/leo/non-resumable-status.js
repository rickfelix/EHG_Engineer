/**
 * Shared non-resumable SD status set.
 * SD-LEO-INFRA-CLAIM-LIFECYCLE-HARDENING-002 FR-3.
 *
 * ONE canonical list so the three getNextParentSD resume gates (fast-path / baseline / fallback)
 * — and any future caller — cannot drift. Before this, the fast path excluded only `completed`,
 * the baseline excluded `completed,cancelled`, and the fallback excluded `completed,cancelled,deferred`,
 * and NONE excluded `pending_approval` (which awaits LEAD-FINAL-APPROVAL, not fresh EXEC).
 *
 * Semantics:
 *   - completed / cancelled  → terminal
 *   - deferred               → parked (sd-park.js PARK_STATUS)
 *   - pending_approval       → awaits LEAD-FINAL (recoverStrandedFinal owns re-claim), NOT fresh EXEC
 *
 * Pure module — no IO, no side effects — so it is safely importable by tests.
 */

export const NON_RESUMABLE_STATUSES = Object.freeze([
  'completed',
  'cancelled',
  'deferred',
  'pending_approval',
]);

/**
 * PostgREST list literal for `.not('status', 'in', NON_RESUMABLE_IN_LIST)`:
 *   ("completed","cancelled","deferred","pending_approval")
 */
export const NON_RESUMABLE_IN_LIST = `(${NON_RESUMABLE_STATUSES.map((s) => `"${s}"`).join(',')})`;

/** True iff an SD in this status may be resumed into fresh EXEC. */
export function isResumableStatus(status) {
  return !NON_RESUMABLE_STATUSES.includes(status);
}

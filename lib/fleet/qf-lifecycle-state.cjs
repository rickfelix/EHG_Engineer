'use strict';

/**
 * qf-lifecycle-state.cjs — QF-20260830-559.
 *
 * The quick_fixes status vocabulary (open, in_progress, completed, cancelled, closed) has no
 * state between in_progress and completed, so a seat waiting on a PR reviewer reads identically
 * to a seat heads-down building — the wind-down handshake, the fleet dashboard, and the
 * coordinator's capacity forecast all saw a bare 'in_progress' and could not tell the two apart
 * (SPECIMEN 2026-08-30: 4 continue-building nudges against a code-complete, review-dispatched QF).
 *
 * Shape chosen to avoid an enum change whose consumers are un-enumerated: DERIVE awaiting-review
 * from two columns that already exist and are already stamped (status, pr_url) rather than adding
 * a new status value. The enum-change alternative (and its consumer census) is recorded as a
 * follow-up, not this QF's scope.
 */

/** PURE: is this QF built and waiting on a PR reviewer, not being actively worked? */
function isAwaitingReview(qf) {
  return !!qf && qf.status === 'in_progress' && !!qf.pr_url;
}

/** PURE: the derived lifecycle label for display — 'awaiting_review' overrides the raw
 *  in_progress status; every other status (open/completed/cancelled/closed) passes through. */
function deriveQfLifecycleState(qf) {
  if (isAwaitingReview(qf)) return 'awaiting_review';
  return (qf && qf.status) || null;
}

module.exports = { isAwaitingReview, deriveQfLifecycleState };

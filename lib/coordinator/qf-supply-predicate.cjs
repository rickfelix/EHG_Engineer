/**
 * What counts as CLAIMABLE quick-fix supply — SD-LEO-INFRA-DISPATCH-DELIVERY-INTEGRITY-001 (FR-4).
 *
 * THE DEFECT THIS CLOSES: THE GAUGE COUNTED WHAT THE ACTION PATH COULD NOT REACH. Two supply
 * gauges queried `status IN ('open','in_progress')` while all five candidate chokepoints require
 * `status = 'open'`:
 *   worker-checkin.cjs isAutoStartableQF (the decisive one), its two candidate queries,
 *   lib/checkin/steps/critical-qf-jump.cjs, and scripts/coordinator-idle-qf-hint.mjs.
 * So a row cleared-but-not-reopened was reported as available supply while no worker could claim
 * it. Measured live: the gauge saw 9, workers could reach 2, and 7 were invisible — 6 of them
 * critical. That gap is why "the belt is empty" read true while six critical items sat waiting.
 *
 * WHY THIS IS A SHARED MODULE AND NOT TWO INLINE FILTERS. The predicate previously existed only as
 * two copies of an inline query-builder chain. In that form the ":496-only partial fix" — correcting
 * one gauge and leaving the primary one lying — is UNDETECTABLE BY TEST, because there is no symbol
 * to assert against. One definition site is what makes agreement with the chokepoint testable at
 * all, which is the actual prerequisite for FR-4 rather than a style preference.
 *
 * NARROWED TO 'open' DELIBERATELY, and this is the direction that matters: the fix is to narrow the
 * GAUGE to what a worker can claim, NEVER to widen a chokepoint to accept 'in_progress'. Widening
 * the chokepoint would let workers self-claim rows that are legitimately held or awaiting scope
 * attestation, and would break the non-critical pull-order guarantee. Narrowing the gauge only
 * makes the report honest.
 *
 * An in_progress row with a NULL claimant is NOT supply:
 *   - if it carries pr_url/commit_sha it is a merge-witnessed row awaiting attestation
 *     (QF-20260725-691) — deliberately non-terminal, and not work anyone should be handed;
 *   - if it carries neither, it is STRANDED, and the fix for that is to reopen it
 *     (lib/fleet/best-effort-release.mjs clearAndReopenQf), not to report it as claimable.
 */
'use strict';

/** Statuses a worker can actually claim. Must stay in lockstep with isAutoStartableQF. */
const CLAIMABLE_QF_STATUSES = Object.freeze(['open']);

/**
 * Apply the claimable-supply filter to a supabase query builder.
 * Both gauges call this, so they cannot drift apart or be half-fixed.
 *
 * @param {object} query - a supabase query builder positioned on quick_fixes
 * @returns {object} the same builder, filtered
 */
function applyClaimableQfFilter(query) {
  return query.is('claiming_session_id', null).in('status', CLAIMABLE_QF_STATUSES);
}

/**
 * Pure mirror of the filter, for tests and for anyone reasoning about a row in memory.
 * Deliberately narrower than isAutoStartableQF: that predicate additionally applies staleness,
 * tier, factory-lane and chairman-gate rules. This answers only the question the GAUGE asks —
 * "is this row unclaimed and in a claimable status" — so gauge and chokepoint can be compared on
 * the axis where they used to disagree.
 *
 * @param {{status?: string, claiming_session_id?: string|null}} qf
 * @returns {boolean}
 */
function isClaimableQfSupply(qf) {
  if (!qf) return false;
  if (qf.claiming_session_id) return false;
  return CLAIMABLE_QF_STATUSES.includes(qf.status);
}

module.exports = { CLAIMABLE_QF_STATUSES, applyClaimableQfFilter, isClaimableQfSupply };

/**
 * lib/claim/evidence-attribution-decisions.mjs — SD-LEO-INFRA-RECLAIMSAFE-CANNOT-TELL-001.
 *
 * The two decisions that consume triangulate()'s per-witness `evidenceAttribution` (FR-1).
 *
 * WHY THESE LIVE HERE RATHER THAN INLINE IN THE TWO CLI SCRIPTS: both consumers are
 * entrypoint scripts whose logic sits inside main(), so nothing importable existed to test.
 * The first cut of this SD tested local RE-IMPLEMENTATIONS of these predicates inside the test
 * file, which a negative control exposed as near-vacuous: reverting stale-session-sweep.cjs
 * entirely produced ZERO test failures, and reverting sd-start.js failed only a string-grep.
 * The predicates were right and the tests were green, and neither fact protected the shipped
 * code. Extracting them means the real consumers and the tests exercise the SAME function, so
 * an inverted boolean or a deleted branch fails a test instead of passing one.
 *
 * Both are pure and side-effect free: the same inputs always give the same answer, and neither
 * touches the database, the filesystem, or process state.
 */

/**
 * FR-2 — scripts/sd-start.js asks "may I take this?".
 *
 * The evidence gate's witnesses are mostly SD-keyed, so this session's own branch reads as
 * somebody else's evidence of life and locks it out of reclaiming a claim it demonstrably
 * owns. Override that ONLY when both hold:
 *   1. self-ownership is PROVEN (cwd inside the SD's worktree, or a deterministic
 *      resolveOwnSession whose sd_key already equals this SD), and
 *   2. the blocking evidence is entirely UNATTRIBUTED — nothing that fired names any session.
 *
 * Requiring BOTH is what keeps a strand fix from becoming a steal: if any witness points at a
 * live session, this returns false and the caller blocks exactly as it did before this SD.
 *
 * @param {object} args
 * @param {boolean} args.selfOwned - result of resolveSelfOwnership().selfOwned
 * @param {{allUnattributed?: boolean}|null} [args.evidenceAttribution] - from checkPreClaimEvidence
 * @returns {boolean} true = safe to override the gate for THIS session
 */
export function selfOwnedOverridesEvidenceGate({ selfOwned, evidenceAttribution } = {}) {
  return Boolean(selfOwned) && evidenceAttribution?.allUnattributed === true;
}

/**
 * FR-3 — scripts/stale-session-sweep.cjs asks "may I release someone ELSE's?".
 *
 * A structurally different question: the sweep iterates other sessions' claims, so
 * "am I the owner" (resolveSelfOwnership) is the wrong primitive and is deliberately not used
 * there. What matters is whether the evidence was produced by a session OTHER than the dead
 * one under evaluation. Holding on unattributed evidence meant a verifiably dead session's
 * claim stayed held by its own leftover footprint — the same strand, seen from the reaper side.
 *
 * Sibling attribution is liveness-filtered upstream (buildSiblingSessionMap selects only
 * sessions with a recent heartbeat), so a named peer is a live peer.
 *
 * @param {object} args
 * @param {string} args.evaluatedSessionId - the session whose claim is being considered for release
 * @param {{sessionIds?: string[]}|null} [args.evidenceAttribution] - from checkPreClaimEvidence
 * @returns {boolean} true = HOLD the release (a live peer is demonstrably on this SD)
 */
export function sweepShouldHoldRelease({ evaluatedSessionId, evidenceAttribution } = {}) {
  const others = (evidenceAttribution?.sessionIds || []).filter(id => id !== evaluatedSessionId);
  return others.length > 0;
}

export default { selfOwnedOverridesEvidenceGate, sweepShouldHoldRelease };

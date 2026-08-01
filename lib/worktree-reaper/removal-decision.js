/**
 * The removal decision (SD-FDBK-INFRA-ORPHAN-WORKTREE-STRANDING-001-B, FR-1b).
 *
 * WHY THIS EXISTS AS A FUNCTION AT ALL. The reaper's removal gate lived inline inside
 * main()'s loop, so the composition of the guards — the thing that actually decides
 * whether a directory is deleted — could not be tested without a real filesystem and a
 * real Supabase. classifyWorktree and stageForCategories are exported and well covered;
 * the gate that acts on them was not.
 *
 * WHAT IT CHANGES. Previously every guard was an absolute veto, AND-composed, claim guard
 * first: `if (claimGuard.blocked) { ...; continue; }`. That `continue` returns to the top
 * of the loop, so residency was never consulted once the claim guard had spoken.
 *
 * That was fine while the claim guard only blocked on real claims. FR-1 made it also block
 * on `work_key_unresolvable` — an honest admission that it CANNOT VERIFY a tree whose
 * basename resolves to no work key. Left as a veto, that admission would mean such a tree
 * is never reaped again, converting silent data-loss into permanent pool backlog. The
 * coordinator predicted exactly this before FR-1 landed, and it landed anyway.
 *
 * THE FIX IS A DEMAND, NOT A DOWNGRADE. `work_key_unresolvable` no longer short-circuits;
 * it requires residency to AFFIRMATIVELY clear before removal proceeds. So:
 *
 *     unresolvable + resident            => blocked   (the ceremony trees survive)
 *     unresolvable + untouched past N    => removed   (dead ad-hoc trees still drain)
 *
 * This is the invariant itself rather than a proxy for it: a venue with a live occupant is
 * not reapable, BY ANY ADDRESSING SCHEME. For a tree with no derivable key, occupancy is
 * not one predicate among several — it is the only one available, because keyFromWorktree
 * reads the branch but only for feat|qf|fix|chore|hotfix, so a ceremony branch resolves
 * under neither branch nor basename.
 *
 * THE GUARD ITSELF STAYS HONEST. liveClaimBlocksRemoval keeps returning blocked:true with
 * an accurate reason — it genuinely cannot answer the occupancy question. The policy lives
 * here, at the composition layer. A guard that lies about its own confidence to produce a
 * convenient answer is the failure mode this whole SD exists to close.
 *
 * EVERY OTHER BLOCKED REASON REMAINS AN ABSOLUTE VETO. live_claimed, the three
 * unverifiable_* lookup errors, unverifiable_no_supabase, live_session_pointing — those are
 * either positive evidence of a claim or a failure to reach the DB, and residency clearing
 * says nothing about either. Only the unresolvable-KEY case is a statement about addressing.
 */

/** The one claim-guard reason that is a demand rather than a veto. */
export const WORK_KEY_UNRESOLVABLE = 'work_key_unresolvable';

/** Removal was permitted despite an unresolvable key, because residency cleared. */
export const UNRESOLVABLE_KEY_RESIDENCY_CLEARED = 'unresolvable_key_residency_cleared';

/** A guard result that is absent or malformed cannot be trusted to mean "clear". */
function isMalformed(guard) {
  return !guard || typeof guard.blocked !== 'boolean';
}

/**
 * Decide whether a candidate worktree may be removed.
 *
 * Pure and synchronous by design: callers do the I/O, this decides. Any guard may be
 * omitted ONLY by passing an explicit non-blocking result; a missing or malformed guard
 * fails CLOSED, so a caller that forgets to wire one up refuses rather than deletes.
 *
 * @param {object} input
 * @param {{blocked: boolean, reason?: string}} input.claimGuard
 * @param {{blocked: boolean, reason?: string}} input.treeResidency
 * @param {{blocked: boolean, reason?: string}} input.heartbeatResidency
 * @returns {{remove: boolean, reason: string|null, source: string|null}}
 */
export function decideRemoval({ claimGuard, treeResidency, heartbeatResidency } = {}) {
  for (const [name, guard] of [
    ['claim', claimGuard],
    ['tree_residency', treeResidency],
    ['heartbeat_residency', heartbeatResidency],
  ]) {
    if (isMalformed(guard)) {
      return { remove: false, reason: `guard_result_missing:${name}`, source: name };
    }
  }

  const residencyBlock = treeResidency.blocked
    ? { remove: false, reason: treeResidency.reason ?? null, source: 'tree_residency' }
    : heartbeatResidency.blocked
      ? { remove: false, reason: heartbeatResidency.reason ?? null, source: 'heartbeat_residency' }
      : null;

  if (claimGuard.blocked) {
    if (claimGuard.reason !== WORK_KEY_UNRESOLVABLE) {
      return { remove: false, reason: claimGuard.reason ?? null, source: 'claim' };
    }
    // Demand: the claim guard abstains, residency must affirmatively clear.
    return residencyBlock ?? { remove: true, reason: UNRESOLVABLE_KEY_RESIDENCY_CLEARED, source: null };
  }

  return residencyBlock ?? { remove: true, reason: null, source: null };
}

export default { decideRemoval, WORK_KEY_UNRESOLVABLE, UNRESOLVABLE_KEY_RESIDENCY_CLEARED };

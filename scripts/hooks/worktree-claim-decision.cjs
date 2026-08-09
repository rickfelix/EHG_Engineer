// worktree-claim-decision.cjs — pure predicate for the worktree claim guard (PAT-CLMMULTI-002).
// QF-20260804-087.
//
// The guard resolved "what does this session hold" from strategic_directives_v2 ONLY. A QF claim
// lives in quick_fixes and was therefore invisible to it, so a worker legitimately assigned a QF
// while holding ANY SD claim (including a stale, forgotten one) was blocked from its own QF
// worktree — and NO action available to that worker satisfied the check, because the QF claim was
// real and recorded and the guard simply could not read the table it was in.
//
// Extracted as a pure function for the same reason as askuser-worker-policy.cjs: the hook runs
// main() at load, so nothing inside it can be required, and a guard whose decision cannot be
// unit-tested gets "verified" by source pins that pass whether or not the behaviour is right.

/**
 * @param {string} args.worktreeKey - first .worktrees/ path segment (an sd_key or a QF id)
 * @param {string|null} args.claimedSdKey - this session's claimed sd_key; null = no claim OR an
 *   unreadable lookup (the SD lookup's fail-open contract)
 * @param {boolean|null} args.qfHeld - quick_fixes lookup, TRI-STATE and the tri-state is the fix:
 *   true = holds this QF; false = query SUCCEEDED and it does not; null = could not tell. Collapse
 *   null into false and any transient blip re-blocks the worker this exists to unblock.
 * @returns {boolean} true ⇢ BLOCK the Edit/Write
 */
function shouldBlockWorktreeEdit({ worktreeKey, claimedSdKey, qfHeld }) {
  // Holding (or possibly holding) this QF permits the edit even while an SD claim is open —
  // the two claims are on different axes and were never in conflict.
  if (qfHeld !== false) return false;
  // Otherwise the original invariant, byte-for-byte: block only on a POSITIVE mismatch, so a
  // null claimedSdKey (no claim, or an unreadable lookup) still fails OPEN.
  return Boolean(claimedSdKey) && claimedSdKey !== worktreeKey;
}

/** True when a worktree segment names a quick-fix rather than an SD (drives the second lookup). */
function isQuickFixWorktree(worktreeKey) {
  return /^QF-/i.test(String(worktreeKey || ''));
}

module.exports = { shouldBlockWorktreeEdit, isQuickFixWorktree };

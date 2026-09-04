// worktree-claim-decision.cjs — pure predicates for the worktree claim guard (PAT-CLMMULTI-002).
// QF-20260804-087. SD-LEO-INFRA-CLAIM-GUARD-BRANCH-DERIVED-001 (branch-first key derivation).
//
// The guard resolved "what does this session hold" from strategic_directives_v2 ONLY. A QF claim
// lives in quick_fixes and was therefore invisible to it, so a worker legitimately assigned a QF
// while holding ANY SD claim (including a stale, forgotten one) was blocked from its own QF
// worktree — and NO action available to that worker satisfied the check, because the QF claim was
// real and recorded and the guard simply could not read the table it was in.
//
// Extracted as pure functions for the same reason as askuser-worker-policy.cjs: the hook runs
// main() at load, so nothing inside it can be required, and a guard whose decision cannot be
// unit-tested gets "verified" by source pins that pass whether or not the behaviour is right.

// Anchored to the start of the (post type-prefix) branch segment; stops cleanly before a
// lowercase slug so "SD-XXX-001-close-paths" doesn't swallow the slug into the key. Mirrors
// lib/ship/work-key-derivation.mjs's deriveWorkKeyFromBranch -- re-implemented here (not
// require()'d) because this hook's CJS runtime cannot load that ESM module. Deliberately NOT
// lib/worktree-reaper/detectors.js:40 / scripts/safe-worktree-remove.mjs:46's keyFromBranch
// (unanchored, returns the branch remainder INCLUDING any trailing slug).
const QF_KEY_PATTERN = 'QF-\\d{8}-\\d+';
const SD_KEY_PATTERN = 'SD-[A-Z0-9]+(?:-[A-Z0-9]+)*';
const BRANCH_KEY_PATTERN = new RegExp(`^(${QF_KEY_PATTERN}|${SD_KEY_PATTERN})(?=-[a-z]|$)`);

/**
 * Pure branch -> key derivation. Takes an already-resolved branch string (the CALLER performs
 * the git invocation); never throws.
 * @param {string|null|undefined} branch - e.g. "feat/SD-X-001-slug" or "qf/QF-20260903-188"
 * @returns {string|null}
 */
function deriveKeyFromBranch(branch) {
  if (!branch || typeof branch !== 'string') return null;
  const afterSlash = branch.includes('/') ? branch.slice(branch.lastIndexOf('/') + 1) : branch;
  const m = afterSlash.match(BRANCH_KEY_PATTERN);
  return m ? m[1] : null;
}

/**
 * Pure branch -> marker -> path precedence chain (FR-1/FR-3). Takes already-resolved inputs;
 * performs no git process, filesystem access, or DB lookup itself -- that is ENFORCEMENT-4's
 * job (pre-tool-enforce.cjs). A guard helper that could throw would defeat the fail-open
 * contract it is wired into, so this always returns a total {key, source} shape and never
 * throws, even on non-string/null/undefined inputs.
 * @param {{ branch?: string|null, marker?: string|null, pathKey?: string|null }} args
 * @returns {{ key: string|null, source: 'branch'|'marker'|'path'|null }}
 */
function deriveWorktreeKey({ branch, marker, pathKey } = {}) {
  const branchKey = deriveKeyFromBranch(branch);
  if (branchKey) return { key: branchKey, source: 'branch' };
  if (typeof marker === 'string' && marker) return { key: marker, source: 'marker' };
  if (typeof pathKey === 'string' && pathKey) return { key: pathKey, source: 'path' };
  return { key: null, source: null };
}

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

module.exports = { deriveWorktreeKey, deriveKeyFromBranch, shouldBlockWorktreeEdit, isQuickFixWorktree, BRANCH_KEY_PATTERN };

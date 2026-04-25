/**
 * QF Branch Detection
 * SD-LEO-INFRA-SHIP-INVOKE-COMPLETE-001
 *
 * Centralizes the rule that decides whether a /ship merge corresponds to a
 * Quick-Fix and therefore needs complete-quick-fix.js invoked BEFORE the
 * post-merge worktree cleanup runs (or the QF row stays open forever — the
 * QF-808 / QF-081 same-class incidents that motivated this fix).
 *
 * Production data shows TWO prefixes are in active use:
 *   - `qf/QF-<id>`         (current canonical, used by recent QFs)
 *   - `quick-fix/QF-<id>`  (older variant, still appears on some merges)
 *
 * Both are accepted. New skills (e.g. /ship Step 6.3) MUST consult these
 * helpers rather than re-implementing the regex inline — that drift is
 * exactly what kept production using two prefixes simultaneously.
 */

const QF_BRANCH_PREFIXES = ['qf/', 'quick-fix/'];
const QF_ID_REGEX = /^(?:qf|quick-fix)\/(QF-[A-Za-z0-9-]+)$/i;

/**
 * @param {string|null|undefined} branchName
 * @returns {boolean} true iff the branch name starts with a recognized QF prefix
 */
export function isQuickFixBranch(branchName) {
  if (typeof branchName !== 'string' || branchName.length === 0) return false;
  const lower = branchName.toLowerCase();
  return QF_BRANCH_PREFIXES.some(p => lower.startsWith(p));
}

/**
 * Extract the QF-ID portion of a quick-fix branch name.
 * Returns null when the branch does not match a known QF pattern, including
 * partial matches like `qf/something-else` without the `QF-` ID segment.
 *
 * @param {string|null|undefined} branchName
 * @returns {string|null} e.g. "QF-20260424-808" or null
 */
export function extractQFId(branchName) {
  if (typeof branchName !== 'string') return null;
  const match = branchName.match(QF_ID_REGEX);
  return match ? match[1] : null;
}

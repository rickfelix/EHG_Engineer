/**
 * Work-key derivation heuristic — SD-LEO-INFRA-SHIP-WITNESS-COVERAGE-001 FR-4.
 *
 * Shared by the reconcile sweep (FR-1) and the retroactive batch backfill (FR-2) so both
 * callers can never derive a work-key differently for the same PR shape. Matches the branch
 * name first (the more reliable signal — set once at PR creation, not editable after review),
 * falling back to the PR title. Never fabricates: returns null when neither carries a
 * recognizable SD/QF key — a missing attribution is safer for an audit trail than a guessed one.
 */

const QF_PATTERN = 'QF-\\d{8}-\\d+';
const SD_PATTERN = 'SD-[A-Z0-9]+(?:-[A-Z0-9]+)*';

// Anchored to the start of the (post type-prefix) branch segment; stops cleanly before a
// lowercase slug so "SD-XXX-001-close-paths" doesn't swallow the slug into the key.
const BRANCH_KEY_PATTERN = new RegExp(`^(${QF_PATTERN}|${SD_PATTERN})(?=-[a-z]|$)`);
// Unanchored for titles — a key can appear anywhere (e.g. "fix(QF-...): description"). The
// negative lookbehind guards against a glued uppercase prefix (e.g. "MSD-100") producing a
// phantom "SD-100" match (TESTING sub-agent finding, EXEC phase review).
const TITLE_KEY_PATTERN = new RegExp(`(?<![A-Z0-9])(${QF_PATTERN}|${SD_PATTERN})`);

/** @param {string|null|undefined} branchName - e.g. "feat/SD-XXX-001-slug" or "qf/QF-20260703-999" */
export function deriveWorkKeyFromBranch(branchName) {
  if (!branchName || typeof branchName !== 'string') return null;
  const afterSlash = branchName.includes('/') ? branchName.slice(branchName.lastIndexOf('/') + 1) : branchName;
  const m = afterSlash.match(BRANCH_KEY_PATTERN);
  return m ? m[1] : null;
}

/** @param {string|null|undefined} title - e.g. "fix(QF-20260703-999): description" */
export function deriveWorkKeyFromTitle(title) {
  if (!title || typeof title !== 'string') return null;
  const m = title.match(TITLE_KEY_PATTERN);
  return m ? m[1] : null;
}

/**
 * @param {{ branchName?: string|null, title?: string|null }} pr
 * @returns {string|null} the derived key, or null when neither branch nor title carries one
 */
export function deriveWorkKey({ branchName, title } = {}) {
  return deriveWorkKeyFromBranch(branchName) ?? deriveWorkKeyFromTitle(title);
}

/**
 * SD-LEO-FIX-EXEC-PLAN-ACCEPTED-001 (FR-8, coordinator scope note 5bd643ca, Golf-3):
 * once a feature branch merges, HEAD becomes an ancestor of main and
 * `git diff --name-only main...HEAD` returns an EMPTY diff -- checkForNonUISdType's
 * zero-UI-by-diff gate then fails closed and the run falls through to the full E2E flow,
 * which BLOCKs a genuinely zero-UI, already-merged SD that has no way to be honestly
 * re-evidenced. --diff-range lets a caller supply the SD's actual pre-merge range
 * (e.g. its last commit vs that commit's parent) instead of the default main...HEAD.
 *
 * Validates the raw CLI value before it ever reaches execSync -- the range is
 * interpolated into a shell command string, so an unvalidated value would be a command
 * injection vector.
 */

const SAFE_REV = /^[A-Za-z0-9._~^/-]+$/;

/**
 * @param {string|undefined|null} raw - e.g. "abc1234~1..abc1234"
 * @returns {string|null} a validated "<from>..<to>" range, or null if raw is missing/malformed
 */
export function parseDiffRange(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  const parts = trimmed.split('..');
  if (parts.length !== 2) return null;
  const [from, to] = parts;
  if (!from || !to) return null;
  if (!SAFE_REV.test(from) || !SAFE_REV.test(to)) return null;
  // Argument injection guard: a leading '-' makes git parse the token as an option
  // (e.g. "--output=...") rather than a revision, even though it matches SAFE_REV.
  if (from.startsWith('-') || to.startsWith('-')) return null;
  return `${from}..${to}`;
}

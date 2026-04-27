/**
 * Canonical SD/QF key extractor for git branch names.
 *
 * Consolidates four prior inline regex sites:
 *   - scripts/modules/handoff/executors/plan-to-exec/gates/branch-enforcement.js
 *   - scripts/modules/claim-health/triangulate.js
 *   - scripts/modules/handoff/cli/cli-main.js
 *   - scripts/modules/scope/scope-gate.js
 *
 * Source-of-truth for SD-LEO-INFRA-PR-TRACKING-BACKFILL-001
 * (FR-4: branch-prefix extraction reuses existing shared helper).
 *
 * Supported branch shapes:
 *   feat/SD-XYZ-001          → { kind: 'SD', key: 'SD-XYZ-001' }
 *   fix/SD-XYZ-002           → { kind: 'SD', key: 'SD-XYZ-002' }
 *   refactor/SD-XYZ-004      → { kind: 'SD', key: 'SD-XYZ-004' }
 *   SD-XYZ-003               → { kind: 'SD', key: 'SD-XYZ-003' }
 *   qf/QF-20260101-001       → { kind: 'QF', key: 'QF-20260101-001' }
 *   quick-fix/QF-...-002     → { kind: 'QF', key: 'QF-20260101-002' }
 *   unprefixed-branch        → null
 *   partial-SD-malformed     → null
 */

// SD keys end in a digit-only segment (3+ digits). Non-greedy extension
// stops at the first such terminal segment, so "SD-XYZ-001-some-slug"
// resolves to "SD-XYZ-001" (not the longer span).
const SD_PATTERN = /SD-(?:[A-Z0-9]+-)*?\d{3,}(?![A-Z0-9])/i;
const QF_PATTERN = /QF-\d{8}-\d{3,}(?![A-Z0-9])/i;

/**
 * Extract the SD or QF key embedded in a branch name.
 *
 * Precedence: SD prefix is checked before QF (an SD key may not contain
 * a QF substring; QF keys never contain the SD- prefix).
 *
 * @param {string} branch - Git branch name (any shape).
 * @returns {{ kind: 'SD'|'QF', key: string }|null} Parsed key, or null when
 *   the branch contains no recognizable key.
 */
export function extractKey(branch) {
  if (!branch || typeof branch !== 'string') return null;

  const sdMatch = branch.match(SD_PATTERN);
  if (sdMatch) {
    return { kind: 'SD', key: sdMatch[0].toUpperCase() };
  }

  const qfMatch = branch.match(QF_PATTERN);
  if (qfMatch) {
    return { kind: 'QF', key: qfMatch[0].toUpperCase() };
  }

  return null;
}

/**
 * Convenience: extract just the key string, or null.
 *
 * @param {string} branch
 * @returns {string|null}
 */
export function extractKeyString(branch) {
  const result = extractKey(branch);
  return result ? result.key : null;
}

export default { extractKey, extractKeyString };

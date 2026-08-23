/**
 * QF Eligibility Preflight — Sensitive Path Registry
 * SD-LEO-INFRA-MINUS-DISPOSITION-RAILS-001 FR-5
 *
 * Deliberately ISOLATED from config/high-risk-files.json + lib/cross-sd-overlap.js's
 * isHighRisk(). That pair is shared by 2 other live handoff gates (plan-to-exec's
 * cross-sd-file-overlap-temporal and lead-final-approval's -ship.js) via an
 * --acknowledge-cross-sd-overlap escape hatch — widening the shared list would silently
 * strip that escape hatch from both unrelated gates. This registry reads nothing from that
 * file and writes nothing to it.
 *
 * Also fixes a defect the shared isHighRisk() carries: no path-separator normalization
 * before matching, so a Windows backslash path silently fails to match a forward-slash glob
 * (fail-open on a migration/gate path on this win32 repo). Mirrors git-operations.js's
 * isFrontendPath, which DOES normalize.
 */
import { minimatch } from 'minimatch';

/**
 * The 7 charter path classes plus database/chairman-gated (measured gap: the shared
 * registry has no .claude/hooks/**, scripts/hooks/**, database/chairman-gated/**, secrets,
 * policy, or publish/deploy patterns).
 */
export const SENSITIVE_PATH_PATTERNS = Object.freeze([
  // migrations
  '**/migrations/**',
  'database/migrations/**',
  // gate-criteria
  '**/gates/**',
  'scripts/modules/handoff/executors/**/gates/**',
  // policy
  '**/policy/**',
  'config/*policy*',
  // hooks (two distinct roots)
  '.claude/hooks/**',
  'scripts/hooks/**',
  // lifecycle-history
  '**/lifecycle-history/**',
  '**/*lifecycle_history*',
  // secrets
  '**/*secret*',
  '.env*',
  // publish/deploy
  '**/publish/**',
  '**/deploy/**',
  '.github/workflows/**',
  // database/chairman-gated (explicit charter addition beyond the 7 named classes)
  'database/chairman-gated/**'
]);

/**
 * True when a file path matches any sensitive pattern, after normalizing Windows backslash
 * separators to forward slashes (the defect the shared isHighRisk() carries).
 */
export function isSensitivePath(filePath, patterns = SENSITIVE_PATH_PATTERNS) {
  if (!filePath || typeof filePath !== 'string') return false;
  const normalized = filePath.replace(/\\/g, '/');
  return patterns.some((p) => minimatch(normalized, p, { dot: true, matchBase: false }));
}

/**
 * Scan a list of changed files for sensitive-path matches.
 * @returns {{sensitive: string[], clean: string[]}}
 */
export function scanForSensitivePaths(filesChanged, patterns = SENSITIVE_PATH_PATTERNS) {
  const sensitive = [];
  const clean = [];
  for (const f of filesChanged || []) {
    if (isSensitivePath(f, patterns)) sensitive.push(f);
    else clean.push(f);
  }
  return { sensitive, clean };
}

/**
 * Build the preflight verdict for a QF's diff, refusing autonomous execution when any
 * changed file matches a sensitive pattern.
 *
 * @param {Object} params
 * @param {string[]} params.filesChanged
 * @param {string} [params.diffSourceTier] - 'branch-diff' | 'working-tree-fallback' | undefined
 * @param {string[]} [params.patterns]
 * @returns {{refused: boolean, sensitiveFiles: string[], diffSourceTier: string|null, reason: string|null}}
 */
export function evaluateQfEligibilityPreflight({ filesChanged, diffSourceTier = null, patterns } = {}) {
  const { sensitive } = scanForSensitivePaths(filesChanged, patterns);
  if (sensitive.length === 0) {
    return { refused: false, sensitiveFiles: [], diffSourceTier, reason: null };
  }
  return {
    refused: true,
    sensitiveFiles: sensitive,
    diffSourceTier,
    reason: `QF_ELIGIBILITY_PREFLIGHT_REFUSED: diff touches ${sensitive.length} sensitive path(s) (${sensitive.join(', ')}) — autonomous execution refused. Diff source: ${diffSourceTier || 'unknown'}.`
  };
}

/**
 * baseline-regression-check.mjs
 *
 * Shared identity-based test-failure regression comparator, used by both
 * scripts/compare-to-main-snapshot.mjs (CI gate, writes+reads snapshots) and
 * scripts/audit-test-failures.mjs --pr-only (the local "reproduce the gate"
 * recipe referenced in the gate's ::error:: annotation) so the two never
 * drift apart.
 *
 * SD-LEO-FIX-COVERAGE-BASELINE-REGRESSION-001 — the count-based comparison
 * this replaces flagged ANY increase in the raw failed-test count as a
 * regression, even when the extra failures were pre-existing/flaky tests in
 * files the PR never touched (observed: PR #5330, 107 unrelated failures
 * across 29 unchanged files). A failure now only counts as a regression when
 * BOTH (a) its test identity was not already failing in the baseline, AND
 * (b) its file is among the files this PR actually changed.
 */
import { execSync } from 'node:child_process';
import { extractFailures } from './vitest-report-parser.mjs';
import { getMainRef } from '../modules/handoff/shared-git-context.js';

export const DIMENSION = 'ci_test_failure_count';
export const TARGET_APP = 'EHG_Engineer';
export const TABLE = 'codebase_health_snapshots';

/** Stable identity string for a failing test: `${file}::${test name}`. */
export function testId(f) {
  return `${f.file}::${f.test}`;
}

/** Failing-test identities for a parsed vitest JSON report (1.x or 3.x+ shape). */
export function extractFailingIds(rawJson) {
  return extractFailures(rawJson).map(testId);
}

/**
 * Files changed on the current branch vs the base ref. Fail-open: returns
 * `{ files: null, error }` on any git failure so callers can degrade
 * gracefully rather than block a PR on a diff-computation hiccup.
 */
export function getChangedFiles({ cwd, baseRef } = {}) {
  try {
    const ref = baseRef || getMainRef({ cwd }).ref;
    const diff = execSync(`git diff --name-only ${ref}...HEAD`, {
      encoding: 'utf8',
      cwd,
      timeout: 10000,
    });
    const files = diff
      .split('\n')
      .map((f) => f.trim())
      .filter(Boolean)
      .map((f) => f.replace(/\\/g, '/'));
    return { files, ref };
  } catch (err) {
    return { files: null, error: err?.message || String(err) };
  }
}

/**
 * Fetch the most recent snapshot recorded for `branch`. Returns null on cold
 * start (no snapshot for this branch yet). `failed_test_ids` is null on
 * legacy snapshots recorded before this field existed — callers must treat
 * that as a fallback signal, not an empty set.
 */
export async function fetchBaselineSnapshot(supabase, branch) {
  const { data, error } = await supabase
    .from(TABLE)
    .select('findings, scanned_at')
    .eq('dimension', DIMENSION)
    .eq('target_application', TARGET_APP)
    .order('scanned_at', { ascending: false })
    .limit(20);
  if (error) throw new Error(`SELECT prior snapshot failed: ${error.message}`);
  for (const row of data || []) {
    const entry = row.findings?.[0];
    if (entry?.branch === branch) {
      return {
        failed_count: Number(entry.failed_count),
        skipped_count: entry.skipped_count == null ? null : Number(entry.skipped_count),
        failed_test_ids: Array.isArray(entry.failed_test_ids) ? entry.failed_test_ids : null,
        scanned_at: row.scanned_at,
      };
    }
  }
  return null;
}

/**
 * Classify current failures against a baseline. See module docstring for the
 * two-condition rule. Falls back to pure count comparison when the baseline
 * predates identity tracking (`baselineIds` null/undefined) so legacy
 * snapshots degrade to the old (still-correct, just coarser) behavior rather
 * than silently disabling the check. When `changedFiles` is null (git diff
 * failed), the reachability condition is skipped rather than the whole
 * regression check — identity-only is still strictly better than count-only.
 */
export function classifyRegressions({ currentFailed, currentIds, baselineFailedCount, baselineIds, changedFiles }) {
  if (!baselineIds) {
    const delta = currentFailed - baselineFailedCount;
    return {
      usedFallback: true,
      newRegressions: [],
      newFailureCount: Math.max(delta, 0),
      isRegression: delta >= 1,
    };
  }
  const baselineSet = new Set(baselineIds);
  const changedSet = changedFiles ? new Set(changedFiles) : null;
  const newRegressions = currentIds.filter((id) => {
    if (baselineSet.has(id)) return false;
    if (!changedSet) return true;
    const file = id.slice(0, id.indexOf('::'));
    return changedSet.has(file);
  });
  return {
    usedFallback: false,
    newRegressions,
    newFailureCount: newRegressions.length,
    isRegression: newRegressions.length > 0,
  };
}

'use strict';

/**
 * Shared identity-diff comparator — SD-LEO-INFRA-COUNT-VS-IDENTITY-GATE-CLASSGUARD-001.
 *
 * Class-guards the recurring "count-delta gate" anti-pattern: a gate that flags on a raw
 * numeric delta (e.g. "failures rose 105 -> 107") rather than checking WHICH specific
 * identities changed. A count-delta gate false-positives on unrelated flaky / CI-secret /
 * shared-DB-drift noise — the SAME test set can produce a higher count on a re-run with no
 * change under test. Instances already confirmed: scripts/ci/red-merge-detector.mjs,
 * scripts/compare-to-main-snapshot.mjs (BASELINE_REGRESSION), scripts/hooks/compare-test-baseline.cjs.
 *
 * Shaped as a DROP-IN SUPERSET of QF-20260701-833's inline primitive (compare-to-main-snapshot.mjs,
 * unmerged branch qf/QF-20260701-833) so that gate and red-merge-detector.mjs can adopt this shared
 * module later with zero behavior change, instead of drifting as separate reimplementations.
 */

/**
 * PURE. Decide whether a regression occurred, comparing the SET of currently-failing identities
 * against the SET of identities that were already failing at the baseline — not the raw counts.
 * Only identities present in currentIds but ABSENT from priorFailingIds are a genuine regression.
 *
 * Falls back to a count-only comparison ONLY when priorFailingIds is unavailable (a base snapshot
 * predating identity capture) — the same graceful-degradation QF-833 uses, so an older baseline
 * never silently stops being checked.
 *
 * @param {string[]} currentIds - failing identities on the current run (see extractFailingIds)
 * @param {string[]|null|undefined} priorFailingIds - failing identities recorded at the baseline
 * @param {{failed?:number, priorFailedCount?:number}} [counts] - only used for the fallback mode
 * @returns {{regression:boolean, newIds:string[], mode:'identity'|'count_fallback'}}
 */
function computeIdentityRegression(currentIds, priorFailingIds, counts = {}) {
  const current = Array.isArray(currentIds) ? currentIds : [];
  if (!Array.isArray(priorFailingIds)) {
    const failed = Number.isFinite(counts.failed) ? counts.failed : current.length;
    const priorFailedCount = Number.isFinite(counts.priorFailedCount) ? counts.priorFailedCount : 0;
    const regression = failed > priorFailedCount;
    return { regression, newIds: regression ? current : [], mode: 'count_fallback' };
  }
  const priorSet = new Set(priorFailingIds);
  const newIds = current.filter((id) => !priorSet.has(id));
  return { regression: newIds.length > 0, newIds, mode: 'identity' };
}

/**
 * PURE. Walks a vitest JSON report's testResults[].assertionResults[] and returns a stable
 * file::fullName identity per failing test. Matches QF-20260701-833's extractFailingIds shape.
 * @param {object} raw - a parsed vitest --reporter=json output object
 * @returns {string[]}
 */
function extractFailingIds(raw) {
  const testResults = (raw && Array.isArray(raw.testResults)) ? raw.testResults : [];
  const ids = [];
  for (const file of testResults) {
    const assertions = Array.isArray(file.assertionResults) ? file.assertionResults : [];
    for (const a of assertions) {
      if (a.status !== 'failed') continue;
      const filePath = file.name || file.file || '';
      const fullName = a.fullName || a.title || '';
      ids.push(`${filePath}::${fullName}`);
    }
  }
  return ids;
}

/**
 * PURE. The diff-reachability half QF-833 does NOT implement: narrows newIds to only those
 * whose file:: prefix is present in changedFiles — a genuinely new failure that isn't even in a
 * file the current diff touches is very unlikely to be caused by the change under test.
 * @param {string[]} newIds - identities from computeIdentityRegression's newIds
 * @param {string[]} changedFiles - file paths touched by the current diff
 * @returns {string[]}
 */
function filterReachable(newIds, changedFiles) {
  const ids = Array.isArray(newIds) ? newIds : [];
  const changed = new Set(Array.isArray(changedFiles) ? changedFiles : []);
  if (changed.size === 0) return ids;
  return ids.filter((id) => {
    const filePath = id.split('::')[0];
    return changed.has(filePath);
  });
}

module.exports = { computeIdentityRegression, extractFailingIds, filterReachable };

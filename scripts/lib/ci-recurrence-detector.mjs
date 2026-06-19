/**
 * CI-failure recurrence detector (pure, no IO).
 * SD-LEO-INFRA-CI-FAILURE-AUTOTRIAGE-LOOP-001 (FR-1/FR-5).
 *
 * Given the OPEN ci_failure rows (feedback rows, category='ci_failure', already
 * filtered by the caller to status IN ('new','triaged','in_progress') — which
 * structurally excludes the self-healed rows auto-resolve-recovered closes), this
 * clusters them by class signature and returns the chronic, NOT-yet-covered classes
 * that warrant a DRAFT corrective SD. It never decides to fix anything — it only
 * identifies which recurring failure CLASSES need a work item sourced.
 *
 * Class signature: the upstream error_hash (SHA256(workflow_name:branch)) IS the
 * stable per-class key gh-failure-monitor already computes; fall back to
 * repo:workflow_name when error_hash is absent.
 */

export const DEFAULT_THRESHOLD = 3;
export const DEFAULT_PER_RUN_CAP = 3;
export const DEFAULT_PER_DAY_CAP = 10;

// Resolution types auto-resolve-recovered sets on self-healed rows — never source these.
const SELF_HEAL_RESOLUTION_TYPES = ['auto_resolved', 'pr_merged_moot', 'workflow_unhealthy'];

export function classSignature(row) {
  const meta = (row && row.metadata) || {};
  if (row && row.error_hash) return String(row.error_hash);
  return `${meta.repo || '?'}:${meta.workflow_name || '?'}`;
}

/** A row is self-healed/resolved if it is already resolved or carries a self-heal resolution_type. */
export function isSelfHealedOrResolved(row) {
  if (!row) return false;
  if (row.status === 'resolved') return true;
  return SELF_HEAL_RESOLUTION_TYPES.includes(row.resolution_type);
}

/** A row is already covered if it links to a corrective SD (either linkage column). */
export function isCovered(row) {
  return Boolean(row && (row.strategic_directive_id || row.resolution_sd_id));
}

/**
 * Cluster open ci_failure rows into chronic, uncovered candidate classes.
 * @param {Array} rows - feedback rows (caller pre-filters to open ci_failure)
 * @param {{threshold?:number}} opts
 * @returns {Array<{classSignature, representativeId, rowIds, occurrenceTotal, workflow_name, repo, sampleError}>}
 */
export function detectChronicClasses(rows, { threshold = DEFAULT_THRESHOLD } = {}) {
  const groups = new Map();
  for (const row of rows || []) {
    if (isSelfHealedOrResolved(row)) continue; // belt-and-suspenders vs the status pre-filter
    const sig = classSignature(row);
    if (!groups.has(sig)) groups.set(sig, []);
    groups.get(sig).push(row);
  }

  const candidates = [];
  for (const [sig, classRows] of groups) {
    // Covered if ANY row in the class already links to a corrective SD → never double-source.
    if (classRows.some(isCovered)) continue;
    // Chronic by total occurrences (occurrence_count already dedups repeat failures per row).
    const occurrenceTotal = classRows.reduce((n, r) => n + (Number(r.occurrence_count) || 1), 0);
    if (occurrenceTotal < threshold) continue;
    // Representative = oldest row (stable, deterministic).
    const rep = classRows.slice().sort(
      (a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0)
    )[0];
    const meta = (rep && rep.metadata) || {};
    candidates.push({
      classSignature: sig,
      representativeId: rep.id,
      rowIds: classRows.map((r) => r.id),
      occurrenceTotal,
      workflow_name: meta.workflow_name || null,
      repo: meta.repo || null,
      sampleError: rep.error_message || null,
    });
  }

  // Deterministic: most-recurring class first, then by signature.
  candidates.sort(
    (a, b) =>
      b.occurrenceTotal - a.occurrenceTotal ||
      (a.classSignature < b.classSignature ? -1 : a.classSignature > b.classSignature ? 1 : 0)
  );
  return candidates;
}

/**
 * Anti-spam cap: never source more than perRunCap this run, nor exceed perDayCap across the day.
 * @param {Array} candidates - from detectChronicClasses (already sorted by priority)
 * @param {{perRunCap?:number, sourcedToday?:number, perDayCap?:number}} opts
 */
export function applyCaps(candidates, { perRunCap = DEFAULT_PER_RUN_CAP, sourcedToday = 0, perDayCap = DEFAULT_PER_DAY_CAP } = {}) {
  const remainingDay = Math.max(0, perDayCap - (Number(sourcedToday) || 0));
  const limit = Math.min(perRunCap, remainingDay);
  return (candidates || []).slice(0, Math.max(0, limit));
}

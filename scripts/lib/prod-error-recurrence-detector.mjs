/**
 * Production-error recurrence detector (pure, no IO).
 * SD-LEO-INFRA-PROD-ERROR-SWEEP-LOOP-001 (FR-1/FR-3/FR-5).
 *
 * The sibling of scripts/lib/ci-recurrence-detector.mjs, but the source signal is
 * system_alerts (each row carrying metadata.break_class, written by the production
 * breakage-detector family) instead of ci_failure feedback rows.
 *
 * Given the unresolved, windowed system_alerts rows (the caller filters resolved_at IS NULL
 * and created_at >= window-start), this clusters them by the (break_class, source) tuple and
 * returns the chronic, NOT-yet-covered classes that warrant ONE DRAFT corrective SD. It never
 * decides to FIX anything and never resolves an alert — it only identifies which recurring
 * breakage CLASSES need a work item sourced (CONST-002; diagnosis happens when a worker picks
 * the DRAFT SD up, NOT here). The module exposes ONLY read/classify pure functions — no
 * resolve/update/fix capability exists here by construction (the no-auto-fix boundary).
 *
 * Class key: `${break_class}::${source}` — the (break_class, source) grouping FR-1 specifies.
 * Only break_class values that are members of the FROZEN break-class taxonomy denominator are
 * considered (the caller passes the legal set); unknown classes are ignored.
 */

export const DEFAULT_THRESHOLD = 3;
export const DEFAULT_PER_RUN_CAP = 3;
export const DEFAULT_PER_DAY_CAP = 10;
export const DEFAULT_WINDOW_HOURS = 24;

/** The class key for an alert: the (break_class, source) tuple FR-1 groups by. */
export function classKey(breakClass, source) {
  return `${breakClass || '?'}::${source || '?'}`;
}

/** Read an alert's break_class from metadata (the canonical encoding the detector reads back). */
export function alertBreakClass(alert) {
  const meta = (alert && alert.metadata) || {};
  return meta.break_class || null;
}

/** Read an alert's source (source_service is the canonical column; metadata.source is a fallback). */
export function alertSource(alert) {
  if (!alert) return null;
  const meta = alert.metadata || {};
  return alert.source_service || meta.source || null;
}

/**
 * Bridge-row statuses that mean "already surfaced for human triage" — a class with an OPEN bridge
 * row in one of these statuses has already been raised into the inbox (e.g. its corrective SD was
 * guardrail-blocked at creation, so it sits awaiting a human who can provide the required review).
 * Re-surfacing it would spam the inbox, so it counts as handled.
 */
export const BRIDGE_HANDLED_STATUSES = Object.freeze(['new', 'triaged']);

/**
 * Build the set of COVERED class keys from the open production_error bridge feedback rows.
 * Mirrors the ci-autotriage coverage model: a class is covered when an OPEN bridge row for it
 * still links to a corrective SD. The caller is expected to have already applied stripDeadLinks
 * (clearing links to TERMINAL SDs) so a stale CANCELLED link cannot immortalize a class — here
 * a row only counts as coverage when isLinked(row) is still true after that stripping.
 *
 * @param {Array} bridgeRows - feedback rows (category='production_error'); each carries
 *   metadata.break_class + metadata.alert_source and the linkage columns.
 * @param {(row:any)=>boolean} isLinked - the ci-recurrence-detector isCovered predicate.
 * @returns {Set<string>} covered class keys
 */
export function coveredClassKeys(bridgeRows, isLinked) {
  const covered = new Set();
  for (const row of bridgeRows || []) {
    if (!isLinked(row)) continue;
    const meta = (row && row.metadata) || {};
    if (!meta.break_class) continue;
    covered.add(classKey(meta.break_class, meta.alert_source));
  }
  return covered;
}

/**
 * Build the set of HANDLED class keys — the superset of coverage the loop uses to decide which
 * classes to skip. A class is handled when an OPEN bridge row for it either:
 *   (a) still links to a non-terminal corrective SD after stripDeadLinks (isLinked true) — COVERED, or
 *   (b) sits in a still-untriaged status (new/triaged) — ALREADY SURFACED, awaiting human triage
 *       (e.g. its SD creation was guardrail-blocked, so the bridge row is the durable inbox record).
 *
 * The ONLY case that stays re-sourceable is a bridge row that WAS linked but whose SD has since gone
 * terminal: stripDeadLinks clears its link (isLinked false) and its status is no longer new/triaged
 * (createFromFeedback advanced it to in_progress when it linked) — so it is neither (a) nor (b) and
 * the class can be sourced again. This preserves FR-3's re-source-on-cancel while preventing the
 * inbox spam a guardrail-blocked class would otherwise cause every tick.
 *
 * @param {Array} bridgeRows - feedback rows (post stripDeadLinks)
 * @param {(row:any)=>boolean} isLinked - the ci-recurrence-detector isCovered predicate
 * @returns {Set<string>} handled class keys
 */
export function handledClassKeys(bridgeRows, isLinked) {
  const handled = new Set();
  for (const row of bridgeRows || []) {
    const meta = (row && row.metadata) || {};
    if (!meta.break_class) continue;
    const isHandled = isLinked(row) || BRIDGE_HANDLED_STATUSES.includes(row && row.status);
    if (isHandled) handled.add(classKey(meta.break_class, meta.alert_source));
  }
  return handled;
}

/**
 * Cluster unresolved windowed system_alerts into chronic, uncovered candidate classes.
 *
 * @param {Array} alerts - system_alerts rows (caller pre-filters to unresolved + in-window)
 * @param {Object} opts
 * @param {number} [opts.threshold] - min occurrences for a class to be chronic
 * @param {Set<string>|string[]} [opts.legalClasses] - the FROZEN break-class set; alerts whose
 *        break_class is not a member are ignored (no legalClasses => accept any non-empty class)
 * @param {Set<string>|string[]} [opts.coveredKeys] - class keys already covered by an open SD
 * @returns {Array<{classKey, breakClass, source, representativeId, alertIds, occurrenceTotal, sampleTitle, sampleMessage, severity}>}
 */
export function detectRecurringClasses(alerts, { threshold = DEFAULT_THRESHOLD, legalClasses = null, coveredKeys = null } = {}) {
  const legal = legalClasses == null ? null : new Set(legalClasses);
  const covered = coveredKeys == null ? new Set() : new Set(coveredKeys);

  const groups = new Map();
  for (const alert of alerts || []) {
    const bc = alertBreakClass(alert);
    if (!bc) continue; // no class encoding => cannot route
    if (legal && !legal.has(bc)) continue; // outside the frozen taxonomy => ignore
    const src = alertSource(alert);
    const key = classKey(bc, src);
    if (!groups.has(key)) groups.set(key, { breakClass: bc, source: src, rows: [] });
    groups.get(key).rows.push(alert);
  }

  const candidates = [];
  for (const [key, group] of groups) {
    if (covered.has(key)) continue; // already covered by an open corrective SD => never double-source
    const rows = group.rows;
    if (rows.length < threshold) continue; // not chronic
    // Representative = oldest alert (stable, deterministic).
    const rep = rows.slice().sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0))[0];
    candidates.push({
      classKey: key,
      breakClass: group.breakClass,
      source: group.source,
      representativeId: rep.id,
      alertIds: rows.map((r) => r.id),
      occurrenceTotal: rows.length,
      sampleTitle: rep.title || null,
      sampleMessage: rep.message || null,
      severity: rep.severity || null,
    });
  }

  // Deterministic: most-recurring class first, then by key.
  candidates.sort(
    (a, b) =>
      b.occurrenceTotal - a.occurrenceTotal ||
      (a.classKey < b.classKey ? -1 : a.classKey > b.classKey ? 1 : 0)
  );
  return candidates;
}

/**
 * Anti-spam cap: never source more than perRunCap this run, nor exceed perDayCap across the day.
 * Identical contract to ci-recurrence-detector applyCaps.
 */
export function applyCaps(candidates, { perRunCap = DEFAULT_PER_RUN_CAP, sourcedToday = 0, perDayCap = DEFAULT_PER_DAY_CAP } = {}) {
  const remainingDay = Math.max(0, perDayCap - (Number(sourcedToday) || 0));
  const limit = Math.min(perRunCap, remainingDay);
  return (candidates || []).slice(0, Math.max(0, limit));
}

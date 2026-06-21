/**
 * Dependency-readiness predicate for the coordinator audit (SD-REFILL-00V80FV3).
 *
 * Semantic split: a dependency is SATISFIED only when its work is actually DELIVERED
 * (status 'completed' or 'archived'). The lifecycle-TERMINAL set additionally includes
 * 'deferred' and 'cancelled' — those exclude an SD from the audit's active-SD list, but a
 * dependency in those states is NOT delivered, so a dependent blocked on it is genuinely
 * blocked (not dep-satisfied / stale-blocked). Counting deferred/cancelled deps as satisfied
 * mis-reported the coordinator blocked-vs-ready gauges.
 *
 * Pure + total: no DB/clock/fs; never throws on odd input.
 */

/** Dependency statuses that mean the depended-upon work was actually DELIVERED. */
export const DEP_SATISFIED = ['completed', 'archived'];

/**
 * Is a single dependency satisfied (delivered)? Unknown/missing/deferred/cancelled -> false.
 * @param {string|undefined|null} status
 * @returns {boolean}
 */
export function isDepSatisfied(status) {
  return DEP_SATISFIED.includes(status);
}

/**
 * Is a dependent SD blocked? Blocked iff it has at least one dependency whose status is not
 * delivered (not in DEP_SATISFIED). A dependent with no dependencies is never blocked.
 * @param {Array<string>} depKeys     resolved SD-key dependencies of the dependent
 * @param {Record<string,string>} statusByKey   sd_key -> status map (missing keys => unmet)
 * @returns {boolean}
 */
export function isDependentBlocked(depKeys, statusByKey) {
  if (!Array.isArray(depKeys) || depKeys.length === 0) return false;
  const map = statusByKey && typeof statusByKey === 'object' ? statusByKey : {};
  return depKeys.some((k) => !isDepSatisfied(map[k]));
}

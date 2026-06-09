/**
 * lib/sd-baseline/deps-resolve.js
 *
 * SD-LEO-INFRA-FIX-NEXT-CANDIDATES-001
 *
 * Pure JS mirror of the v_sd_next_candidates.deps_satisfied SQL logic
 * (migration 20260608_fix_baseline_sync_sdkey_and_deps_satisfied.sql, part B).
 * Kept in lockstep with the SQL so the dependency-shape semantics are unit-
 * testable network-free. If you change one, change the other (TS-2 guards this).
 *
 * Element-shape resolution (must match the SQL CROSS JOIN LATERAL ref):
 *   - string  -> first space-delimited token  ("SD-X (foundational)" -> "SD-X")
 *   - object  -> sd_key ?? sd_id ?? orchestrator
 *   - other   -> null
 *
 * A dependency BLOCKS (makes deps_satisfied=false) ONLY when its ref resolves to
 * a real, KNOWN strategic directive (by sd_key or id) that is NOT completed.
 * none / null / empty / prose / unresolvable refs are treated as satisfied
 * (fail-open), preserving the prior COALESCE(count(*)=0, true) intent.
 */

/**
 * Resolve one dependency-snapshot element to its SD reference string.
 * @param {*} element - a jsonb array element (string | object | other)
 * @returns {string|null} the resolved ref, or null if unresolvable
 */
export function resolveDepRef(element) {
  if (typeof element === 'string') {
    const token = element.trim().split(' ')[0];
    return token || null;
  }
  if (element && typeof element === 'object' && !Array.isArray(element)) {
    return element.sd_key ?? element.sd_id ?? element.orchestrator ?? null;
  }
  return null;
}

/**
 * @param {*} snapshot - dependencies_snapshot (expected array; anything else => [])
 * @param {(ref:string)=>('completed'|'incomplete'|null)} lookup
 *        Resolves a ref to the referenced SD's completion state, or null if the
 *        ref matches NO known SD (by sd_key or id).
 * @returns {boolean} deps_satisfied
 */
export function computeDepsSatisfied(snapshot, lookup) {
  const arr = Array.isArray(snapshot) ? snapshot : [];
  for (const el of arr) {
    const ref = resolveDepRef(el);
    if (ref == null) continue;                  // unresolvable / prose -> satisfied
    if (String(ref).toLowerCase() === 'none') continue; // explicit no-dep
    if (lookup(ref) === 'incomplete') return false;     // real, known, not-completed -> blocks
    // completed or unknown(null) -> not blocking (fail-open)
  }
  return true;
}

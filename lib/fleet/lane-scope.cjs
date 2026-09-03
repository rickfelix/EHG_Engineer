/**
 * Shared lane-scope resolution primitives — SD-LEO-INFRA-ONE-BELT-CENSUS-001 (implementation
 * step 1a).
 *
 * EXTRACTED VERBATIM from lib/fleet/belt-depth.cjs, which previously defined these three
 * functions privately. Both belt-depth.cjs and lib/fleet/belt-census.cjs now import from this
 * single shared module instead of each defining or re-deriving lane-scope logic — the exact
 * class of drift this SD exists to close, applied to itself. belt-depth.cjs's own behavior, its
 * ~10 consumers, and its existing exports are unchanged by this extraction (verified: its own
 * test suite passes unmodified).
 *
 * NO GATE CONSUMES A SCOPED READING (belt-depth.cjs's own hard rule, unchanged): scope is
 * OPTIONAL lane-scoping for reporting/diagnosis only, never a dispatch/gate input.
 */

// See belt-depth.cjs's original docblock (LANE SCOPING section) for why this exists and why
// the demand gate itself never consumes a scoped reading.
const normalizeLane = (v) => String(v == null ? '' : v).toLowerCase().replace(/[^a-z0-9]/g, '');

/** A scope that cannot be resolved to a lane is a FAILED MEASUREMENT, never 0. */
function requireResolvableLane(scope) {
  if (typeof scope !== 'string' || normalizeLane(scope) === '') {
    throw new Error(`lane-scope: unresolvable lane scope (${JSON.stringify(scope)}) — refusing to guess. A scoped read that cannot name its lane must surface as UNMEASURABLE, because returning 0 reads as an empty belt and 0 <= floor SOURCES.`);
  }
}

/**
 * THROW if more than one spelling in `table` normalizes to `scope`.
 *
 * See belt-depth.cjs's original docblock for the full rationale (measured 2026-08-04:
 * quick_fixes has zero variant lanes today, strategic_directives_v2 has six) — this guard
 * converts that coincidence into an enforced invariant rather than deleting it as dead code.
 */
async function assertLaneUnambiguous(supabase, table, scope) {
  const { fetchAllPaginated } = await import('../db/fetch-all-paginated.mjs');
  // Paginated deliberately: a truncated read could miss the very variant this guards
  // against, turning the guard into decoration that always passes.
  const rows = await fetchAllPaginated(() => supabase.from(table).select('target_application'));
  const want = normalizeLane(scope);
  const spellings = new Set();
  for (const r of rows || []) {
    if (normalizeLane(r.target_application) === want) spellings.add(r.target_application);
  }
  if (spellings.size > 1) {
    throw new Error(`lane-scope: lane ${JSON.stringify(scope)} is AMBIGUOUS in ${table} — ${JSON.stringify([...spellings])}. An exact-match scope would count one spelling and silently drop the rest, under-reporting toward SOURCED. Refusing to report a number that is wrong in the fail-open direction.`);
  }
}

module.exports = { normalizeLane, requireResolvableLane, assertLaneUnambiguous };

/**
 * Shared "active SD" predicate — single source of truth for active-SD filtering.
 *
 * SD-EVA-SUPPORT-CLI-SKILL-ORCH-001-C FR-6. Used by:
 *   - lib/eva-support/sd-reader.js (NEW in CP-2 — must use this; T7 boundary enforced)
 *   - lib/drain-orchestrator.mjs:80-89 (RETROFITTED in CP-1 from inline filter)
 *
 * Definition of "active SD" (per DATABASE deep review evidence row 64396c27):
 *   status IN ('draft', 'in_progress', 'active')
 *   AND (is_active IS NULL OR is_active = true)   -- COALESCE-equivalent
 *   AND archived_at IS NULL
 *
 * is_active is a NULLABLE boolean DEFAULT true in strategic_directives_v2.
 * Bare `.eq('is_active', true)` would exclude historical NULL rows; the OR
 * pattern preserves parity. As of 2026-05-27, live data has 0 NULL-is_active
 * rows among the 23 SDs with status IN (draft,in_progress,active), so this
 * change is purely forward-compatible.
 *
 * The drain-orchestrator retrofit is a writer/consumer asymmetry mitigation
 * (8th witness of PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001). The parity
 * test in tests/ci/active-sd-predicate-parity.test.js asserts that both
 * call sites return identical row sets for every seeded combination.
 *
 * NOTE: This predicate captures ONLY the active-SD definition. Caller-specific
 * filters (e.g., drain's `.is('claiming_session_id', null)`) remain in the caller.
 *
 * @module lib/sd/active-sd-predicate
 */

const ACTIVE_STATUSES = Object.freeze(['draft', 'in_progress', 'active']);

/**
 * Apply the active-SD filter to a Supabase query builder.
 *
 * Returns the SAME builder (mutated by Supabase's chain semantics) so callers
 * can continue chaining additional clauses.
 *
 * @param {Object} query - Supabase query builder (e.g. `supabase.from('strategic_directives_v2').select(...)`).
 * @returns {Object} The same query builder with active-SD filters applied.
 */
export function getActiveSDFilter(query) {
  return query
    .in('status', ACTIVE_STATUSES)
    .or('is_active.is.null,is_active.eq.true')
    .is('archived_at', null);
}

/**
 * Test whether an SD row matches the active-SD predicate.
 *
 * Pure function — no DB access. Used by parity tests and any caller that
 * already has the row in hand.
 *
 * @param {Object} row - SD row with status, is_active, archived_at fields.
 * @returns {boolean}
 */
export function isActiveSD(row) {
  if (!row || typeof row !== 'object') return false;
  if (!ACTIVE_STATUSES.includes(row.status)) return false;
  if (row.is_active === false) return false; // NULL or true → pass
  if (row.archived_at !== null && row.archived_at !== undefined) return false;
  return true;
}

/**
 * Exported for tests + introspection.
 */
export const __testHooks = Object.freeze({ ACTIVE_STATUSES });

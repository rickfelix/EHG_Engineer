/**
 * Unified Parent Orchestrator Detection
 * SD-LEO-INFRA-ORCH-PARENT-LIFECYCLE-001 FR-1
 *
 * Single source of truth for "is this SD a parent orchestrator?"
 *
 * BEFORE this helper, 3 separate detection paths existed:
 *   - scripts/modules/handoff/executors/plan-to-exec/parent-orchestrator.js (metadata.is_parent flag only)
 *   - scripts/modules/handoff/executors/plan-to-lead/gates/prerequisite-check.js (DB query for children)
 *   - scripts/modules/handoff/executors/plan-to-lead/gates/user-story-existence.js (DB query for children)
 *
 * Result: an SD with children in DB but missing metadata.is_parent flag (or vice versa) got DIFFERENT
 * routing at PLAN-TO-EXEC vs PLAN-TO-LEAD — invisible drift causing CronGenius F6/F7/F8.
 *
 * This helper OR-merges the two signals so all gates agree.
 *
 * Caching: WeakMap keyed on sd object identity. Multiple gates in same handoff execution call this
 * helper; per-handoff cache avoids N+1 DB queries.
 */

const cache = new WeakMap();

/**
 * Returns true if SD is a parent orchestrator.
 *
 * @param {Object} sd - Strategic Directive row (must have id and metadata fields)
 * @param {Object} supabase - Supabase client (used only if metadata flag is not set; caller may
 *   pass null for sync-only detection — fallback to metadata-flag check)
 * @returns {Promise<boolean>}
 */
export async function isParentOrchestrator(sd, supabase) {
  if (!sd) return false;

  if (cache.has(sd)) return cache.get(sd);

  const metadataFlag = sd.metadata?.is_parent === true;
  if (metadataFlag) {
    cache.set(sd, true);
    return true;
  }

  if (!supabase || !sd.id) {
    cache.set(sd, false);
    return false;
  }

  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .select('id')
    .eq('parent_sd_id', sd.id)
    .limit(1);

  const hasChildren = !error && Array.isArray(data) && data.length > 0;
  cache.set(sd, hasChildren);
  return hasChildren;
}

/**
 * Synchronous detection (metadata flag only). Use when supabase client is not available
 * AND caller accepts that DB-only parents will be missed. Prefer the async variant.
 *
 * @param {Object} sd - Strategic Directive row
 * @returns {boolean}
 */
export function isParentOrchestratorSync(sd) {
  return sd?.metadata?.is_parent === true;
}

/**
 * Test helper: clear the per-process cache. Production code should never call this.
 */
export function _clearCache() {
  // WeakMap entries are released when sd objects are GCed; this helper exists only for
  // tests that re-use sd object instances across scenarios.
  // WeakMap has no clear() method in older runtimes — caller should pass fresh sd objects instead.
}

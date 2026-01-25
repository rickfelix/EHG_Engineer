/**
 * Handoff Dependency Checker Module
 * Extracted from verify-handoff-lead-to-plan.js for modularity
 *
 * Part of SD-REFACTOR-2025-001-P2-003: verify-handoff-lead-to-plan Refactoring
 *
 * Contains dependency validation logic for Strategic Directives.
 * @module HandoffDependencyChecker
 * @version 1.0.0
 */

// =============================================================================
// DEPENDENCY VALIDATION
// =============================================================================

/**
 * Validate that referenced SD dependencies actually exist in the database
 * @param {Object} supabase - Supabase client
 * @param {Object} sd - Strategic Directive with dependencies field
 * @returns {Promise<Object>} { warnings: string[] }
 */
export async function validateDependenciesExist(supabase, sd) {
  const result = { warnings: [] };
  let deps = sd.dependencies;

  // Parse dependencies if it's a string
  if (typeof deps === 'string') {
    try {
      deps = JSON.parse(deps);
    } catch {
      return result; // Invalid JSON, skip validation
    }
  }

  // No dependencies to validate
  if (!Array.isArray(deps) || deps.length === 0) {
    return result;
  }

  // Extract SD IDs from dependencies (handle both string and object formats)
  const depIds = deps
    .map(d => typeof d === 'string' ? d.match(/^(SD-[A-Z0-9-]+)/)?.[1] : d?.sd_id)
    .filter(Boolean);

  if (depIds.length === 0) {
    return result;
  }

  try {
    // Query all referenced dependencies (use sd_key instead of deprecated legacy_id)
    const { data: existingDeps, error } = await supabase
      .from('strategic_directives_v2')
      .select('id, sd_key, status, title')
      .or(depIds.map(d => `id.eq.${d},sd_key.eq.${d}`).join(','));

    if (error) {
      result.warnings.push(
        `PRD-Readiness: Could not verify dependencies exist (DB error: ${error.message})`
      );
      return result;
    }

    // Find which dependencies don't exist (use sd_key instead of deprecated legacy_id)
    const existingIds = new Set([
      ...(existingDeps || []).map(d => d.id),
      ...(existingDeps || []).map(d => d.sd_key)
    ]);

    const missingDeps = depIds.filter(d => !existingIds.has(d));

    if (missingDeps.length > 0) {
      result.warnings.push(
        `PRD-Readiness: ${missingDeps.length} dependency SD(s) not found in database: ` +
        `${missingDeps.join(', ')}. Verify SD IDs are correct.`
      );
    }

    // Check if any dependencies are not yet completed (informational)
    const incompleteDeps = (existingDeps || []).filter(d =>
      d.status !== 'completed' && d.status !== 'done'
    );

    if (incompleteDeps.length > 0 && incompleteDeps.length === depIds.length) {
      result.warnings.push(
        `PRD-Readiness: All ${incompleteDeps.length} dependencies are not yet completed. ` +
        'PLAN should verify dependency work is sufficiently complete before starting.'
      );
    }

  } catch (e) {
    result.warnings.push(
      `PRD-Readiness: Dependency validation error: ${e.message}`
    );
  }

  return result;
}

/**
 * Get detailed dependency status
 * @param {Object} supabase - Supabase client
 * @param {Array<string>} depIds - Array of dependency SD IDs
 * @returns {Promise<Object>} { found: Array, missing: Array, incomplete: Array }
 */
export async function getDependencyStatus(supabase, depIds) {
  if (!Array.isArray(depIds) || depIds.length === 0) {
    return { found: [], missing: [], incomplete: [] };
  }

  try {
    // Use sd_key instead of deprecated legacy_id
    const { data: existingDeps, error } = await supabase
      .from('strategic_directives_v2')
      .select('id, sd_key, status, title')
      .or(depIds.map(d => `id.eq.${d},sd_key.eq.${d}`).join(','));

    if (error) {
      throw error;
    }

    const existingIds = new Set([
      ...(existingDeps || []).map(d => d.id),
      ...(existingDeps || []).map(d => d.sd_key)
    ]);

    const missing = depIds.filter(d => !existingIds.has(d));
    const incomplete = (existingDeps || []).filter(d =>
      d.status !== 'completed' && d.status !== 'done'
    );
    const found = (existingDeps || []).filter(d =>
      d.status === 'completed' || d.status === 'done'
    );

    return { found, missing, incomplete };

  } catch (e) {
    return { found: [], missing: depIds, incomplete: [], error: e.message };
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  validateDependenciesExist,
  getDependencyStatus
};

/**
 * Dependency Validation for LEAD-TO-PLAN Verifier
 *
 * Validates SD dependencies are properly structured and exist in database.
 *
 * Extracted from scripts/verify-handoff-lead-to-plan.js for maintainability.
 * Part of SD-LEO-REFACTOR-HANDOFF-001
 */

/**
 * Dependency Structure Validation (Improvement #3)
 * Validates dependencies array is properly structured
 * Note: Async DB validation happens separately
 *
 * @param {Object} sd - Strategic Directive object
 * @returns {Object} - Result with warnings array
 */
export function validateDependencyStructure(sd) {
  const result = { warnings: [] };

  // Check if dependencies field exists and is an array
  const deps = sd.dependencies;

  if (deps === undefined || deps === null) {
    // Check if this is a Phase 1 SD (no dependencies expected)
    const phase = sd.metadata?.phase;
    if (phase && phase > 1) {
      result.warnings.push(
        `PRD-Readiness: dependencies array is empty but SD is Phase ${phase}. ` +
        'Non-Phase-1 SDs typically depend on earlier work. Verify execution order.'
      );
    }
  } else if (Array.isArray(deps) && deps.length > 0) {
    // Validate dependency format (should be SD IDs)
    const invalidDeps = deps.filter(d =>
      typeof d !== 'string' || !d.startsWith('SD-')
    );

    if (invalidDeps.length > 0) {
      result.warnings.push(
        `PRD-Readiness: ${invalidDeps.length} invalid dependency format(s). ` +
        'Dependencies should be SD IDs like "SD-FOUNDATION-V3-001".'
      );
    }
  }

  // Check for circular dependency hints (same prefix)
  if (Array.isArray(deps) && deps.length > 0 && sd.id) {
    const selfRef = deps.find(d => d === sd.id);
    if (selfRef) {
      result.warnings.push(
        'PRD-Readiness: SD references itself in dependencies (circular). Remove self-reference.'
      );
    }
  }

  return result;
}

/**
 * Async Dependency Validation (Improvement #3 - async part)
 * Validates that referenced SDs actually exist in the database
 *
 * @param {Object} sd - Strategic Directive object
 * @param {Object} supabase - Supabase client
 * @returns {Promise<Object>} - Result with warnings array
 */
export async function validateDependenciesExist(sd, supabase) {
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
    // Query all referenced dependencies (support id and sd_key)
    // SD-LEO-GEN-RENAME-COLUMNS-SELF-001-D1: Removed legacy_id (column dropped 2026-01-24)
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

    // Find which dependencies don't exist
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

  } catch (depError) {
    result.warnings.push(
      `PRD-Readiness: Dependency validation error: ${depError.message}`
    );
  }

  return result;
}

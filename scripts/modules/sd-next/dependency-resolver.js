/**
 * Dependency Resolution for SD-Next
 * Part of SD-LEO-REFACTOR-SD-NEXT-001
 */

/**
 * Parse dependencies from various formats
 *
 * @param {string|Array} dependencies - Dependencies in string or array format
 * @returns {Array} Array of {sd_id, resolved} objects
 */
export function parseDependencies(dependencies) {
  if (!dependencies) return [];

  let deps = [];
  if (typeof dependencies === 'string') {
    try {
      deps = JSON.parse(dependencies);
    } catch {
      return [];
    }
  } else if (Array.isArray(dependencies)) {
    deps = dependencies;
  }

  // Only return entries that are actual SD references (SD-XXX format)
  // Ignore text descriptions of prerequisites
  return deps
    .map(dep => {
      if (typeof dep === 'string') {
        // Parse "SD-XXX (description)" format
        const match = dep.match(/^(SD-[A-Z0-9-]+)/);
        if (match) {
          return { sd_id: match[1], resolved: false };
        }
        // Not an SD reference - skip it
        return null;
      }
      // Object format with sd_id field
      if (dep.sd_id && dep.sd_id.match(/^SD-[A-Z0-9-]+/)) {
        return { sd_id: dep.sd_id, resolved: false };
      }
      return null;
    })
    .filter(Boolean); // Remove nulls
}

/**
 * Check if all dependencies are resolved
 *
 * @param {Object} supabase - Supabase client
 * @param {string|Array} dependencies - Dependencies to check
 * @returns {Promise<boolean>} True if all dependencies are resolved
 */
export async function checkDependenciesResolved(supabase, dependencies) {
  if (!dependencies) return true;

  const deps = parseDependencies(dependencies);
  if (deps.length === 0) return true;

  for (const dep of deps) {
    // Use sd_key with fallback to id (for UUID lookups)
    const { data: sd } = await supabase
      .from('strategic_directives_v2')
      .select('status')
      .or(`sd_key.eq.${dep.sd_id},id.eq.${dep.sd_id}`)
      .single();

    if (!sd || sd.status !== 'completed') {
      return false;
    }
  }

  return true;
}

/**
 * Get unresolved dependencies for an SD
 *
 * @param {Object} supabase - Supabase client
 * @param {string|Array} dependencies - Dependencies to check
 * @returns {Promise<Array>} Array of unresolved dependency objects
 */
export async function getUnresolvedDependencies(supabase, dependencies) {
  if (!dependencies) return [];

  const deps = parseDependencies(dependencies);
  if (deps.length === 0) return [];

  const unresolvedDeps = [];
  for (const dep of deps) {
    // Use sd_key with fallback to id (for UUID lookups)
    const { data: sd } = await supabase
      .from('strategic_directives_v2')
      .select('status, title')
      .or(`sd_key.eq.${dep.sd_id},id.eq.${dep.sd_id}`)
      .single();

    if (!sd || sd.status !== 'completed') {
      unresolvedDeps.push({
        sd_id: dep.sd_id,
        status: sd?.status || 'not_found',
        title: sd?.title || 'Unknown'
      });
    }
  }

  return unresolvedDeps;
}

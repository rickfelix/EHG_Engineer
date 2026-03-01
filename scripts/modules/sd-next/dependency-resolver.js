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
      const parsed = JSON.parse(dependencies);
      // Handle both array and object formats from JSON parsing
      deps = Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  } else if (Array.isArray(dependencies)) {
    deps = dependencies;
  }

  // Ensure deps is an array before mapping
  if (!Array.isArray(deps)) return [];

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

/**
 * Check if an SD has a metadata-level dependency (soft/conditional)
 *
 * @param {Object|null} metadata - SD metadata object
 * @returns {{ hasMetadataDep: boolean, blockerSdKey: string|null, conditionalNote: string|null }}
 */
export function checkMetadataDependency(metadata) {
  if (!metadata || !metadata.blocked_by_sd_key) {
    return { hasMetadataDep: false, blockerSdKey: null, conditionalNote: null };
  }

  return {
    hasMetadataDep: true,
    blockerSdKey: metadata.blocked_by_sd_key,
    conditionalNote: metadata.conditional_note || null
  };
}

/**
 * Resolve a metadata blocker SD — check its status and find actionable children
 *
 * @param {Object} supabase - Supabase client
 * @param {string} blockerSdKey - The sd_key of the blocking SD
 * @returns {Promise<Object>} Resolution info with blocker status and unblock targets
 */
/**
 * Scan metadata for dependency-like information that should be in the dependencies column.
 *
 * Many SDs have dependency info stored under various metadata keys (depends_on, dependencies,
 * blocked_by, prerequisite_sds, etc.) but with an empty `dependencies` column. This function
 * detects those patterns and returns structured findings for QA warnings.
 *
 * @param {Object|null} metadata - SD metadata object
 * @returns {{ hasMisplacedDeps: boolean, findings: Array<{key: string, value: any, sdKeys: string[]}> }}
 */
export function scanMetadataForMisplacedDependencies(metadata) {
  if (!metadata || typeof metadata !== 'object') {
    return { hasMisplacedDeps: false, findings: [] };
  }

  // Keys that indicate dependency information
  const depKeyPatterns = [
    'depends_on', 'dependencies', 'blocked_by', 'prerequisite_sds',
    'prerequisite_for', 'requires_sd', 'after_sd', 'dependency_chain'
  ];

  // blocked_by_sd_key is already handled by checkMetadataDependency() — skip it
  const handledKeys = ['blocked_by_sd_key', 'conditional_note'];

  const findings = [];
  const sdKeyPattern = /SD-[A-Z0-9-]+/g;

  for (const [key, value] of Object.entries(metadata)) {
    if (handledKeys.includes(key)) continue;
    const keyLower = key.toLowerCase();

    const isDepKey = depKeyPatterns.some(p => keyLower === p || keyLower.includes(p));
    if (!isDepKey) continue;

    // Skip empty/null values
    if (value === null || value === undefined) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (typeof value === 'string' && value.trim() === '') continue;

    // Extract SD keys from the value
    const valueStr = JSON.stringify(value);
    const sdKeys = [...new Set((valueStr.match(sdKeyPattern) || []))];

    findings.push({ key, value, sdKeys });
  }

  return {
    hasMisplacedDeps: findings.length > 0,
    findings
  };
}

/**
 * Trace dependency chain backward to find workable SDs.
 * When an SD is blocked by dependencies, walks the chain up to maxDepth
 * to find SDs that are actually actionable (no unresolved deps).
 *
 * @param {Object} supabase - Supabase client
 * @param {string} sdKey - Starting SD key to trace from
 * @param {Object} [options] - Tracing options
 * @param {number} [options.maxDepth=3] - Maximum trace depth
 * @param {number} [options.maxResults=5] - Maximum workable SDs to return
 * @returns {Promise<Object>} Trace result with paths, workable SDs, and diagnostics
 */
export async function traceDependencyChain(supabase, sdKey, options = {}) {
  const { maxDepth = 6, maxResults = 5 } = options; // Raised from 3 to support 6-level deep hierarchies (V09)
  const visited = new Set();
  const workableSDs = [];
  const tracedPaths = [];
  const cycles = [];
  let depthLimitReached = false;

  async function fetchSD(key) {
    const { data } = await supabase
      .from('strategic_directives_v2')
      .select('id, sd_key, title, status, current_phase, priority, progress_percentage, dependencies, metadata, is_active, parent_sd_id, created_at')
      .or(`sd_key.eq.${key},id.eq.${key}`)
      .single();
    return data;
  }

  async function trace(currentKey, path, depth) {
    if (depth > maxDepth) {
      depthLimitReached = true;
      return;
    }
    if (workableSDs.length >= maxResults) return;

    const effectiveKey = currentKey;
    if (visited.has(effectiveKey)) {
      // Cycle detected
      const cycleStart = path.indexOf(effectiveKey);
      if (cycleStart >= 0) {
        cycles.push([...path.slice(cycleStart), effectiveKey]);
      }
      return;
    }
    visited.add(effectiveKey);

    const sd = await fetchSD(effectiveKey);
    if (!sd) return;

    const sdId = sd.sd_key || sd.id;
    const currentPath = [...path, sdId];

    // Check if this SD is workable (no unresolved deps)
    const deps = parseDependencies(sd.dependencies);
    const metaDep = checkMetadataDependency(sd.metadata);
    let hasUnresolvedDeps = false;

    if (deps.length > 0) {
      const resolved = await checkDependenciesResolved(supabase, sd.dependencies);
      if (!resolved) hasUnresolvedDeps = true;
    }

    if (metaDep.hasMetadataDep) {
      const blocker = await supabase
        .from('strategic_directives_v2')
        .select('status')
        .eq('sd_key', metaDep.blockerSdKey)
        .single();
      if (!blocker.data || blocker.data.status !== 'completed') {
        hasUnresolvedDeps = true;
      }
    }

    if (!hasUnresolvedDeps && sd.status !== 'completed' && sd.status !== 'cancelled' && sd.is_active) {
      workableSDs.push({
        sd_key: sdId,
        title: sd.title,
        status: sd.status,
        current_phase: sd.current_phase,
        priority: sd.priority,
        progress: sd.progress_percentage || 0,
        path: currentPath,
        created_at: sd.created_at
      });
      tracedPaths.push(currentPath);
      return;
    }

    // Trace deeper into this SD's unresolved dependencies
    if (deps.length > 0) {
      for (const dep of deps) {
        await trace(dep.sd_id, currentPath, depth + 1);
        if (workableSDs.length >= maxResults) return;
      }
    }

    // Also trace metadata blocker
    if (metaDep.hasMetadataDep) {
      await trace(metaDep.blockerSdKey, currentPath, depth + 1);
    }
  }

  await trace(sdKey, [], 0);

  // Sort workable SDs: unblocked first, then by priority, then by created_at
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  workableSDs.sort((a, b) => {
    const aPrio = priorityOrder[a.priority] ?? 2;
    const bPrio = priorityOrder[b.priority] ?? 2;
    if (aPrio !== bPrio) return aPrio - bPrio;
    return new Date(a.created_at) - new Date(b.created_at);
  });

  return {
    workableSDs: workableSDs.slice(0, maxResults),
    tracedPaths,
    cycles,
    depthLimitReached,
    visitedCount: visited.size
  };
}

export async function resolveMetadataBlocker(supabase, blockerSdKey) {
  // Fetch the blocker SD
  const { data: blockerSD } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, title, status, sd_type, progress_percentage, parent_sd_id, is_active')
    .eq('sd_key', blockerSdKey)
    .single();

  // Blocker doesn't exist — fail-open
  if (!blockerSD) {
    return { blockerSD: null, isComplete: false, actionableChildren: [] };
  }

  // Blocker is completed — dependency satisfied
  if (blockerSD.status === 'completed') {
    return { blockerSD, isComplete: true, actionableChildren: [] };
  }

  // Blocker is a leaf SD (not an orchestrator) — recommend it directly
  const { data: children } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, title, status, current_phase, progress_percentage, is_working_on, sequence_rank, track, sd_type, is_active')
    .eq('parent_sd_id', blockerSD.id)
    .eq('is_active', true);

  if (!children || children.length === 0) {
    // Leaf SD — the blocker itself is the unblock target
    const isActionable = blockerSD.is_active && blockerSD.status !== 'cancelled';
    return {
      blockerSD,
      isComplete: false,
      actionableChildren: isActionable ? [blockerSD] : [],
      isLeaf: true
    };
  }

  // Orchestrator — find non-completed children sorted by actionability
  const statusPriority = { active: 0, in_progress: 1, planning: 2, draft: 3, ready: 4 };
  const actionableChildren = children
    .filter(c => c.status !== 'completed' && c.status !== 'cancelled')
    .sort((a, b) => {
      // Working-on first
      if (a.is_working_on && !b.is_working_on) return -1;
      if (!a.is_working_on && b.is_working_on) return 1;
      // Then by status priority
      const aPrio = statusPriority[a.status] ?? 99;
      const bPrio = statusPriority[b.status] ?? 99;
      if (aPrio !== bPrio) return aPrio - bPrio;
      // Then by sequence_rank
      return (a.sequence_rank || 9999) - (b.sequence_rank || 9999);
    });

  const totalChildren = children.length;
  const completedChildren = children.filter(c => c.status === 'completed').length;

  return {
    blockerSD,
    isComplete: false,
    actionableChildren,
    totalChildren,
    completedChildren,
    isLeaf: false
  };
}

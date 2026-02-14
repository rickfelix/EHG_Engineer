/**
 * Inter-Venture Dependency Manager
 * SD-EVA-FEAT-DEPENDENCY-MANAGER-001
 *
 * Provides a directed graph of venture-to-venture dependencies,
 * cycle detection, and stage-transition blocking.
 *
 * Architecture Decision #32 from eva-platform-architecture.md
 *
 * @module lib/eva/dependency-manager
 */

export const MODULE_VERSION = '1.0.0';

/**
 * Get the full dependency graph for a venture.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} ventureId - UUID of the venture
 * @returns {Promise<{dependsOn: Array, providesTo: Array}>}
 */
export async function getDependencyGraph(supabase, ventureId) {
  const [dependsOnResult, providesToResult] = await Promise.all([
    supabase
      .from('venture_dependencies')
      .select('id, provider_venture_id, required_stage, dependency_type, status, resolved_at')
      .eq('dependent_venture_id', ventureId),
    supabase
      .from('venture_dependencies')
      .select('id, dependent_venture_id, required_stage, dependency_type, status, resolved_at')
      .eq('provider_venture_id', ventureId),
  ]);

  if (dependsOnResult.error) throw new Error(`Failed to query dependencies: ${dependsOnResult.error.message}`);
  if (providesToResult.error) throw new Error(`Failed to query dependents: ${providesToResult.error.message}`);

  return {
    dependsOn: (dependsOnResult.data || []).map(d => ({
      id: d.id,
      ventureId: d.provider_venture_id,
      requiredStage: d.required_stage,
      type: d.dependency_type,
      status: d.status,
      resolvedAt: d.resolved_at,
    })),
    providesTo: (providesToResult.data || []).map(d => ({
      id: d.id,
      ventureId: d.dependent_venture_id,
      requiredStage: d.required_stage,
      type: d.dependency_type,
      status: d.status,
      resolvedAt: d.resolved_at,
    })),
  };
}

/**
 * Check if adding an edge from dependentId → providerId would create a cycle.
 * Uses iterative DFS from providerId to see if dependentId is reachable.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} dependentId - UUID of the dependent venture
 * @param {string} providerId - UUID of the provider venture
 * @returns {Promise<boolean>} true if adding the edge would create a cycle
 */
export async function wouldCreateCycle(supabase, dependentId, providerId) {
  if (dependentId === providerId) return true;

  // Load all edges at once for efficient traversal
  const { data: allEdges, error } = await supabase
    .from('venture_dependencies')
    .select('dependent_venture_id, provider_venture_id');

  if (error) throw new Error(`Failed to load dependency graph: ${error.message}`);

  // Build adjacency list: for each node, who does it depend on?
  // We need to traverse: if providerId depends on X, and X depends on Y... does it reach dependentId?
  const adjacency = new Map();
  for (const edge of (allEdges || [])) {
    if (!adjacency.has(edge.dependent_venture_id)) {
      adjacency.set(edge.dependent_venture_id, []);
    }
    adjacency.get(edge.dependent_venture_id).push(edge.provider_venture_id);
  }

  // DFS from providerId following dependency edges
  const visited = new Set();
  const stack = [providerId];

  while (stack.length > 0) {
    const current = stack.pop();
    if (current === dependentId) return true;
    if (visited.has(current)) continue;
    visited.add(current);

    const neighbors = adjacency.get(current) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        stack.push(neighbor);
      }
    }
  }

  return false;
}

/**
 * Check if a venture has unresolved dependencies blocking a stage transition.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} ventureId - UUID of the venture
 * @param {number} targetStage - The stage the venture wants to transition to
 * @returns {Promise<Array<{id: string, providerId: string, requiredStage: number, type: string, blocking: boolean}>>}
 */
export async function checkDependencies(supabase, ventureId, targetStage) {
  const { data, error } = await supabase
    .from('venture_dependencies')
    .select('id, provider_venture_id, required_stage, dependency_type, status')
    .eq('dependent_venture_id', ventureId)
    .lte('required_stage', targetStage)
    .neq('status', 'resolved');

  if (error) throw new Error(`Failed to check dependencies: ${error.message}`);

  return (data || []).map(d => ({
    id: d.id,
    providerId: d.provider_venture_id,
    requiredStage: d.required_stage,
    type: d.dependency_type,
    blocking: d.dependency_type === 'hard',
  }));
}

/**
 * Add a new dependency between ventures.
 * Validates that no cycle would be created before inserting.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{dependentId: string, providerId: string, requiredStage: number, type?: string}} params
 * @returns {Promise<{id: string, dependent_venture_id: string, provider_venture_id: string}>}
 */
export async function addDependency(supabase, { dependentId, providerId, requiredStage, type = 'hard' }) {
  // Cycle check
  const cycleDetected = await wouldCreateCycle(supabase, dependentId, providerId);
  if (cycleDetected) {
    throw new Error(`Adding dependency would create a cycle: ${dependentId} → ${providerId}`);
  }

  const { data, error } = await supabase
    .from('venture_dependencies')
    .insert({
      dependent_venture_id: dependentId,
      provider_venture_id: providerId,
      required_stage: requiredStage,
      dependency_type: type,
      status: 'pending',
    })
    .select('id, dependent_venture_id, provider_venture_id, required_stage, dependency_type, status')
    .single();

  if (error) throw new Error(`Failed to add dependency: ${error.message}`);
  return data;
}

/**
 * Mark a dependency as resolved.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} dependencyId - UUID of the dependency record
 * @returns {Promise<{id: string, status: string, resolved_at: string}>}
 */
export async function resolveDependency(supabase, dependencyId) {
  const { data, error } = await supabase
    .from('venture_dependencies')
    .update({ status: 'resolved', resolved_at: new Date().toISOString() })
    .eq('id', dependencyId)
    .select('id, status, resolved_at')
    .single();

  if (error) throw new Error(`Failed to resolve dependency: ${error.message}`);
  return data;
}

/**
 * Remove a dependency entirely.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} dependencyId - UUID of the dependency record
 * @returns {Promise<void>}
 */
export async function removeDependency(supabase, dependencyId) {
  const { error } = await supabase
    .from('venture_dependencies')
    .delete()
    .eq('id', dependencyId);

  if (error) throw new Error(`Failed to remove dependency: ${error.message}`);
}

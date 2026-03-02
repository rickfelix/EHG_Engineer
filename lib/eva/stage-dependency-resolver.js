/**
 * Stage Dependency Resolver
 * SD-MAN-INFRA-CORRECTIVE-V05-DATA-CONTRACTS-001: FR-003
 *
 * Given a target stage number, walks the STAGE_CONTRACTS graph backwards
 * to identify all required upstream stages and checks whether their
 * artifacts exist for a given venture.
 *
 * @module lib/eva/stage-dependency-resolver
 */

import { STAGE_CONTRACTS } from './contracts/stage-contracts.js';

/**
 * Recursively collect all upstream stage numbers required by a target stage.
 *
 * @param {number} stageNumber - Target stage
 * @param {Set<number>} [visited] - Visited stages (cycle protection)
 * @returns {number[]} Sorted array of all required upstream stage numbers
 */
export function getUpstreamStages(stageNumber, visited = new Set()) {
  if (visited.has(stageNumber)) return [];
  visited.add(stageNumber);

  const contract = STAGE_CONTRACTS.get(stageNumber);
  if (!contract || !contract.consumes || contract.consumes.length === 0) {
    return [];
  }

  const upstream = [];
  for (const dep of contract.consumes) {
    upstream.push(dep.stage);
    // Recurse into each upstream stage's dependencies
    const transitive = getUpstreamStages(dep.stage, visited);
    upstream.push(...transitive);
  }

  // Deduplicate and sort
  return [...new Set(upstream)].sort((a, b) => a - b);
}

/**
 * Resolve dependencies for a stage against a venture's existing artifacts.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {number} stageNumber - Target stage to check
 * @param {string} ventureId - Venture UUID
 * @returns {Promise<{resolved: Array<{stage: number, artifactId: string}>, missing: Array<{stage: number, requiredFields: string[]}>}>}
 */
export async function resolveDependencies(supabase, stageNumber, ventureId) {
  const contract = STAGE_CONTRACTS.get(stageNumber);
  if (!contract || !contract.consumes || contract.consumes.length === 0) {
    return { resolved: [], missing: [], stageNumber, ventureId };
  }

  // Get all direct upstream stage numbers
  const directUpstream = contract.consumes.map(dep => dep.stage);

  // Fetch existing artifacts for upstream stages
  const { data: artifacts, error } = await supabase
    .from('venture_artifacts')
    .select('id, lifecycle_stage, metadata')
    .eq('venture_id', ventureId)
    .eq('is_current', true)
    .in('lifecycle_stage', directUpstream);

  if (error) {
    throw new Error(`Failed to query upstream artifacts: ${error.message}`);
  }

  const artifactMap = new Map();
  for (const art of artifacts || []) {
    artifactMap.set(art.lifecycle_stage, art);
  }

  const resolved = [];
  const missing = [];

  for (const dep of contract.consumes) {
    const artifact = artifactMap.get(dep.stage);
    if (artifact) {
      resolved.push({ stage: dep.stage, artifactId: artifact.id });
    } else {
      missing.push({
        stage: dep.stage,
        requiredFields: Object.keys(dep.fields),
      });
    }
  }

  return { resolved, missing, stageNumber, ventureId };
}

/**
 * Experiment Assignment - Deterministic hash-based venture-to-variant bucketing
 *
 * SD-STAGE-ZERO-EXPERIMENTATION-FRAMEWORK-ORCH-001-C
 */

import { createHash } from 'crypto';

/**
 * Deterministically assign a venture to an experiment variant.
 * Uses SHA-256 hash of ventureId + experimentId for consistent bucketing.
 *
 * @param {Object} deps - { supabase, logger }
 * @param {Object} params
 * @param {string} params.ventureId - Venture UUID
 * @param {Object} params.experiment - Experiment record with id and variants
 * @returns {Promise<Object>} Assignment record { variant_key, assignment }
 */
export async function assignVariant(deps, { ventureId, experiment }) {
  const { supabase, logger = console } = deps;

  // Check for existing assignment first
  const existing = await getAssignment(deps, { ventureId, experimentId: experiment.id });
  if (existing) {
    return { variant_key: existing.variant_key, assignment: existing, cached: true };
  }

  // Deterministic hash-based bucketing
  const variantKey = hashBucket(ventureId, experiment.id, experiment.variants);

  // Persist assignment
  const { data, error } = await supabase
    .from('experiment_assignments')
    .insert({
      experiment_id: experiment.id,
      venture_id: ventureId,
      variant_key: variantKey,
    })
    .select()
    .single();

  if (error) {
    // Handle race condition — another process assigned simultaneously
    if (error.code === '23505') {
      const fallback = await getAssignment(deps, { ventureId, experimentId: experiment.id });
      return { variant_key: fallback.variant_key, assignment: fallback, cached: true };
    }
    throw new Error(`Failed to assign variant: ${error.message}`);
  }

  logger.log(`   Assigned venture ${ventureId.slice(0, 8)} → variant '${variantKey}'`);
  return { variant_key: variantKey, assignment: data, cached: false };
}

/**
 * Get an existing assignment for a venture in an experiment.
 */
export async function getAssignment(deps, { ventureId, experimentId }) {
  const { supabase } = deps;
  const { data, error } = await supabase
    .from('experiment_assignments')
    .select()
    .eq('experiment_id', experimentId)
    .eq('venture_id', ventureId)
    .single();

  if (error) return null;
  return data;
}

/**
 * Get all assignments for an experiment.
 */
export async function getExperimentAssignments(deps, experimentId) {
  const { supabase } = deps;
  const { data, error } = await supabase
    .from('experiment_assignments')
    .select()
    .eq('experiment_id', experimentId)
    .order('assigned_at', { ascending: true });

  if (error) throw new Error(`Failed to get assignments: ${error.message}`);
  return data || [];
}

/**
 * Deterministic hash bucketing.
 * Hashes ventureId + experimentId, maps to [0, 1), assigns to variant by cumulative weight.
 *
 * @param {string} ventureId
 * @param {string} experimentId
 * @param {Array<{key: string, weight: number}>} variants - Normalized weights summing to 1
 * @returns {string} The assigned variant key
 */
export function hashBucket(ventureId, experimentId, variants) {
  const hash = createHash('sha256')
    .update(`${ventureId}:${experimentId}`)
    .digest('hex');

  // Convert first 8 hex chars to a number in [0, 1)
  const hashValue = parseInt(hash.slice(0, 8), 16) / 0xFFFFFFFF;

  // Walk cumulative weights to find bucket
  let cumulative = 0;
  for (const variant of variants) {
    cumulative += variant.weight;
    if (hashValue < cumulative) {
      return variant.key;
    }
  }

  // Fallback: last variant (floating point edge case)
  return variants[variants.length - 1].key;
}

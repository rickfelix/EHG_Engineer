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

  // Use Thompson Sampling when posteriors are available, otherwise hash bucketing
  const variantKey = experiment.config?.assignment_mode === 'thompson'
    ? thompsonSample(experiment.variants, logger)
    : hashBucket(ventureId, experiment.id, experiment.variants);

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

/**
 * Thompson Sampling — adaptive traffic allocation using Beta posteriors.
 * Samples from each variant's Beta(alpha, beta) distribution and assigns
 * to the variant with the highest sample. Sends more traffic to
 * better-performing variants, finding winners faster.
 *
 * Falls back to uniform random when no priors are available.
 *
 * @param {Array<{key: string, prior?: {alpha: number, beta: number}}>} variants
 * @param {Object} [logger=console]
 * @returns {string} The assigned variant key
 */
export function thompsonSample(variants, logger = console) {
  const samples = variants.map(v => {
    const alpha = v.prior?.alpha ?? 2;
    const beta = v.prior?.beta ?? 2;
    return { key: v.key, sample: betaSample(alpha, beta) };
  });

  // Pick variant with highest sample
  samples.sort((a, b) => b.sample - a.sample);
  const chosen = samples[0].key;

  logger.log(
    `   Thompson Sampling: ${samples.map(s => `${s.key}=${s.sample.toFixed(3)}`).join(', ')} → ${chosen}`
  );

  return chosen;
}

/**
 * Sample from a Beta(alpha, beta) distribution using the Jöhnk algorithm.
 * Simple, dependency-free implementation suitable for low-frequency calls.
 *
 * @param {number} alpha - Shape parameter alpha (> 0)
 * @param {number} beta - Shape parameter beta (> 0)
 * @returns {number} Sample in [0, 1]
 */
function betaSample(alpha, beta) {
  // Use Gamma sampling method: X ~ Gamma(alpha), Y ~ Gamma(beta), then X/(X+Y) ~ Beta(alpha,beta)
  const x = gammaSample(alpha);
  const y = gammaSample(beta);
  return x / (x + y);
}

/**
 * Sample from a Gamma(shape, 1) distribution using Marsaglia & Tsang's method.
 *
 * @param {number} shape - Shape parameter (> 0)
 * @returns {number} Gamma sample
 */
function gammaSample(shape) {
  if (shape < 1) {
    // Boost: Gamma(shape) = Gamma(shape+1) * U^(1/shape)
    return gammaSample(shape + 1) * Math.pow(Math.random(), 1 / shape);
  }

  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    let x, v;
    do {
      x = normalSample();
      v = 1 + c * x;
    } while (v <= 0);

    v = v * v * v;
    const u = Math.random();

    if (u < 1 - 0.0331 * (x * x) * (x * x)) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

/**
 * Sample from standard normal using Box-Muller transform.
 */
function normalSample() {
  const u1 = Math.random();
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

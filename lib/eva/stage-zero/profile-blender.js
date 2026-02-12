/**
 * Profile Blending Engine
 *
 * Enables continuous, weighted evaluation profile blends (e.g., 65/35)
 * instead of discrete presets. Stores raw weight vectors and treats
 * presets as labeled bookmarks in continuous weight space.
 *
 * Part of SD-LEO-ORCH-EVA-STAGE-CONFIGURABLE-001-K
 */

import { createHash } from 'crypto';
import { VALID_COMPONENTS } from './profile-service.js';

/** Precision for weight rounding (6 decimal places per PRD TR-1) */
const PRECISION = 6;

/** Tolerance for normalization checks */
const TOLERANCE = 0.0001;

/**
 * Validate a weight vector.
 *
 * Checks:
 * - All values are numbers
 * - No negative values
 * - At least one value > 0
 * - Only valid dimension keys
 *
 * @param {Object} weights - Map of dimension → weight
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateWeightVector(weights) {
  const errors = [];

  if (!weights || typeof weights !== 'object') {
    return { valid: false, errors: ['weights must be a non-null object'] };
  }

  const negatives = [];
  let hasPositive = false;

  for (const [key, value] of Object.entries(weights)) {
    if (!VALID_COMPONENTS.includes(key)) {
      errors.push(`Unknown dimension: ${key}`);
      continue;
    }
    if (typeof value !== 'number' || Number.isNaN(value)) {
      errors.push(`${key}: weight must be a number`);
      continue;
    }
    if (value < 0) {
      negatives.push(key);
    }
    if (value > 0) {
      hasPositive = true;
    }
  }

  if (negatives.length > 0) {
    errors.push(`Negative weights on: ${negatives.join(', ')}`);
  }

  if (!hasPositive && errors.length === 0) {
    errors.push('At least one dimension must have weight > 0');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Normalize a weight vector to canonical form.
 *
 * Canonical form:
 * - All VALID_COMPONENTS present (missing → 0)
 * - Keys sorted alphabetically
 * - Values sum to 1.0
 * - Rounded to PRECISION decimal places
 *
 * @param {Object} weights - Raw weight values
 * @returns {Object} Canonical normalized vector
 * @throws {Error} If validation fails
 */
export function normalizeVector(weights) {
  const validation = validateWeightVector(weights);
  if (!validation.valid) {
    throw new Error(`Invalid weight vector: ${validation.errors.join('; ')}`);
  }

  // Build full vector with all components
  const raw = {};
  for (const comp of VALID_COMPONENTS) {
    raw[comp] = (typeof weights[comp] === 'number' && weights[comp] >= 0)
      ? weights[comp]
      : 0;
  }

  // Normalize to sum = 1.0
  const sum = Object.values(raw).reduce((s, v) => s + v, 0);
  if (sum === 0) {
    throw new Error('Cannot normalize: all weights are zero');
  }

  const normalized = {};
  // Sort keys for canonical ordering
  const sortedKeys = Object.keys(raw).sort();
  for (const key of sortedKeys) {
    normalized[key] = roundTo(raw[key] / sum, PRECISION);
  }

  // Fix rounding drift: adjust largest component so sum is exactly 1.0
  const currentSum = Object.values(normalized).reduce((s, v) => s + v, 0);
  const drift = roundTo(1.0 - currentSum, PRECISION);
  if (Math.abs(drift) > 0) {
    const largestKey = sortedKeys.reduce((a, b) =>
      normalized[a] >= normalized[b] ? a : b
    );
    normalized[largestKey] = roundTo(normalized[largestKey] + drift, PRECISION);
  }

  return normalized;
}

/**
 * Blend two weight vectors by ratio.
 *
 * Formula: V = ratio * weightsA + (1 - ratio) * weightsB
 * Result is normalized to canonical form.
 *
 * @param {Object} weightsA - First weight vector
 * @param {Object} weightsB - Second weight vector
 * @param {number} ratio - Blend ratio (0.0 = all B, 1.0 = all A)
 * @returns {Object} Canonical normalized blended vector
 * @throws {Error} If inputs invalid or ratio out of range
 */
export function blendProfiles(weightsA, weightsB, ratio) {
  if (typeof ratio !== 'number' || ratio < 0 || ratio > 1) {
    throw new Error('Blend ratio must be a number between 0 and 1');
  }

  // Validate both inputs
  const valA = validateWeightVector(weightsA);
  if (!valA.valid) {
    throw new Error(`Profile A invalid: ${valA.errors.join('; ')}`);
  }
  const valB = validateWeightVector(weightsB);
  if (!valB.valid) {
    throw new Error(`Profile B invalid: ${valB.errors.join('; ')}`);
  }

  // Compute blend
  const blended = {};
  for (const comp of VALID_COMPONENTS) {
    const a = (typeof weightsA[comp] === 'number' && weightsA[comp] >= 0) ? weightsA[comp] : 0;
    const b = (typeof weightsB[comp] === 'number' && weightsB[comp] >= 0) ? weightsB[comp] : 0;
    blended[comp] = ratio * a + (1 - ratio) * b;
  }

  return normalizeVector(blended);
}

/**
 * Blend two profiles by preset IDs (fetched from database).
 *
 * @param {Object} deps - { supabase, logger }
 * @param {string} presetIdA - UUID or name of preset A
 * @param {string} presetIdB - UUID or name of preset B
 * @param {number} ratio - Blend ratio (0-1)
 * @returns {Promise<Object>} { vector, hash, source: { preset_a, preset_b, ratio } }
 */
export async function blendByPresetIds(deps, presetIdA, presetIdB, ratio) {
  const vectorA = await resolvePresetToVector(deps, presetIdA);
  const vectorB = await resolvePresetToVector(deps, presetIdB);

  if (!vectorA) throw new Error(`Preset not found: ${presetIdA}`);
  if (!vectorB) throw new Error(`Preset not found: ${presetIdB}`);

  const vector = blendProfiles(vectorA.weights, vectorB.weights, ratio);
  const hash = computeVectorHash(vector);

  return {
    vector,
    hash,
    source: {
      preset_a: { id: vectorA.id, name: vectorA.name },
      preset_b: { id: vectorB.id, name: vectorB.name },
      ratio,
    },
  };
}

/**
 * Resolve a preset identifier to its weight vector.
 *
 * Looks up by UUID first, then by name. Returns the canonical
 * weight vector from the evaluation_profiles table.
 *
 * @param {Object} deps - { supabase, logger }
 * @param {string} presetIdOrName - UUID or profile name
 * @returns {Promise<Object|null>} { id, name, weights } or null
 */
export async function resolvePresetToVector(deps, presetIdOrName) {
  const { supabase, logger = console } = deps;
  if (!supabase) return null;

  // Try UUID lookup first
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(presetIdOrName);

  let data, error;
  if (isUuid) {
    ({ data, error } = await supabase
      .from('evaluation_profiles')
      .select('id, name, weights')
      .eq('id', presetIdOrName)
      .single());
  } else {
    ({ data, error } = await supabase
      .from('evaluation_profiles')
      .select('id, name, weights')
      .eq('name', presetIdOrName)
      .order('version', { ascending: false })
      .limit(1)
      .single());
  }

  if (error || !data) {
    logger.warn?.(`Profile blender: Preset ${presetIdOrName} not found`);
    return null;
  }

  return {
    id: data.id,
    name: data.name,
    weights: data.weights,
  };
}

/**
 * Compute a deterministic hash of a canonical weight vector.
 *
 * Used for caching and deduplication of evaluation runs.
 * Input must be a normalized canonical vector (sorted keys, 6 decimals).
 *
 * @param {Object} vector - Canonical weight vector
 * @returns {string} SHA-256 hex hash
 */
export function computeVectorHash(vector) {
  const canonical = JSON.stringify(vector, Object.keys(vector).sort());
  return createHash('sha256').update(canonical).digest('hex');
}

/**
 * Check if two weight vectors are effectively equal within tolerance.
 *
 * @param {Object} vectorA - First vector
 * @param {Object} vectorB - Second vector
 * @returns {boolean} True if all dimensions match within TOLERANCE
 */
export function vectorsEqual(vectorA, vectorB) {
  for (const comp of VALID_COMPONENTS) {
    const a = vectorA[comp] ?? 0;
    const b = vectorB[comp] ?? 0;
    if (Math.abs(a - b) > TOLERANCE) return false;
  }
  return true;
}

/**
 * Save a blended profile as a new named preset.
 *
 * @param {Object} deps - { supabase, logger }
 * @param {Object} params
 * @param {string} params.name - Preset name
 * @param {Object} params.weights - Weight vector (will be normalized)
 * @param {string} [params.description] - Optional description
 * @param {Object} [params.source_blend] - Optional source blend metadata
 * @returns {Promise<Object>} Created profile record
 */
export async function saveBlendAsPreset(deps, { name, weights, description, source_blend }) {
  const { supabase } = deps;
  if (!supabase) throw new Error('supabase client is required');
  if (!name) throw new Error('Preset name is required');

  const normalizedWeights = normalizeVector(weights);
  const hash = computeVectorHash(normalizedWeights);

  const { data, error } = await supabase
    .from('evaluation_profiles')
    .insert({
      name,
      version: 1,
      description: description || `Blended profile: ${name}`,
      weights: normalizedWeights,
      is_active: false,
      created_by: source_blend ? 'blend' : 'manual',
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to save preset: ${error.message}`);

  return {
    ...data,
    weight_vector_hash: hash,
  };
}

/**
 * Get a profile by ID, returning canonical weight vector.
 *
 * @param {Object} deps - { supabase }
 * @param {string} profileId - UUID of profile
 * @returns {Promise<Object|null>} Profile with normalized weights, or null
 */
export async function getProfile(deps, profileId) {
  const { supabase } = deps;
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('evaluation_profiles')
    .select('id, name, version, description, weights, is_active, gate_thresholds, created_at, updated_at, created_by')
    .eq('id', profileId)
    .single();

  if (error || !data) return null;

  return {
    ...data,
    weight_vector_hash: computeVectorHash(data.weights),
  };
}

/**
 * Update an existing profile's weights and/or metadata.
 *
 * @param {Object} deps - { supabase }
 * @param {string} profileId - UUID
 * @param {Object} updates - { name?, weights?, description? }
 * @returns {Promise<Object>} Updated profile
 */
export async function updateProfile(deps, profileId, updates) {
  const { supabase } = deps;
  if (!supabase) throw new Error('supabase client is required');

  const patch = {};
  if (updates.name) patch.name = updates.name;
  if (updates.description !== undefined) patch.description = updates.description;
  if (updates.weights) {
    patch.weights = normalizeVector(updates.weights);
  }

  if (Object.keys(patch).length === 0) {
    throw new Error('No valid fields to update');
  }

  const { data, error } = await supabase
    .from('evaluation_profiles')
    .update(patch)
    .eq('id', profileId)
    .select()
    .single();

  if (error) throw new Error(`Failed to update profile: ${error.message}`);

  return {
    ...data,
    weight_vector_hash: computeVectorHash(data.weights),
  };
}

// --- Internal helpers ---

function roundTo(value, decimals) {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

export { PRECISION, TOLERANCE };

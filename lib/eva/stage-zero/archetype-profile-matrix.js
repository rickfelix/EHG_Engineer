/**
 * Archetype x Profile Interaction Matrix Service
 *
 * Provides weight adjustments and execution guidance based on how
 * each of the 6 EHG venture archetypes interacts with each
 * evaluation profile (balanced, aggressive_growth, capital_efficient).
 *
 * Part of SD-LEO-ORCH-EVA-STAGE-CONFIGURABLE-001-E
 */

import { VALID_ARCHETYPE_KEYS } from './synthesis/archetypes.js';

/** Multiplier bounds to prevent extreme distortion. */
const MIN_MULTIPLIER = 0.5;
const MAX_MULTIPLIER = 2.0;

/**
 * Clamp a multiplier to valid bounds.
 * @param {number} value
 * @returns {number}
 */
function clampMultiplier(value) {
  if (typeof value !== 'number' || isNaN(value)) return 1.0;
  return Math.min(MAX_MULTIPLIER, Math.max(MIN_MULTIPLIER, value));
}

/**
 * Get the archetype-profile interaction matrix entry for a given pair.
 *
 * @param {Object} deps - { supabase, logger }
 * @param {string} archetypeKey - One of the 6 EHG archetype keys
 * @param {Object|null} profile - Resolved evaluation profile (from resolveProfile)
 * @returns {Promise<Object>} Matrix entry with adjusted_weights, execution_modifiers, compatibility_score
 */
export async function getArchetypeProfileMatrix(deps, archetypeKey, profile) {
  const { supabase, logger = console } = deps;

  if (!archetypeKey || !VALID_ARCHETYPE_KEYS.includes(archetypeKey)) {
    return defaultMatrix(archetypeKey || 'unknown', 'Invalid archetype key');
  }

  if (!profile?.id || !supabase) {
    return defaultMatrix(archetypeKey, 'No profile or supabase client');
  }

  const { data, error } = await supabase
    .from('archetype_profile_interactions')
    .select('weight_adjustments, execution_guidance, compatibility_score')
    .eq('archetype_key', archetypeKey)
    .eq('profile_id', profile.id)
    .single();

  if (error || !data) {
    logger.warn(`Archetype-profile matrix: No entry for ${archetypeKey} + ${profile.name}: ${error?.message || 'not found'}`);
    return defaultMatrix(archetypeKey, `No matrix entry for ${profile.name}`);
  }

  return {
    archetype_key: archetypeKey,
    profile_name: profile.name,
    adjusted_weights: data.weight_adjustments || {},
    execution_modifiers: data.execution_guidance || [],
    compatibility_score: parseFloat(data.compatibility_score) || 0.5,
  };
}

/**
 * Apply matrix weight adjustments to raw component scores.
 *
 * @param {Object} rawScores - Component name → score (0-1)
 * @param {Object} matrixData - From getArchetypeProfileMatrix
 * @returns {Object} Adjusted scores with multipliers applied and clamped
 */
export function applyMatrixAdjustments(rawScores, matrixData) {
  if (!rawScores || !matrixData?.adjusted_weights) {
    return { ...(rawScores || {}) };
  }

  const adjusted = {};
  for (const [component, score] of Object.entries(rawScores)) {
    const multiplier = clampMultiplier(matrixData.adjusted_weights[component]);
    adjusted[component] = Math.round(score * multiplier * 100) / 100;
  }

  return adjusted;
}

/**
 * Get compatibility report: ranked profiles for a given archetype.
 *
 * @param {Object} deps - { supabase }
 * @param {string} archetypeKey - Archetype to query
 * @returns {Promise<Array>} Sorted array of { profile_name, profile_id, compatibility_score }
 */
export async function getCompatibilityReport(deps, archetypeKey) {
  const { supabase } = deps;

  if (!supabase || !archetypeKey) return [];

  const { data, error } = await supabase
    .from('archetype_profile_interactions')
    .select('profile_id, compatibility_score, execution_guidance')
    .eq('archetype_key', archetypeKey)
    .order('compatibility_score', { ascending: false });

  if (error) throw new Error(`Failed to fetch compatibility report: ${error.message}`);
  if (!data || data.length === 0) return [];

  // Fetch profile names
  const profileIds = data.map(d => d.profile_id);
  const { data: profiles } = await supabase
    .from('evaluation_profiles')
    .select('id, name')
    .in('id', profileIds);

  const profileMap = new Map((profiles || []).map(p => [p.id, p.name]));

  return data.map(d => ({
    profile_name: profileMap.get(d.profile_id) || 'unknown',
    profile_id: d.profile_id,
    compatibility_score: parseFloat(d.compatibility_score) || 0,
    execution_guidance: d.execution_guidance || [],
  }));
}

/**
 * Default matrix returned when no interaction data exists.
 */
function defaultMatrix(archetypeKey, reason) {
  return {
    archetype_key: archetypeKey,
    profile_name: null,
    adjusted_weights: {},
    execution_modifiers: [],
    compatibility_score: 0.5,
    _default: true,
    _reason: reason,
  };
}

export { MIN_MULTIPLIER, MAX_MULTIPLIER, clampMultiplier };

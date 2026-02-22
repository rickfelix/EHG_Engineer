/**
 * Evaluation Profile Service
 *
 * Manages evaluation profiles for Stage 0 synthesis scoring.
 * Profiles define weights for each synthesis component, allowing
 * different evaluation strategies (aggressive growth, capital efficient, etc.)
 *
 * Part of SD-LEO-ORCH-EVA-STAGE-CONFIGURABLE-001-B (weights)
 * Part of SD-LEO-ORCH-EVA-STAGE-CONFIGURABLE-001-C (gate thresholds)
 */

/**
 * Default legacy weights used when no profile is available.
 * These match the original hardcoded behavior before profiles were introduced.
 */
const LEGACY_WEIGHTS = {
  cross_reference: 0.10,
  portfolio_evaluation: 0.10,
  problem_reframing: 0.05,
  moat_architecture: 0.13,
  chairman_constraints: 0.14,
  time_horizon: 0.10,
  archetypes: 0.10,
  build_cost: 0.10,
  virality: 0.13,
  tech_trajectory: 0.05,
};

/**
 * All valid synthesis component names that can have weights.
 */
const VALID_COMPONENTS = Object.keys(LEGACY_WEIGHTS);

/**
 * Resolve the evaluation profile to use for a synthesis run.
 *
 * Resolution order:
 * 1. Explicit profile_id → fetch by ID
 * 2. No profile_id → fetch the active profile
 * 3. No active profile → return legacy defaults with fallback flag
 *
 * @param {Object} deps
 * @param {Object} deps.supabase - Supabase client
 * @param {Object} [deps.logger] - Logger
 * @param {string} [profileId] - Optional explicit profile UUID
 * @returns {Promise<Object>} Resolved profile { name, version, weights, source }
 */
export async function resolveProfile(deps = {}, profileId = null) {
  const { supabase, logger = console } = deps;

  if (!supabase) {
    logger.warn('   Profile service: No supabase client, using legacy defaults');
    return makeFallbackProfile('no_supabase_client');
  }

  try {
    let profile;

    if (profileId) {
      // Explicit profile requested
      const { data, error } = await supabase
        .from('evaluation_profiles')
        .select('id, name, version, weights, gate_thresholds, description')
        .eq('id', profileId)
        .single();

      if (error || !data) {
        logger.warn(`   Profile service: Profile ${profileId} not found, using legacy defaults`);
        return makeFallbackProfile('profile_not_found');
      }
      profile = data;
    } else {
      // Use active profile
      const { data, error } = await supabase
        .from('evaluation_profiles')
        .select('id, name, version, weights, gate_thresholds, description')
        .eq('is_active', true)
        .limit(1)
        .single();

      if (error || !data) {
        logger.warn('   Profile service: No active profile found, using legacy defaults');
        return makeFallbackProfile('no_active_profile');
      }
      profile = data;
    }

    // Validate and normalize weights
    const weights = normalizeWeights(profile.weights);

    return {
      id: profile.id,
      name: profile.name,
      version: profile.version,
      description: profile.description,
      weights,
      gate_thresholds: profile.gate_thresholds || {},
      source: profileId ? 'explicit' : 'active',
    };
  } catch (err) {
    logger.warn(`   Profile service: Error resolving profile: ${err.message}`);
    return makeFallbackProfile('error');
  }
}

/**
 * Create a new evaluation profile.
 *
 * @param {Object} deps - { supabase, logger }
 * @param {Object} profileData - { name, weights, description, version }
 * @returns {Promise<Object>} Created profile
 */
export async function createProfile(deps, profileData) {
  const { supabase } = deps;
  const { name, weights, description, version = 1 } = profileData;

  if (!name) throw new Error('Profile name is required');
  if (!weights || typeof weights !== 'object') throw new Error('Profile weights must be an object');

  const normalizedWeights = normalizeWeights(weights);

  const { data, error } = await supabase
    .from('evaluation_profiles')
    .insert({
      name,
      version,
      description: description || null,
      weights: normalizedWeights,
      is_active: false,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create profile: ${error.message}`);
  return data;
}

/**
 * Activate a profile (deactivates all others via trigger).
 *
 * @param {Object} deps - { supabase }
 * @param {string} profileId - UUID of profile to activate
 * @returns {Promise<Object>} Updated profile
 */
export async function activateProfile(deps, profileId) {
  const { supabase } = deps;

  const { data, error } = await supabase
    .from('evaluation_profiles')
    .update({ is_active: true })
    .eq('id', profileId)
    .select()
    .single();

  if (error) throw new Error(`Failed to activate profile: ${error.message}`);
  return data;
}

/**
 * List all profiles.
 *
 * @param {Object} deps - { supabase }
 * @returns {Promise<Array>} All profiles
 */
export async function listProfiles(deps) {
  const { supabase } = deps;

  const { data, error } = await supabase
    .from('evaluation_profiles')
    .select('id, name, version, description, weights, is_active, created_at, updated_at')
    .order('name')
    .order('version', { ascending: false });

  if (error) throw new Error(`Failed to list profiles: ${error.message}`);
  return data || [];
}

/**
 * Calculate a weighted venture score from synthesis results using profile weights.
 *
 * Each synthesis component provides a score (0-100). The profile weights
 * determine how much each component contributes to the final score.
 *
 * @param {Object} synthesisResults - Map of component name → result object
 * @param {Object} weights - Map of component name → weight (0-1)
 * @returns {Object} { total_score, breakdown[] }
 */
export function calculateWeightedScore(synthesisResults, weights) {
  const breakdown = [];
  let totalScore = 0;

  for (const [component, weight] of Object.entries(weights)) {
    const result = synthesisResults[component];
    const rawScore = extractComponentScore(component, result);

    const contribution = Math.round(rawScore * weight * 100) / 100;
    totalScore += contribution;

    breakdown.push({
      component,
      raw_score: rawScore,
      weight,
      contribution: Math.round(contribution * 100) / 100,
    });
  }

  return {
    total_score: Math.round(totalScore),
    breakdown: breakdown.sort((a, b) => b.contribution - a.contribution),
  };
}

/**
 * Extract a 0-100 score from a synthesis component result.
 * Each component stores its score in different fields.
 */
function extractComponentScore(component, result) {
  if (!result) return 0;

  switch (component) {
    case 'cross_reference':
      return clamp(result.relevance_score ?? 0, 0, 100);
    case 'portfolio_evaluation':
      return clamp(result.composite_score ?? 0, 0, 100);
    case 'problem_reframing':
      return result.reframings?.length > 0 ? 70 : 20; // Has reframings = good
    case 'moat_architecture':
      return clamp(result.moat_score ?? 0, 0, 100);
    case 'chairman_constraints':
      return result.verdict === 'pass' ? 100 : result.verdict === 'review' ? 50 : 0;
    case 'time_horizon':
      return result.position === 'build_now' ? 100
        : result.position === 'build_soon' ? 75
        : result.position === 'park_and_build_later' ? 25 : 50;
    case 'archetypes':
      return clamp((result.primary_confidence ?? 0) * 100, 0, 100);
    case 'build_cost':
      return result.complexity === 'simple' ? 90
        : result.complexity === 'moderate' ? 60
        : result.complexity === 'complex' ? 30 : 50;
    case 'virality':
      return clamp(result.virality_score ?? 0, 0, 100);
    case 'tech_trajectory':
      return clamp(result.trajectory_score ?? 0, 0, 100);
    default:
      return 0;
  }
}

/**
 * Normalize weights: fill in missing components with 0, ensure all values are numbers.
 */
function normalizeWeights(weights) {
  const normalized = {};
  for (const component of VALID_COMPONENTS) {
    const w = weights[component];
    normalized[component] = typeof w === 'number' && w >= 0 ? w : 0;
  }
  return normalized;
}

function makeFallbackProfile(reason) {
  return {
    id: null,
    name: 'legacy_defaults',
    version: 0,
    description: 'Built-in default weights (no database profile)',
    weights: { ...LEGACY_WEIGHTS },
    gate_thresholds: {},
    source: 'fallback',
    fallback_reason: reason,
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Legacy gate thresholds matching the hardcoded BOUNDARY_CONFIG in reality-gates.js.
 * Used as fallback when no profile is active or profile has no threshold overrides.
 */
const LEGACY_GATE_THRESHOLDS = {
  '5->6': {
    problem_statement: 0.6,
    target_market_analysis: 0.5,
    value_proposition: 0.6,
  },
  '9->10': {
    customer_interviews: 0.5,
    competitive_analysis: 0.5,
    pricing_model: 0.6,
  },
  '12->13': {
    business_model_canvas: 0.7,
    technical_architecture: 0.6,
    project_plan: 0.5,
  },
  '16->17': {
    mvp_build: 0.7,
    test_coverage_report: 0.6,
    deployment_runbook: 0.5,
  },
  '20->21': {
    launch_metrics: 0.6,
    user_feedback_summary: 0.5,
    production_app: 0.7,
  },
};

/**
 * Resolve gate threshold for a specific boundary and artifact type.
 *
 * Resolution: profile override → legacy default.
 * If no profile is provided, returns legacy threshold.
 *
 * @param {Object} profile - Resolved profile from resolveProfile() (or null)
 * @param {string} boundary - Boundary key e.g. "5->6"
 * @param {string} artifactType - Artifact type e.g. "problem_statement"
 * @returns {number} Min quality score threshold (0-1)
 */
export function resolveGateThreshold(profile, boundary, artifactType) {
  // Check profile override first
  if (profile?.gate_thresholds?.[boundary]?.[artifactType] != null) {
    return profile.gate_thresholds[boundary][artifactType];
  }

  // Fall back to legacy
  return LEGACY_GATE_THRESHOLDS[boundary]?.[artifactType] ?? 0.5;
}

/**
 * Get all thresholds for a boundary, merging profile overrides with legacy defaults.
 *
 * @param {Object} profile - Resolved profile (or null)
 * @param {string} boundary - Boundary key e.g. "5->6"
 * @returns {Object} Map of artifact_type → min_quality_score
 */
export function resolveAllGateThresholds(profile, boundary) {
  const legacyThresholds = LEGACY_GATE_THRESHOLDS[boundary] || {};
  const profileOverrides = profile?.gate_thresholds?.[boundary] || {};

  return { ...legacyThresholds, ...profileOverrides };
}

export { LEGACY_WEIGHTS, VALID_COMPONENTS, LEGACY_GATE_THRESHOLDS };

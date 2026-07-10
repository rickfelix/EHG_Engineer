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
// SD-EHG-FACTORY-AGENTIC-FIT-SELECTION-001 (FR-4): agentic-fit joins the weighted Stage-0
// venture_score. calculateWeightedScore does NOT normalize by the weight sum, so the weights
// must still total ~1.0 to keep venture_score in 0-100. agentic_fit takes a 0.10 budget; the
// pre-existing 10 weights are scaled by 0.9 (relative ordering preserved) to make room.
const LEGACY_WEIGHTS = {
  cross_reference: 0.09,
  portfolio_evaluation: 0.09,
  problem_reframing: 0.045,
  moat_architecture: 0.117,
  chairman_constraints: 0.126,
  time_horizon: 0.09,
  archetypes: 0.09,
  build_cost: 0.09,
  virality: 0.117,
  tech_trajectory: 0.045,
  agentic_fit: 0.10, // v1 ratified starting weight; re-tunable via the evaluation_profiles SSOT
};

/**
 * All valid synthesis component names that can have weights.
 */
const VALID_COMPONENTS = Object.keys(LEGACY_WEIGHTS);

/**
 * SD-LEO-INFRA-STAGE0-POSTURE-SUCCESSOR-001 (CH-2): the second fail-open scorer is
 * retired. Profile resolution FAILS CLOSED — silently scoring with legacy defaults
 * is the same gauge-vs-action divergence class the posture seam killed (spec R2).
 */
export class ProfileResolutionError extends Error {
  /** @param {string} reason - no_supabase_client | profile_not_found | no_active_posture... */
  constructor(reason, detail) {
    super(`Evaluation profile resolution failed (${reason})${detail ? `: ${detail}` : ''} — synthesis scoring fails closed; activate a profile in evaluation_profiles (CH-2, no legacy fallback)`);
    this.name = 'ProfileResolutionError';
    this.reason = reason;
  }
}

/**
 * Resolve the evaluation profile to use for a synthesis run. Fail-closed:
 * throws ProfileResolutionError — there is no legacy-defaults fallback
 * (the fallback factory was retired by SD-LEO-INFRA-STAGE0-POSTURE-SUCCESSOR-001).
 *
 * Resolution order:
 * 1. Explicit profile_id → fetch by ID (missing → throws)
 * 2. No profile_id → fetch the active profile (none → throws)
 *
 * @param {Object} deps
 * @param {Object} deps.supabase - Supabase client (required)
 * @param {Object} [deps.logger] - Logger
 * @param {string} [profileId] - Optional explicit profile UUID
 * @returns {Promise<Object>} Resolved profile { name, version, weights, source }
 * @throws {ProfileResolutionError}
 */
export async function resolveProfile(deps = {}, profileId = null) {
  const { supabase, logger = console } = deps;

  if (!supabase) {
    throw new ProfileResolutionError('no_supabase_client');
  }

  let profile;

  if (profileId) {
    // Explicit profile requested
    const { data, error } = await supabase
      .from('evaluation_profiles')
      .select('id, name, version, weights, gate_thresholds, description')
      .eq('id', profileId)
      .single();

    if (error || !data) {
      throw new ProfileResolutionError('profile_not_found', String(profileId));
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
      throw new ProfileResolutionError('no_active_profile', error?.message);
    }
    profile = data;
  }

  // Validate and normalize weights
  const weights = normalizeWeights(profile.weights);

  logger.log(`   Profile service: resolved ${profile.name} v${profile.version} (${profileId ? 'explicit' : 'active'})`);

  return {
    id: profile.id,
    name: profile.name,
    version: profile.version,
    description: profile.description,
    weights,
    gate_thresholds: profile.gate_thresholds || {},
    source: profileId ? 'explicit' : 'active',
  };
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
      // C6/H6/H7 (Delta-ledger 41a2e6da) UNIFYING ACCEPTANCE: distinguishes a component's
      // failure/outage path from a genuinely-computed low score — a consumer must never
      // have to infer "did this fail?" from the raw number alone.
      failed: result?._failed === true,
      // M1: these components map a small set of discrete categories/buckets onto a
      // number (e.g. build_cost has exactly 4 possible values) rather than measuring a
      // continuous quantity — flagged so a consumer doesn't mistake bucket granularity
      // for measurement precision.
      categorical: CATEGORICAL_COMPONENTS.has(component),
    });
  }

  return {
    total_score: Math.round(totalScore),
    breakdown: breakdown.sort((a, b) => b.contribution - a.contribution),
  };
}

// M1 (Delta-ledger 41a2e6da): components whose extractComponentScore case is a
// categorical-to-number map (a handful of discrete buckets), not a continuous score.
const CATEGORICAL_COMPONENTS = new Set(['problem_reframing', 'build_cost', 'time_horizon', 'chairman_constraints']);

/**
 * Extract a 0-100 score from a synthesis component result.
 * Each component stores its score in different fields.
 */
function extractComponentScore(component, result) {
  if (!result) return 0;
  // C6 (Delta-ledger 41a2e6da) UNIFYING ACCEPTANCE, single chokepoint for the whole zone:
  // a component that failed/outaged must never score >= neutral (50) just because its
  // fallback object's placeholder fields (e.g. time_horizon's default position:'build_now',
  // archetypes' primary_confidence:0) happen to map to a high or constant value below.
  // Every component's Promise.all catch in synthesis/index.js already stamps `_failed:
  // true` — this is where that marker is finally honored by the score itself, not just
  // the maturity gate.
  if (result._failed === true) return 0;

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
      // C6: 'build_soon' was a dead branch — VALID_POSITIONS (time-horizon.js) can never
      // emit it. 'window_closing' IS a real, emittable value that had no case at all here
      // and silently fell through to the generic 50 default.
      return result.position === 'build_now' ? 100
        : result.position === 'window_closing' ? 60
        : result.position === 'park_and_build_later' ? 25 : 50;
    case 'archetypes':
      // C6: unit bug — primary_confidence is already 0-100 scale (archetypes.js emits
      // e.g. 85, falls back to 50), so multiplying by 100 clamped this to 100 for every
      // venture including the parse-garbage fallback.
      return clamp(result.primary_confidence ?? 0, 0, 100);
    case 'build_cost':
      return result.complexity === 'simple' ? 90
        : result.complexity === 'moderate' ? 60
        : result.complexity === 'complex' ? 30 : 50;
    case 'virality':
      return clamp(result.virality_score ?? 0, 0, 100);
    case 'tech_trajectory':
      return clamp(result.trajectory_score ?? 0, 0, 100);
    case 'agentic_fit':
      // SD-EHG-FACTORY-AGENTIC-FIT-SELECTION-001 (FR-4): the post-multiplier/disadvantage
      // 0-100 agentic_fit_score feeds the weighted venture_score component.
      return clamp(result.agentic_fit_score ?? 0, 0, 100);
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

// The fallback-profile factory was retired by SD-LEO-INFRA-STAGE0-POSTURE-SUCCESSOR-001
// (CH-2): the silent legacy-defaults return was the second fail-open scorer.

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * SD-LEO-INFRA-REALITY-GATE-ARTIFACT-001 FR-3: gate threshold defaults aligned with
 * the corrected `public.gate_boundary_config` seeds (FR-1). The previous values
 * referenced artifact_types no stage analyzer ever emitted — they were stale across
 * all 5 boundaries. The 0.5 fallback default in resolveGateThreshold() remains
 * (SECURITY C4) so missing-row callers degrade safely.
 *
 * The DB table `gate_boundary_config.quality_thresholds` (JSONB) is the canonical
 * source. This constant is a synchronous fallback for callers that cannot await
 * a DB read. Long-term, callers should migrate to async lookups against the DB.
 */
const LEGACY_GATE_THRESHOLDS = {
  '5->6': {
    truth_idea_brief: 0.5,
    truth_validation_decision: 0.6,
    truth_financial_model: 0.6,
  },
  '9->10': {
    engine_risk_matrix: 0.5,
    engine_pricing_model: 0.5,
    engine_business_model_canvas: 0.6,
  },
  '12->13': {
    engine_business_model_canvas: 0.7,
    identity_persona_brand: 0.5,
    identity_gtm_sales_strategy: 0.5,
  },
  '17->18': {
    system_devils_advocate_review: 0.6,
    blueprint_financial_projection: 0.5,
  },
  '23->24': {
    launch_readiness_checklist: 0.7,
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

/**
 * SD-LEO-INFRA-STAGE0-GOVERNED-POSTURE-001 (FR-2): governed selection-posture
 * resolution, per stage-zero-greenfield-spec.md R2.
 *
 * DELIBERATELY the opposite of resolveProfile's fail-open fallback: a selection
 * run that cannot resolve the active posture must FAIL, never silently apply
 * implicit default weights (the gauge-vs-action divergence class). There is no
 * fallback constant and no legacy branch here by design.
 */
export class PostureResolutionError extends Error {
  /**
   * @param {string} reason - no_supabase_client | store_unavailable |
   *   no_active_posture | ambiguous_active_posture | invalid_posture_weights
   * @param {string} [detail]
   */
  constructor(reason, detail) {
    super(`Selection posture resolution failed (${reason})${detail ? `: ${detail}` : ''} — selection runs fail closed; ratify/activate a posture in selection_postures (spec R2)`);
    this.name = 'PostureResolutionError';
    this.reason = reason;
  }
}

/**
 * Resolve the ACTIVE selection posture. Fail-closed: throws PostureResolutionError
 * on any condition that would otherwise require guessing at weights.
 *
 * @param {Object} deps
 * @param {Object} deps.supabase - Supabase client (required)
 * @param {Object} [deps.logger]
 * @returns {Promise<Object>} { id, phase_key, version, posture_version, display_name,
 *   criteria, ratified_by, ratified_at, expiry_condition, source: 'active' }
 * @throws {PostureResolutionError}
 */
export async function resolveActivePosture(deps = {}) {
  const { supabase, logger = console } = deps;

  if (!supabase) {
    throw new PostureResolutionError('no_supabase_client');
  }

  // Fetch ALL active rows — no .limit(1) masking; ambiguity must surface, not resolve arbitrarily.
  const { data, error } = await supabase
    .from('selection_postures')
    .select('id, phase_key, version, display_name, criteria, status, ratified_by, ratified_at, expiry_condition')
    .eq('status', 'active');

  if (error) {
    throw new PostureResolutionError('store_unavailable', error.message);
  }
  const rows = data || [];
  if (rows.length === 0) {
    throw new PostureResolutionError('no_active_posture');
  }
  if (rows.length > 1) {
    throw new PostureResolutionError('ambiguous_active_posture', rows.map(r => `${r.phase_key}@v${r.version}`).join(', '));
  }

  const posture = rows[0];
  const weights = posture.criteria?.weights;
  if (!weights || typeof weights !== 'object') {
    throw new PostureResolutionError('invalid_posture_weights', 'criteria.weights missing');
  }
  const sum = Object.values(weights).reduce((a, b) => a + (Number(b) || 0), 0);
  if (Math.abs(sum - 1.0) > 1e-9) {
    throw new PostureResolutionError('invalid_posture_weights', `weights sum to ${sum}, expected 1.0`);
  }

  const posture_version = `${posture.phase_key}@v${posture.version}`;
  logger.log(`   Posture service: resolved active posture ${posture_version}`);

  return {
    id: posture.id,
    phase_key: posture.phase_key,
    version: posture.version,
    posture_version,
    display_name: posture.display_name,
    criteria: posture.criteria,
    ratified_by: posture.ratified_by,
    ratified_at: posture.ratified_at,
    expiry_condition: posture.expiry_condition,
    source: 'active',
  };
}

/**
 * SD-LEO-INFRA-STAGE0-POSTURE-SUCCESSOR-001 (CH-4): posture transitions are chairman
 * ratification points (spec R2/R7). The app-layer surface enforces identity and records
 * the expiry evaluation; the DB's one-active partial unique index + the
 * active-requires-ratification CHECK remain the structural backstop.
 */
export class PostureTransitionError extends Error {
  /** @param {string} reason - machine_writer_refused | missing_ratification_ref |
   *  no_active_posture | target_not_found | store_unavailable */
  constructor(reason, detail) {
    super(`Posture transition refused (${reason})${detail ? `: ${detail}` : ''} — transitions are chairman ratification points (spec R2/R7); no machine writer can transition phases`);
    this.name = 'PostureTransitionError';
    this.reason = reason;
  }
}

/**
 * Evaluate the ACTIVE posture's Phase-1 expiry condition against ground truth:
 * 'one venture completes all 26 stages through real launch/ops/revenue'.
 * NEVER guesses — unqueryable ground truth returns met:false with evidence.
 *
 * @param {Object} deps - { supabase, logger }
 * @returns {Promise<{met: boolean, evidence: string, evaluated_at: string}>}
 */
export async function evaluatePhase1Expiry(deps = {}) {
  const { supabase } = deps;
  if (!supabase) {
    return { met: false, evidence: 'insufficient_data: no supabase client', evaluated_at: new Date().toISOString() };
  }
  const { data, error } = await supabase
    .from('ventures')
    .select('id, name, current_lifecycle_stage, status')
    .gt('current_lifecycle_stage', 26)
    .limit(1);

  if (error) {
    return { met: false, evidence: `insufficient_data: ${error.message}`, evaluated_at: new Date().toISOString() };
  }
  if (data && data.length > 0) {
    return { met: true, evidence: `venture ${data[0].name} (${data[0].id}) passed stage 26`, evaluated_at: new Date().toISOString() };
  }
  return { met: false, evidence: 'no venture has completed all 26 stages', evaluated_at: new Date().toISOString() };
}

/**
 * Chairman-gated posture phase transition. Expires the active posture (recording the
 * expiry evaluation) and activates the ratified successor.
 *
 * @param {Object} params
 * @param {string} params.toPhaseKey - successor phase_key (e.g. 'phase_2_success_weighted')
 * @param {number} [params.toVersion=1]
 * @param {string} params.ratifiedBy - MUST be 'chairman' (identity enforced; machine writers refused)
 * @param {string} params.ratificationRef - non-empty reference to the ratification decision
 * @param {Object} deps - { supabase, logger }
 * @returns {Promise<{expired: Object, activated: Object, expiry_evaluation: Object}>}
 * @throws {PostureTransitionError}
 */
export async function transitionPosture(params = {}, deps = {}) {
  const { toPhaseKey, toVersion = 1, ratifiedBy, ratificationRef } = params;
  const { supabase, logger = console } = deps;

  if (!supabase) throw new PostureTransitionError('store_unavailable', 'no supabase client');
  if (ratifiedBy !== 'chairman') throw new PostureTransitionError('machine_writer_refused', `ratifiedBy='${ratifiedBy}'`);
  if (!ratificationRef || !String(ratificationRef).trim()) throw new PostureTransitionError('missing_ratification_ref');
  if (!toPhaseKey) throw new PostureTransitionError('target_not_found', 'toPhaseKey required');

  // Current active posture (fail-closed resolution).
  let active;
  try {
    active = await resolveActivePosture({ supabase, logger });
  } catch (err) {
    throw new PostureTransitionError('no_active_posture', err.message);
  }

  // Target row must exist and not be the active one.
  const { data: target, error: targetErr } = await supabase
    .from('selection_postures')
    .select('id, phase_key, version, status')
    .eq('phase_key', toPhaseKey)
    .eq('version', toVersion)
    .maybeSingle();
  if (targetErr) throw new PostureTransitionError('store_unavailable', targetErr.message);
  if (!target) throw new PostureTransitionError('target_not_found', `${toPhaseKey}@v${toVersion}`);
  if (target.id === active.id) throw new PostureTransitionError('target_not_found', 'target is already the active posture');

  // Evaluate + record the outgoing phase's expiry condition (audit, not a veto —
  // the chairman may ratify a transition before the pre-declared expiry fires).
  const expiryEvaluation = await evaluatePhase1Expiry({ supabase, logger });

  const now = new Date().toISOString();

  // 1) Expire the outgoing active row, recording the evaluation.
  const { data: expired, error: expireErr } = await supabase
    .from('selection_postures')
    .update({
      status: 'expired',
      expired_at: now,
      transition_condition: JSON.stringify({
        transitioned_to: `${toPhaseKey}@v${toVersion}`,
        ratified_by: ratifiedBy,
        ratification_ref: ratificationRef,
        expiry_evaluation: expiryEvaluation,
      }),
    })
    .eq('id', active.id)
    .select()
    .single();
  if (expireErr) throw new PostureTransitionError('store_unavailable', `expire failed: ${expireErr.message}`);

  // 2) Activate the ratified successor (DB CHECK enforces ratified_at on active).
  const { data: activated, error: activateErr } = await supabase
    .from('selection_postures')
    .update({
      status: 'active',
      ratified_by: ratifiedBy,
      ratified_at: now,
      ratification_ref: ratificationRef,
      activated_at: now,
    })
    .eq('id', target.id)
    .select()
    .single();
  if (activateErr) throw new PostureTransitionError('store_unavailable', `activate failed: ${activateErr.message} (outgoing posture expired ${active.posture_version} — restore it manually if this persists)`);

  logger.log(`   Posture service: transitioned ${active.posture_version} → ${toPhaseKey}@v${toVersion} (ratified: ${ratificationRef})`);
  return { expired, activated, expiry_evaluation: expiryEvaluation };
}

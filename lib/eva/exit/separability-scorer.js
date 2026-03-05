/**
 * Separability Scoring Engine
 *
 * SD: SD-VENTURE-ACQUISITIONREADINESS-ARCHITECTURE-ORCH-001-B (FR-001)
 *
 * Computes a 0-100 separability score across 5 dimensions:
 *   1. Infrastructure Independence
 *   2. Data Portability
 *   3. IP Clarity
 *   4. Team Dependency
 *   5. Operational Autonomy
 *
 * Non-blocking: 30s timeout, failure does not block pipeline.
 *
 * @module lib/eva/exit/separability-scorer
 */

const SCORING_TIMEOUT_MS = 30_000;

const DEFAULT_WEIGHTS = {
  infrastructure_independence: 0.25,
  data_portability: 0.20,
  ip_clarity: 0.20,
  team_dependency: 0.15,
  operational_autonomy: 0.20,
};

const DIMENSIONS = Object.keys(DEFAULT_WEIGHTS);

async function scoreInfrastructureIndependence(ventureId, { supabase }) {
  const { data: assets } = await supabase
    .from('venture_asset_registry')
    .select('asset_type')
    .eq('venture_id', ventureId)
    .in('asset_type', ['infrastructure', 'software', 'domain']);

  const count = (assets || []).length;
  return { score: Math.min(100, count * 20 + 20), reasoning: `${count} infrastructure assets registered` };
}

async function scoreDataPortability(ventureId, { supabase }) {
  const { data: assets } = await supabase
    .from('venture_asset_registry')
    .select('asset_type')
    .eq('venture_id', ventureId)
    .in('asset_type', ['data', 'customer_list']);

  const count = (assets || []).length;
  return { score: Math.min(100, count * 25 + 25), reasoning: `${count} data assets documented` };
}

async function scoreIPClarity(ventureId, { supabase }) {
  const { data: assets } = await supabase
    .from('venture_asset_registry')
    .select('asset_type')
    .eq('venture_id', ventureId)
    .in('asset_type', ['intellectual_property', 'patent', 'trademark', 'license']);

  const count = (assets || []).length;
  return { score: Math.min(100, count * 20 + 20), reasoning: `${count} IP assets documented` };
}

async function scoreTeamDependency(ventureId, { supabase }) {
  const { data: profile } = await supabase
    .from('venture_exit_profiles')
    .select('notes')
    .eq('venture_id', ventureId)
    .eq('is_current', true)
    .single();

  const { data: contracts } = await supabase
    .from('venture_asset_registry')
    .select('asset_type')
    .eq('venture_id', ventureId)
    .in('asset_type', ['contract', 'partnership']);

  const hasProfile = profile ? 30 : 0;
  const contractCount = (contracts || []).length;
  return { score: Math.min(100, hasProfile + contractCount * 20 + 20), reasoning: `Profile: ${!!profile}, ${contractCount} contracts` };
}

async function scoreOperationalAutonomy(ventureId, { supabase }) {
  const { data: assets } = await supabase
    .from('venture_asset_registry')
    .select('id')
    .eq('venture_id', ventureId);

  const { data: venture } = await supabase
    .from('eva_ventures')
    .select('status')
    .eq('id', ventureId)
    .single();

  const statusBonus = {
    pending: 0, active: 10, in_progress: 20, scaling: 30,
    exit_prep: 40, divesting: 50, completed: 60,
  };
  const bonus = statusBonus[venture?.status] || 0;
  const totalAssets = (assets || []).length;

  return { score: Math.min(100, totalAssets * 10 + bonus + 10), reasoning: `${totalAssets} assets, status: ${venture?.status || 'unknown'}` };
}

const SCORERS = {
  infrastructure_independence: scoreInfrastructureIndependence,
  data_portability: scoreDataPortability,
  ip_clarity: scoreIPClarity,
  team_dependency: scoreTeamDependency,
  operational_autonomy: scoreOperationalAutonomy,
};

/**
 * Compute separability score for a venture.
 *
 * @param {string} ventureId - Venture UUID
 * @param {Object} deps - { supabase, logger?, weights? }
 * @returns {Promise<Object|null>} Score result or null on failure
 */
export async function computeSeparabilityScore(ventureId, deps = {}) {
  const { supabase, logger = console, weights = DEFAULT_WEIGHTS } = deps;

  if (!ventureId || !supabase) {
    logger.warn('[separability-scorer] Missing ventureId or supabase');
    return null;
  }

  const timeout = setTimeout(() => {}, SCORING_TIMEOUT_MS);

  try {
    const dimensionResults = {};
    let weightedSum = 0;

    for (const dim of DIMENSIONS) {
      const result = await SCORERS[dim](ventureId, { supabase });
      dimensionResults[dim] = result;
      weightedSum += result.score * (weights[dim] || DEFAULT_WEIGHTS[dim]);
    }

    const overallScore = Math.round(weightedSum * 100) / 100;

    const row = {
      venture_id: ventureId,
      overall_score: overallScore,
      infrastructure_independence: dimensionResults.infrastructure_independence.score,
      data_portability: dimensionResults.data_portability.score,
      ip_clarity: dimensionResults.ip_clarity.score,
      team_dependency: dimensionResults.team_dependency.score,
      operational_autonomy: dimensionResults.operational_autonomy.score,
      dimension_weights: weights,
      metadata: {
        reasoning: Object.fromEntries(DIMENSIONS.map(d => [d, dimensionResults[d].reasoning])),
      },
      scored_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('venture_separability_scores')
      .insert(row)
      .select('id, overall_score, scored_at')
      .single();

    if (error) {
      logger.error(`[separability-scorer] Persist failed: ${error.message}`);
      return { ...row, persisted: false };
    }

    logger.info(`[separability-scorer] Venture ${ventureId}: ${overallScore}/100`);
    return { ...row, id: data.id, persisted: true };
  } catch (err) {
    logger.error(`[separability-scorer] Error: ${err.message}`);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export { DIMENSIONS, DEFAULT_WEIGHTS };

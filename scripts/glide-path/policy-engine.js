/**
 * Portfolio Allocation Policy Engine
 * Scores ventures against the active policy to assign growth_strategy,
 * portfolio_synergy_score, and time_horizon_classification.
 */

/**
 * Score a venture against a policy.
 * @param {object} ventureData - Venture fields (archetype, metrics, etc.)
 * @param {object} policy - Active policy row from portfolio_allocation_policies.
 * @returns {object} ScoreResult with composite_score, growth_strategy, etc.
 */
export function scoreVenture(ventureData, policy) {
  const dimensions = policy.dimensions || [];
  const weights = policy.weights || {};
  const phaseDefs = policy.phase_definitions || [];

  // Compute per-dimension scores
  const dimensionScores = {};
  let weightedSum = 0;
  let totalWeight = 0;

  for (const dim of dimensions) {
    const raw = extractDimensionValue(ventureData, dim);
    const normalized = normalizeDimension(raw, dim);
    dimensionScores[dim.key] = normalized;
    const w = weights[dim.key] || 0;
    weightedSum += normalized * w;
    totalWeight += w;
  }

  const compositeScore = totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 100) : 50;

  // Determine phase from composite score
  const phase = determinePhase(compositeScore, phaseDefs);

  // Assign growth_strategy from phase
  const growthStrategy = assignGrowthStrategy(phase, phaseDefs);

  // Compute portfolio synergy (simplified: how well venture fits current phase)
  const synergy = computeSynergyScore(compositeScore, phase, policy);

  // Determine time horizon
  const timeHorizon = determineTimeHorizon(phase, phaseDefs);

  return {
    venture_id: ventureData.id || null,
    composite_score: compositeScore,
    growth_strategy: growthStrategy,
    portfolio_synergy_score: Math.round(synergy * 100) / 100,
    time_horizon_classification: timeHorizon,
    phase: phase?.phase || 'unknown',
    dimension_scores: dimensionScores,
    policy_version: policy.policy_version
  };
}

/**
 * Get phase definitions from a policy, ordered by min_score.
 */
export function getPhaseArchetypes(policy) {
  return (policy.phase_definitions || [])
    .slice()
    .sort((a, b) => (a.min_score || 0) - (b.min_score || 0));
}

/**
 * Check if an archetype is unlocked given the composite score and current phase.
 */
export function isArchetypeUnlocked(archetype, compositeScore, currentPhase, policy) {
  const conditions = policy.archetype_unlock_conditions || {};
  const rule = conditions[archetype];
  if (!rule) return true; // No rule = always unlocked

  const scoreOk = compositeScore >= (rule.min_score || 0);
  const phaseOk = !rule.required_phase || rule.required_phase === currentPhase;
  return scoreOk && phaseOk;
}

// --- Internal helpers ---

function extractDimensionValue(ventureData, dim) {
  if (dim.source_field && ventureData[dim.source_field] != null) {
    return Number(ventureData[dim.source_field]) || 0;
  }
  return dim.default_value || 50;
}

function normalizeDimension(raw, dim) {
  const min = dim.min || 0;
  const max = dim.max || 100;
  const clamped = Math.max(min, Math.min(max, raw));
  if (max === min) return 0.5;

  if (dim.normalization === 'log10' && clamped > 0) {
    const logMin = min > 0 ? Math.log10(min) : 0;
    const logMax = Math.log10(max);
    const logVal = Math.log10(clamped);
    return logMax > logMin ? (logVal - logMin) / (logMax - logMin) : 0.5;
  }

  return (clamped - min) / (max - min);
}

function determinePhase(compositeScore, phaseDefs) {
  const sorted = phaseDefs.slice().sort((a, b) => (b.min_score || 0) - (a.min_score || 0));
  for (const phase of sorted) {
    if (compositeScore >= (phase.min_score || 0)) return phase;
  }
  return sorted[sorted.length - 1] || null;
}

function assignGrowthStrategy(phase, _phaseDefs) {
  if (!phase || !phase.allowed_growth_strategies || phase.allowed_growth_strategies.length === 0) {
    return 'capability_builder';
  }
  // Prefer cash_engine if available (capital accumulation bias)
  if (phase.allowed_growth_strategies.includes('cash_engine')) return 'cash_engine';
  return phase.allowed_growth_strategies[0];
}

function computeSynergyScore(compositeScore, phase, _policy) {
  if (!phase) return 0.5;
  const midpoint = ((phase.min_score || 0) + (phase.max_score || 100)) / 2;
  const range = ((phase.max_score || 100) - (phase.min_score || 0)) / 2;
  if (range === 0) return 0.5;
  const distance = Math.abs(compositeScore - midpoint);
  return Math.max(0, 1 - (distance / range));
}

function determineTimeHorizon(phase, _phaseDefs) {
  if (!phase) return 'park_later';
  const classification = phase.time_horizon_classification;
  if (classification === 'short') return 'build_now';
  if (classification === 'long') return 'park_later';
  if (classification === 'medium') return 'build_now';
  return 'build_now';
}

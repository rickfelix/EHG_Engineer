/**
 * Expand-vs-Spinoff Evaluator: DFE-Based Scope Assessment
 * SD-EVA-FEAT-EXPAND-SPINOFF-001
 *
 * Determines if a venture at Stage 25 should expand within its
 * existing entity or spin off into a new entity. Uses financial,
 * market, and operational criteria with weighted scoring.
 *
 * @module lib/eva/expand-spinoff-evaluator
 */

import { loadContext, emit, ServiceError } from './shared-services.js';

export const MODULE_VERSION = '1.0.0';

/** @type {{financial: number, market: number, operational: number}} */
const DEFAULT_WEIGHTS = {
  financial: 0.40,
  market: 0.35,
  operational: 0.25,
};

const REQUIRED_STAGE = 25;

// ── Weight Validation ───────────────────────────────────

/**
 * Validate that dimension weights sum to 1.0 (within tolerance).
 *
 * @param {{financial: number, market: number, operational: number}} weights
 * @throws {ServiceError} INVALID_WEIGHTS if sum deviates from 1.0
 */
function validateWeights(weights) {
  const sum = weights.financial + weights.market + weights.operational;
  if (Math.abs(sum - 1.0) > 0.001) {
    throw new ServiceError(
      'INVALID_WEIGHTS',
      `Dimension weights must sum to 1.0, got ${sum.toFixed(4)}`,
      'expand-spinoff-evaluator',
    );
  }
}

// ── Dimension Evaluators ────────────────────────────────

/**
 * Evaluate financial criteria.
 *
 * @param {object} venture - Venture row from DB
 * @returns {{score: number, factors: object, recommendation: string, dataCompleteness: number}}
 */
function evaluateFinancial(venture) {
  const meta = venture.metadata || {};
  const financials = meta.financials || {};

  const factors = {
    revenueGrowth: financials.revenue_growth ?? null,
    marginTrajectory: financials.margin_trajectory ?? null,
    capitalRequirements: financials.capital_requirements ?? null,
    burnRate: financials.burn_rate ?? null,
  };

  const available = Object.values(factors).filter(v => v !== null);
  const dataCompleteness = available.length / Object.keys(factors).length;

  if (available.length === 0) {
    return { score: 50, factors, recommendation: 'neutral', dataCompleteness: 0 };
  }

  // Score each factor: higher revenue growth, better margins, lower capital needs, lower burn → expand
  let score = 50; // neutral baseline

  if (factors.revenueGrowth !== null) {
    score += factors.revenueGrowth > 20 ? 15 : factors.revenueGrowth > 10 ? 8 : -5;
  }
  if (factors.marginTrajectory !== null) {
    score += factors.marginTrajectory > 0 ? 10 : -10;
  }
  if (factors.capitalRequirements !== null) {
    // High capital = spinoff (independent fundraising), low = expand
    score += factors.capitalRequirements > 1_000_000 ? -15 : 10;
  }
  if (factors.burnRate !== null) {
    score += factors.burnRate < 50_000 ? 10 : factors.burnRate < 200_000 ? 0 : -10;
  }

  score = Math.max(0, Math.min(100, score));
  const recommendation = score >= 60 ? 'expand' : score <= 40 ? 'spinoff' : 'neutral';

  return { score, factors, recommendation, dataCompleteness };
}

/**
 * Evaluate market criteria.
 *
 * @param {object} venture - Venture row from DB
 * @returns {{score: number, factors: object, recommendation: string, dataCompleteness: number}}
 */
function evaluateMarket(venture) {
  const meta = venture.metadata || {};
  const market = meta.market || {};

  const factors = {
    marketSize: market.market_size ?? null,
    competitivePosition: market.competitive_position ?? null,
    expansionPotential: market.expansion_potential ?? null,
    marketShare: market.market_share ?? null,
  };

  const available = Object.values(factors).filter(v => v !== null);
  const dataCompleteness = available.length / Object.keys(factors).length;

  if (available.length === 0) {
    return { score: 50, factors, recommendation: 'neutral', dataCompleteness: 0 };
  }

  let score = 50;

  if (factors.marketSize !== null) {
    // Large market = spinoff opportunity, small = expand within parent
    score += factors.marketSize > 1_000_000_000 ? -10 : 10;
  }
  if (factors.competitivePosition !== null) {
    // Strong position = expand, weak = spinoff for agility
    score += factors.competitivePosition > 7 ? 15 : factors.competitivePosition > 4 ? 5 : -10;
  }
  if (factors.expansionPotential !== null) {
    score += factors.expansionPotential > 7 ? -10 : 10; // High expansion = spinoff
  }
  if (factors.marketShare !== null) {
    score += factors.marketShare > 20 ? 10 : factors.marketShare > 5 ? 0 : -5;
  }

  score = Math.max(0, Math.min(100, score));
  const recommendation = score >= 60 ? 'expand' : score <= 40 ? 'spinoff' : 'neutral';

  return { score, factors, recommendation, dataCompleteness };
}

/**
 * Evaluate operational criteria.
 *
 * @param {object} venture - Venture row from DB
 * @returns {{score: number, factors: object, recommendation: string, dataCompleteness: number}}
 */
function evaluateOperational(venture) {
  const meta = venture.metadata || {};
  const ops = meta.operational || {};

  const factors = {
    teamCapacity: ops.team_capacity ?? null,
    infrastructureReadiness: ops.infrastructure_readiness ?? null,
    processMaturity: ops.process_maturity ?? null,
  };

  const available = Object.values(factors).filter(v => v !== null);
  const dataCompleteness = available.length / Object.keys(factors).length;

  if (available.length === 0) {
    return { score: 50, factors, recommendation: 'neutral', dataCompleteness: 0 };
  }

  let score = 50;

  if (factors.teamCapacity !== null) {
    // High capacity = expand, low = spinoff (needs independence)
    score += factors.teamCapacity > 7 ? 15 : factors.teamCapacity > 4 ? 5 : -10;
  }
  if (factors.infrastructureReadiness !== null) {
    score += factors.infrastructureReadiness > 7 ? 10 : factors.infrastructureReadiness > 4 ? 0 : -10;
  }
  if (factors.processMaturity !== null) {
    score += factors.processMaturity > 7 ? 10 : factors.processMaturity > 4 ? 0 : -10;
  }

  score = Math.max(0, Math.min(100, score));
  const recommendation = score >= 60 ? 'expand' : score <= 40 ? 'spinoff' : 'neutral';

  return { score, factors, recommendation, dataCompleteness };
}

// ── Main Evaluate Function ──────────────────────────────

/**
 * Evaluate a venture for expand-vs-spinoff decision.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} ventureId - UUID of the venture
 * @param {{weights?: {financial: number, market: number, operational: number}}} [config]
 * @returns {Promise<{recommendation: string, confidence: number, dimensions: object, evidence: object, dataCompleteness: number}>}
 */
export async function evaluate(supabase, ventureId, config = {}) {
  const weights = config.weights || DEFAULT_WEIGHTS;
  validateWeights(weights);

  // Load context — stage must be 25
  const ctx = await loadContext(supabase, ventureId, REQUIRED_STAGE, 'expand-spinoff-evaluator');

  if (!ctx.stage) {
    throw new ServiceError(
      'STAGE_MISMATCH',
      `Venture ${ventureId} has no Stage ${REQUIRED_STAGE} record`,
      'expand-spinoff-evaluator',
    );
  }

  // Emit start event
  await emit(supabase, 'evaluation_started', {
    ventureId,
    evaluationType: 'expand-vs-spinoff',
    stage: REQUIRED_STAGE,
  }, 'expand-spinoff-evaluator');

  // Evaluate dimensions
  const financial = evaluateFinancial(ctx.venture);
  const market = evaluateMarket(ctx.venture);
  const operational = evaluateOperational(ctx.venture);

  // Weighted composite score
  const compositeScore =
    financial.score * weights.financial +
    market.score * weights.market +
    operational.score * weights.operational;

  // Data completeness (weighted average)
  const dataCompleteness =
    financial.dataCompleteness * weights.financial +
    market.dataCompleteness * weights.market +
    operational.dataCompleteness * weights.operational;

  // Confidence: base from data completeness, adjusted by agreement between dimensions
  const recommendations = [financial.recommendation, market.recommendation, operational.recommendation];
  const agreement = recommendations.filter(r => r === recommendations[0]).length / 3;
  const confidence = Math.round(dataCompleteness * 70 + agreement * 30);

  // Final recommendation
  const recommendation = compositeScore >= 60 ? 'expand' : compositeScore <= 40 ? 'spinoff' : 'neutral';

  const result = {
    recommendation,
    confidence,
    compositeScore: Math.round(compositeScore),
    dimensions: {
      financial: { ...financial, weight: weights.financial },
      market: { ...market, weight: weights.market },
      operational: { ...operational, weight: weights.operational },
    },
    evidence: {
      ventureId,
      stage: REQUIRED_STAGE,
      archetype: ctx.venture.archetype,
      weightsUsed: weights,
      evaluatedAt: new Date().toISOString(),
    },
    dataCompleteness: Math.round(dataCompleteness * 100),
  };

  // Emit completion event
  await emit(supabase, 'evaluation_completed', {
    ventureId,
    evaluationType: 'expand-vs-spinoff',
    recommendation,
    confidence,
    compositeScore: result.compositeScore,
  }, 'expand-spinoff-evaluator');

  return result;
}

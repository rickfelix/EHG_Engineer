/**
 * Advanced Portfolio Optimization: Resource Contention + Priority Re-Ranking
 * SD-EVA-FEAT-PORTFOLIO-OPT-001
 *
 * Detects resource contention across ventures, scores by urgency/ROI,
 * enforces portfolio balance constraints, and re-ranks priorities.
 *
 * @module lib/eva/portfolio-optimizer
 */

import { emit, ServiceError } from './shared-services.js';
import { createAdvisoryNotification } from './chairman-decision-watcher.js';
import { getDependencyGraph } from './dependency-manager.js';

export const MODULE_VERSION = '1.2.0';

const DEFAULT_WEIGHTS = {
  urgency: 0.30,
  roi: 0.25,
  financial: 0.20,
  market: 0.15,
  health: 0.10,
};

const DEFAULT_BALANCE_CAP = 0.40;
const DEFAULT_TIEBREAKER_TOLERANCE = 2;

// ── Dependency Provider Boost ────────────────────────────

/** Points added per dependent venture (capped at PROVIDER_BOOST_CAP) */
const PROVIDER_BOOST_PER_DEPENDENT = 5;
const PROVIDER_BOOST_CAP = 15;

// ── Weight Validation ───────────────────────────────────

/**
 * Validate that scoring weights sum to 1.0 (within tolerance).
 *
 * @param {{urgency: number, roi: number}} weights
 * @throws {ServiceError} INVALID_WEIGHTS if sum deviates from 1.0
 */
function validateWeights(weights) {
  const sum = Object.values(weights).reduce((s, v) => s + v, 0);
  if (Math.abs(sum - 1.0) > 0.001) {
    throw new ServiceError(
      'INVALID_WEIGHTS',
      `Scoring weights must sum to 1.0, got ${sum.toFixed(4)}`,
      'portfolio-optimizer',
    );
  }
}

// ── Resource Contention Detection ───────────────────────

/**
 * Detect resource contention across ventures with severity scoring.
 *
 * @param {object[]} ventures - Array of venture rows
 * @param {Record<string, number>} [capacities] - Per-resource capacity overrides (default 1.0 each)
 * @returns {{conflicts: Array<{resourceType: string, ventureIds: string[], totalDemand: number, capacity: number, severity: string}>, hasContention: boolean}}
 */
function detectContention(ventures, capacities = {}) {
  const resourceDemand = {};

  for (const v of ventures) {
    const resources = v.metadata?.resources || {};
    for (const [type, demand] of Object.entries(resources)) {
      if (type === 'total_allocation') continue; // skip aggregate field
      if (!resourceDemand[type]) resourceDemand[type] = [];
      resourceDemand[type].push({ ventureId: v.id, demand: demand ?? 0 });
    }
  }

  const conflicts = [];
  for (const [type, entries] of Object.entries(resourceDemand)) {
    if (entries.length > 1) {
      const totalDemand = entries.reduce((sum, e) => sum + e.demand, 0);
      const capacity = capacities[type] ?? 1.0;
      const severity = classifySeverity(totalDemand, capacity);
      conflicts.push({
        resourceType: type,
        ventureIds: entries.map(e => e.ventureId),
        totalDemand,
        capacity,
        severity,
      });
    }
  }

  return { conflicts, hasContention: conflicts.length > 0 };
}

// ── Severity Classification ─────────────────────────────

/** @type {Record<string, {min: number, max: number}>} */
const SEVERITY_THRESHOLDS = {
  low: { min: 1.0, max: 1.2 },
  medium: { min: 1.2, max: 1.8 },
  high: { min: 1.8, max: 2.5 },
  critical: { min: 2.5, max: Infinity },
};

/**
 * Classify contention severity based on demand-to-capacity ratio.
 *
 * @param {number} totalDemand - Sum of all venture demands for a resource
 * @param {number} capacity - Available capacity (defaults to 1.0 = 100%)
 * @returns {'low'|'medium'|'high'|'critical'}
 */
function classifySeverity(totalDemand, capacity = 1.0) {
  if (capacity <= 0) return 'critical';
  const ratio = totalDemand / capacity;
  for (const [level, range] of Object.entries(SEVERITY_THRESHOLDS)) {
    if (ratio >= range.min && ratio < range.max) return level;
  }
  return 'low';
}

// ── Resolution Strategies ───────────────────────────────

/** @type {Record<string, string[]>} */
const STRATEGY_MAP = {
  low: ['log_only'],
  medium: ['suggest_realloc'],
  high: ['defer', 'suggest_realloc'],
  critical: ['escalate'],
};

/**
 * Select a resolution strategy for a contention conflict.
 * Provider ventures (those with dependents) are protected from deferral.
 *
 * @param {{resourceType: string, severity: string, ventureIds: string[], totalDemand: number}} conflict
 * @param {Array<{ventureId: string, priorityScore: number}>} rankings - Scored ventures
 * @param {Set<string>} [providerVentureIds] - Venture IDs that provide dependencies to others
 * @returns {{strategy: string, details: object}}
 */
function selectStrategy(conflict, rankings, providerVentureIds = new Set()) {
  const candidates = STRATEGY_MAP[conflict.severity] || ['log_only'];
  const strategy = candidates[0];

  const details = { resourceType: conflict.resourceType, severity: conflict.severity };

  if (strategy === 'suggest_realloc' || strategy === 'defer') {
    // Suggest deferring the lowest-priority non-provider venture in this conflict
    const ranked = conflict.ventureIds
      .map(id => rankings.find(r => r.ventureId === id))
      .filter(Boolean)
      .sort((a, b) => a.priorityScore - b.priorityScore);

    // Filter out provider ventures — deferring them would cascade-block dependents
    const nonProviders = ranked.filter(r => !providerVentureIds.has(r.ventureId));

    if (nonProviders.length > 0) {
      details.targetVentureId = nonProviders[0].ventureId;
      details.targetPriorityScore = nonProviders[0].priorityScore;
    } else if (ranked.length > 0) {
      // All ventures are providers — escalate instead of deferring
      details.escalatedReason = 'all_ventures_are_providers';
      return { strategy: 'escalate', details };
    }
  }

  return { strategy, details };
}

/**
 * Resolve contention conflicts by selecting strategies for each.
 *
 * @param {Array<{resourceType: string, ventureIds: string[], totalDemand: number, severity: string}>} conflicts
 * @param {Array<{ventureId: string, priorityScore: number}>} rankings
 * @param {Set<string>} [providerVentureIds] - Venture IDs that provide dependencies
 * @returns {Array<{resourceType: string, severity: string, strategy: string, details: object}>}
 */
function resolveContention(conflicts, rankings, providerVentureIds = new Set()) {
  return conflicts.map(conflict => {
    const { strategy, details } = selectStrategy(conflict, rankings, providerVentureIds);
    return {
      resourceType: conflict.resourceType,
      severity: conflict.severity,
      strategy,
      details,
    };
  });
}

// ── Signal Extractors ───────────────────────────────────

function extractUrgencyScore(meta) {
  let score = 50;
  const scheduling = meta.scheduling || {};
  if (scheduling.deadline_days != null) {
    score = scheduling.deadline_days <= 7 ? 90
      : scheduling.deadline_days <= 30 ? 70
      : scheduling.deadline_days <= 90 ? 40
      : 20;
  }
  if (scheduling.time_sensitive === true) {
    score = Math.min(100, score + 15);
  }
  return score;
}

function extractRoiScore(meta) {
  let score = 50;
  const financials = meta.financials || {};
  if (financials.revenue_growth != null) {
    score = financials.revenue_growth > 30 ? 90
      : financials.revenue_growth > 15 ? 70
      : financials.revenue_growth > 5 ? 50
      : 30;
  }
  if (financials.margin_trajectory != null) {
    score += financials.margin_trajectory > 0 ? 10 : -10;
  }
  return Math.max(0, Math.min(100, score));
}

function extractFinancialScore(meta) {
  const projections = meta.financials?.revenue_projections;
  if (projections == null) return 50;
  return projections > 50 ? 90
    : projections > 25 ? 70
    : projections > 10 ? 50
    : 30;
}

function extractMarketScore(meta) {
  const tam = meta.market?.tam_score;
  if (tam == null) return 50;
  return Math.max(0, Math.min(100, tam));
}

function extractHealthScore(meta) {
  const health = meta.health?.composite_score;
  if (health == null) return 50;
  return Math.max(0, Math.min(100, health));
}

// ── Maturity Confidence ─────────────────────────────────

function calculateMaturity(meta) {
  const progress = meta.stage_progress;
  if (progress == null) return 1.0;
  const ratio = Math.max(0, Math.min(1, progress / 25));
  return 0.5 + ratio * 0.5;
}

// ── Venture Scoring ─────────────────────────────────────

/**
 * Score a venture using multi-signal analysis.
 *
 * @param {object} venture - Venture row from DB
 * @param {object} weights - Signal weights (must sum to 1.0)
 * @returns {{urgencyScore: number, roiScore: number, financialScore: number, marketScore: number, healthScore: number, maturity: number, priorityScore: number}}
 */
function scoreVenture(venture, weights) {
  const meta = venture.metadata || {};

  const urgencyScore = extractUrgencyScore(meta);
  const roiScore = extractRoiScore(meta);
  const financialScore = extractFinancialScore(meta);
  const marketScore = extractMarketScore(meta);
  const healthScore = extractHealthScore(meta);
  const maturity = calculateMaturity(meta);

  const rawScore =
    urgencyScore * (weights.urgency ?? 0) +
    roiScore * (weights.roi ?? 0) +
    financialScore * (weights.financial ?? 0) +
    marketScore * (weights.market ?? 0) +
    healthScore * (weights.health ?? 0);

  const priorityScore = Math.round(rawScore * maturity);

  return { urgencyScore, roiScore, financialScore, marketScore, healthScore, maturity, priorityScore };
}

// ── Portfolio Balance ───────────────────────────────────

/**
 * Enforce portfolio balance constraints.
 *
 * @param {Array<{ventureId: string, allocation: number, priorityScore: number}>} allocations
 * @param {number} balanceCap - Max fraction per venture (default 0.40)
 * @returns {{rebalanced: boolean, before: Record<string, number>, after: Record<string, number>, adjustments: Array<{ventureId: string, from: number, to: number}>}}
 */
function enforceBalance(allocations, balanceCap) {
  const total = allocations.reduce((sum, a) => sum + a.allocation, 0);
  if (total === 0) {
    return {
      rebalanced: false,
      before: {},
      after: {},
      adjustments: [],
    };
  }

  const before = {};
  const fractions = {};
  for (const a of allocations) {
    const frac = a.allocation / total;
    before[a.ventureId] = frac;
    fractions[a.ventureId] = frac;
  }

  let excess = 0;
  const capped = [];
  const uncapped = [];

  for (const a of allocations) {
    if (fractions[a.ventureId] > balanceCap) {
      excess += fractions[a.ventureId] - balanceCap;
      fractions[a.ventureId] = balanceCap;
      capped.push(a.ventureId);
    } else {
      uncapped.push(a);
    }
  }

  if (capped.length === 0) {
    return {
      rebalanced: false,
      before,
      after: { ...before },
      adjustments: [],
    };
  }

  // Redistribute excess proportionally by priority score
  const totalPriority = uncapped.reduce((sum, a) => sum + a.priorityScore, 0);
  if (totalPriority > 0) {
    for (const a of uncapped) {
      const share = (a.priorityScore / totalPriority) * excess;
      fractions[a.ventureId] += share;
    }
  }

  const adjustments = [];
  for (const id of Object.keys(fractions)) {
    if (Math.abs(fractions[id] - before[id]) > 0.001) {
      adjustments.push({
        ventureId: id,
        from: Math.round(before[id] * 100) / 100,
        to: Math.round(fractions[id] * 100) / 100,
      });
    }
  }

  return {
    rebalanced: true,
    before,
    after: fractions,
    adjustments,
  };
}

// ── Main Optimize Function ──────────────────────────────

/**
 * Optimize a portfolio of ventures with contention resolution.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string[]} ventureIds - Array of venture UUIDs to optimize
 * @param {{weights?: object, balanceCap?: number, dryRun?: boolean, tiebreakerTolerance?: number, capacities?: Record<string, number>}} [config]
 * @returns {Promise<{contention: object, resolutions: Array, rankings: Array, balance: object, applied: boolean, ventureCount: number}>}
 */
export async function optimize(supabase, ventureIds, config = {}) {
  const weights = config.weights || DEFAULT_WEIGHTS;
  const balanceCap = config.balanceCap ?? DEFAULT_BALANCE_CAP;
  const dryRun = config.dryRun ?? false;
  const tiebreakerTolerance = config.tiebreakerTolerance ?? DEFAULT_TIEBREAKER_TOLERANCE;
  const capacities = config.capacities || {};

  validateWeights(weights);

  if (ventureIds.length === 0) {
    return {
      contention: { conflicts: [], hasContention: false },
      resolutions: [],
      rankings: [],
      balance: { rebalanced: false, before: {}, after: {}, adjustments: [] },
      applied: false,
      ventureCount: 0,
    };
  }

  // Load all ventures
  const { data: ventures, error } = await supabase
    .from('ventures')
    .select('*')
    .in('id', ventureIds);

  if (error) {
    throw new ServiceError(
      'VENTURES_LOAD_FAILED',
      `Failed to load ventures: ${error.message}`,
      'portfolio-optimizer',
    );
  }

  if (!ventures || ventures.length === 0) {
    throw new ServiceError(
      'NO_VENTURES_FOUND',
      'No ventures found for the provided IDs',
      'portfolio-optimizer',
    );
  }

  // Emit start event
  await emit(supabase, 'optimization_started', {
    ventureCount: ventures.length,
    dryRun,
    weights,
    balanceCap,
  }, 'portfolio-optimizer');

  // Step 1: Detect contention with severity scoring
  const contention = detectContention(ventures, capacities);

  // Step 2: Score and rank ventures (with provider boost)
  const providerVentureIds = new Set();
  const providerDependentCounts = {};

  // Load dependency graphs to identify providers
  const depGraphResults = await Promise.allSettled(
    ventures.map(v => getDependencyGraph(supabase, v.id)),
  );
  for (let i = 0; i < ventures.length; i++) {
    const result = depGraphResults[i];
    if (result.status === 'fulfilled' && result.value.providesTo.length > 0) {
      providerVentureIds.add(ventures[i].id);
      providerDependentCounts[ventures[i].id] = result.value.providesTo.length;
    }
  }

  const ventureMap = new Map(ventures.map(v => [v.id, v]));
  const scored = ventures.map(v => {
    const scores = scoreVenture(v, weights);
    // Apply provider boost
    const dependentCount = providerDependentCounts[v.id] || 0;
    const providerBoost = Math.min(dependentCount * PROVIDER_BOOST_PER_DEPENDENT, PROVIDER_BOOST_CAP);
    return {
      ventureId: v.id,
      name: v.name,
      ...scores,
      providerBoost,
      priorityScore: Math.min(100, scores.priorityScore + providerBoost),
    };
  });

  // Sort by priorityScore descending, with tiebreaker by age (older first)
  const rankings = scored.sort((a, b) => {
    const diff = b.priorityScore - a.priorityScore;
    if (Math.abs(diff) > tiebreakerTolerance) return diff;
    const aTime = new Date(ventureMap.get(a.ventureId)?.created_at || 0).getTime();
    const bTime = new Date(ventureMap.get(b.ventureId)?.created_at || 0).getTime();
    return aTime - bTime; // older first
  });

  // Step 3: Resolve contention conflicts (with provider protection)
  let resolutions = [];
  if (contention.hasContention) {
    resolutions = resolveContention(contention.conflicts, rankings, providerVentureIds);

    // Emit contention detected event
    await emit(supabase, 'contention_detected', {
      conflictCount: contention.conflicts.length,
      severities: contention.conflicts.map(c => c.severity),
      resolutions: resolutions.map(r => ({ resource: r.resourceType, strategy: r.strategy })),
    }, 'portfolio-optimizer');

    // Fire advisory notifications for high/critical contention (non-blocking)
    for (const conflict of contention.conflicts) {
      if (conflict.severity === 'high' || conflict.severity === 'critical') {
        const ventureId = conflict.ventureIds[0];
        createAdvisoryNotification({
          ventureId,
          stageNumber: 0,
          summary: `${conflict.severity.toUpperCase()} contention on ${conflict.resourceType} (demand: ${conflict.totalDemand.toFixed(2)}, capacity: ${conflict.capacity.toFixed(2)})`,
          briefData: {
            type: 'resource_contention',
            resourceType: conflict.resourceType,
            severity: conflict.severity,
            ventureIds: conflict.ventureIds,
            totalDemand: conflict.totalDemand,
            capacity: conflict.capacity,
          },
          supabase,
        }).catch(() => { /* fire-and-forget */ });
      }
    }
  }

  // Step 4: Enforce portfolio balance
  const allocations = ventures.map(v => ({
    ventureId: v.id,
    allocation: v.metadata?.resources?.total_allocation ?? 0,
    priorityScore: scored.find(s => s.ventureId === v.id).priorityScore,
  }));
  const balance = enforceBalance(allocations, balanceCap);

  const applied = !dryRun;

  // Emit completion event
  await emit(supabase, 'optimization_completed', {
    ventureCount: ventures.length,
    contentionCount: contention.conflicts.length,
    resolutionCount: resolutions.length,
    rebalanced: balance.rebalanced,
    applied,
    dryRun,
  }, 'portfolio-optimizer');

  return {
    contention,
    resolutions,
    rankings,
    balance,
    applied,
    ventureCount: ventures.length,
  };
}

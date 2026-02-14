/**
 * Advanced Portfolio Optimization: Resource Contention + Priority Re-Ranking
 * SD-EVA-FEAT-PORTFOLIO-OPT-001
 *
 * Detects resource contention across ventures, scores by urgency/ROI,
 * enforces portfolio balance constraints, and re-ranks priorities.
 *
 * @module lib/eva/portfolio-optimizer
 */

import { loadContext, emit, ServiceError } from './shared-services.js';

export const MODULE_VERSION = '1.0.0';

/** @type {{urgency: number, roi: number}} */
const DEFAULT_WEIGHTS = {
  urgency: 0.60,
  roi: 0.40,
};

const DEFAULT_BALANCE_CAP = 0.40;

// ── Weight Validation ───────────────────────────────────

/**
 * Validate that scoring weights sum to 1.0 (within tolerance).
 *
 * @param {{urgency: number, roi: number}} weights
 * @throws {ServiceError} INVALID_WEIGHTS if sum deviates from 1.0
 */
function validateWeights(weights) {
  const sum = weights.urgency + weights.roi;
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
 * Detect resource contention across ventures.
 *
 * @param {object[]} ventures - Array of venture rows
 * @returns {{conflicts: Array<{resourceType: string, ventureIds: string[], totalDemand: number}>, hasContention: boolean}}
 */
function detectContention(ventures) {
  const resourceDemand = {};

  for (const v of ventures) {
    const resources = v.metadata?.resources || {};
    for (const [type, demand] of Object.entries(resources)) {
      if (!resourceDemand[type]) resourceDemand[type] = [];
      resourceDemand[type].push({ ventureId: v.id, demand: demand ?? 0 });
    }
  }

  const conflicts = [];
  for (const [type, entries] of Object.entries(resourceDemand)) {
    if (entries.length > 1) {
      const totalDemand = entries.reduce((sum, e) => sum + e.demand, 0);
      conflicts.push({
        resourceType: type,
        ventureIds: entries.map(e => e.ventureId),
        totalDemand,
      });
    }
  }

  return { conflicts, hasContention: conflicts.length > 0 };
}

// ── Venture Scoring ─────────────────────────────────────

/**
 * Score a venture by urgency and ROI.
 *
 * @param {object} venture - Venture row from DB
 * @param {{urgency: number, roi: number}} weights
 * @returns {{urgencyScore: number, roiScore: number, priorityScore: number}}
 */
function scoreVenture(venture, weights) {
  const meta = venture.metadata || {};

  // Urgency: based on deadline proximity and time-sensitivity
  let urgencyScore = 50; // baseline
  const scheduling = meta.scheduling || {};
  if (scheduling.deadline_days != null) {
    urgencyScore = scheduling.deadline_days <= 7 ? 90
      : scheduling.deadline_days <= 30 ? 70
      : scheduling.deadline_days <= 90 ? 40
      : 20;
  }
  if (scheduling.time_sensitive === true) {
    urgencyScore = Math.min(100, urgencyScore + 15);
  }

  // ROI: based on financial metrics
  let roiScore = 50; // baseline
  const financials = meta.financials || {};
  if (financials.revenue_growth != null) {
    roiScore = financials.revenue_growth > 30 ? 90
      : financials.revenue_growth > 15 ? 70
      : financials.revenue_growth > 5 ? 50
      : 30;
  }
  if (financials.margin_trajectory != null) {
    roiScore += financials.margin_trajectory > 0 ? 10 : -10;
  }
  roiScore = Math.max(0, Math.min(100, roiScore));

  const priorityScore = Math.round(
    urgencyScore * weights.urgency + roiScore * weights.roi,
  );

  return { urgencyScore, roiScore, priorityScore };
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
 * Optimize a portfolio of ventures.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string[]} ventureIds - Array of venture UUIDs to optimize
 * @param {{weights?: {urgency: number, roi: number}, balanceCap?: number, dryRun?: boolean}} [config]
 * @returns {Promise<{contention: object, rankings: Array<{ventureId: string, name: string, priorityScore: number, urgencyScore: number, roiScore: number}>, balance: object, applied: boolean, ventureCount: number}>}
 */
export async function optimize(supabase, ventureIds, config = {}) {
  const weights = config.weights || DEFAULT_WEIGHTS;
  const balanceCap = config.balanceCap ?? DEFAULT_BALANCE_CAP;
  const dryRun = config.dryRun ?? false;

  validateWeights(weights);

  if (ventureIds.length === 0) {
    return {
      contention: { conflicts: [], hasContention: false },
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

  // Step 1: Detect contention
  const contention = detectContention(ventures);

  // Step 2: Score and rank ventures
  const scored = ventures.map(v => {
    const scores = scoreVenture(v, weights);
    return {
      ventureId: v.id,
      name: v.name,
      ...scores,
    };
  });
  const rankings = scored.sort((a, b) => b.priorityScore - a.priorityScore);

  // Step 3: Enforce portfolio balance
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
    rebalanced: balance.rebalanced,
    applied,
    dryRun,
  }, 'portfolio-optimizer');

  return {
    contention,
    rankings,
    balance,
    applied,
    ventureCount: ventures.length,
  };
}

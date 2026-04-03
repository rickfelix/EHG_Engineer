/**
 * Capability Contribution Score — Cumulative Profile Aggregation
 * SD-LEO-ORCH-EVA-STAGE-PIPELINE-001-E: FR-003, FR-004
 *
 * Computes a running cumulative capability profile for a venture by
 * aggregating scores across all completed stages.
 *
 * Cumulative score per dimension = weighted average of all stage scores.
 * Overall CCS = weighted sum of dimension cumulative scores using DIMENSION_OVERALL_WEIGHTS.
 */

import {
  DIMENSIONS,
  STAGE_DIMENSION_WEIGHTS,
  DIMENSION_OVERALL_WEIGHTS,
} from './stage-capability-weights.js';

/**
 * Get the cumulative capability profile for a venture.
 *
 * @param {string} ventureId - Venture UUID
 * @param {Object} deps
 * @param {Object} deps.supabase - Supabase client
 * @param {number} [deps.upToStage] - Only include scores up to this stage (inclusive)
 * @returns {Promise<Object>} Cumulative profile with dimensions, overall, trend
 */
export async function getCumulativeProfile(ventureId, deps = {}) {
  const { supabase, upToStage } = deps;

  // Table venture_capability_scores does not exist yet — return empty dataset
  const data = [];
  const error = null;

  if (!data || data.length === 0) {
    return {
      ventureId,
      dimensions: {},
      overall: null,
      stagesScored: 0,
      trend: {},
      gaps: [],
    };
  }

  // Group by dimension
  const byDimension = {};
  for (const dim of DIMENSIONS) {
    byDimension[dim] = [];
  }

  for (const row of data) {
    if (byDimension[row.dimension]) {
      byDimension[row.dimension].push({
        stage: row.stage_number,
        score: parseFloat(row.score),
        rationale: row.rationale,
      });
    }
  }

  // Compute weighted average per dimension
  const dimensions = {};
  for (const dim of DIMENSIONS) {
    const entries = byDimension[dim];
    if (entries.length === 0) {
      dimensions[dim] = { cumulative: null, stageCount: 0, latest: null, trend: 'stable' };
      continue;
    }

    // Weighted average: each stage's score is weighted by the stage's dimension weight
    let weightedSum = 0;
    let totalWeight = 0;
    for (const entry of entries) {
      const stageWeights = STAGE_DIMENSION_WEIGHTS[entry.stage];
      const weight = stageWeights?.[dim] || 0;
      weightedSum += entry.score * weight;
      totalWeight += weight;
    }

    const cumulative = totalWeight > 0
      ? Math.round((weightedSum / totalWeight) * 100) / 100
      : null;

    // Trend: compare last 2 scores
    const trend = computeTrend(entries);
    const latest = entries[entries.length - 1];

    dimensions[dim] = {
      cumulative,
      stageCount: entries.length,
      latest: latest?.score ?? null,
      latestStage: latest?.stage ?? null,
      trend,
    };
  }

  // Overall CCS
  let overallSum = 0;
  let overallWeight = 0;
  for (const dim of DIMENSIONS) {
    if (dimensions[dim].cumulative !== null) {
      overallSum += dimensions[dim].cumulative * DIMENSION_OVERALL_WEIGHTS[dim];
      overallWeight += DIMENSION_OVERALL_WEIGHTS[dim];
    }
  }
  const overall = overallWeight > 0
    ? Math.round((overallSum / overallWeight) * 100) / 100
    : null;

  // Capability gaps (dimensions below 40)
  const gaps = DIMENSIONS
    .filter(dim => dimensions[dim].cumulative !== null && dimensions[dim].cumulative < 40)
    .map(dim => ({
      dimension: dim,
      score: dimensions[dim].cumulative,
      trend: dimensions[dim].trend,
    }));

  // Count unique stages scored
  const stagesScored = new Set(data.map(r => r.stage_number)).size;

  return {
    ventureId,
    dimensions,
    overall,
    stagesScored,
    trend: computeOverallTrend(dimensions),
    gaps,
  };
}

/**
 * Build gate context summary for chairman gate decisions.
 * Includes dimension breakdown, trend arrows, gap warnings, and cohort comparison.
 *
 * @param {string} ventureId
 * @param {Object} deps
 * @param {Object} deps.supabase
 * @param {number} deps.gateStage - The gate stage number
 * @returns {Promise<Object>} Gate context with CCS summary
 */
export async function getGateContext(ventureId, deps = {}) {
  const { supabase, gateStage } = deps;

  const profile = await getCumulativeProfile(ventureId, { supabase, upToStage: gateStage });

  // Get cohort average if 3+ ventures have scores
  let cohortComparison = null;
  try {
    // Table venture_capability_scores does not exist yet
    const cohortData = [];

    if (cohortData && cohortData.length > 0) {
      const ventureIds = new Set(cohortData.map(r => r.venture_id));
      if (ventureIds.size >= 3) {
        const cohortAvg = {};
        for (const dim of DIMENSIONS) {
          const dimScores = cohortData.filter(r => r.dimension === dim);
          if (dimScores.length > 0) {
            cohortAvg[dim] = Math.round(
              dimScores.reduce((sum, r) => sum + parseFloat(r.score), 0) / dimScores.length * 100
            ) / 100;
          }
        }
        cohortComparison = {
          venturesInCohort: ventureIds.size,
          averages: cohortAvg,
        };
      }
    }
  } catch {
    // Non-blocking
  }

  const trendArrow = (trend) => {
    if (trend === 'improving') return '\u2191'; // ↑
    if (trend === 'declining') return '\u2193'; // ↓
    return '\u2192'; // →
  };

  return {
    ventureId,
    gateStage,
    overall: profile.overall,
    dimensions: Object.fromEntries(
      DIMENSIONS.map(dim => [dim, {
        score: profile.dimensions[dim]?.cumulative,
        trend: profile.dimensions[dim]?.trend,
        arrow: trendArrow(profile.dimensions[dim]?.trend),
        isGap: profile.dimensions[dim]?.cumulative !== null && profile.dimensions[dim]?.cumulative < 40,
      }])
    ),
    gaps: profile.gaps,
    stagesScored: profile.stagesScored,
    cohortComparison,
  };
}

/**
 * Compute trend direction from a list of scored entries.
 */
function computeTrend(entries) {
  if (entries.length < 2) return 'stable';
  const recent = entries.slice(-2);
  const diff = recent[1].score - recent[0].score;
  if (diff > 5) return 'improving';
  if (diff < -5) return 'declining';
  return 'stable';
}

/**
 * Compute overall trend from dimension trends.
 */
function computeOverallTrend(dimensions) {
  let improving = 0;
  let declining = 0;
  for (const dim of DIMENSIONS) {
    if (dimensions[dim]?.trend === 'improving') improving++;
    if (dimensions[dim]?.trend === 'declining') declining++;
  }
  if (improving > declining + 1) return 'improving';
  if (declining > improving + 1) return 'declining';
  return 'stable';
}

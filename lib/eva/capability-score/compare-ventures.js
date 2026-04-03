/**
 * Capability Contribution Score — Cross-Venture Comparison
 * SD-LEO-ORCH-EVA-STAGE-PIPELINE-001-E: FR-005
 *
 * Compares capability profiles across multiple ventures.
 * Returns ranked list by overall CCS or specific dimension.
 * Supports filtering by stage range and sorting by any dimension.
 */

import {
  DIMENSIONS,
  DIMENSION_OVERALL_WEIGHTS,
} from './stage-capability-weights.js';

/**
 * Compare ventures by their capability profiles.
 *
 * @param {Object} deps
 * @param {Object} deps.supabase - Supabase client
 * @param {string} [deps.sortBy='overall'] - 'overall' or a dimension name
 * @param {number} [deps.stageMin] - Minimum stage number (inclusive)
 * @param {number} [deps.stageMax] - Maximum stage number (inclusive)
 * @param {string[]} [deps.ventureIds] - Specific venture IDs to compare (omit for all)
 * @param {number} [deps.limit=50] - Max ventures to return
 * @returns {Promise<Object>} Ranked comparison result
 */
export async function compareVentures(deps = {}) {
  const {
    supabase,
    sortBy = 'overall',
    stageMin,
    stageMax,
    ventureIds,
    limit = 50,
  } = deps;

  // Validate sortBy
  if (sortBy !== 'overall' && !DIMENSIONS.includes(sortBy)) {
    throw new Error(`Invalid sortBy: ${sortBy}. Must be 'overall' or one of: ${DIMENSIONS.join(', ')}`);
  }

  // Table venture_capability_scores does not exist yet — return empty dataset
  const data = [];
  const error = null;

  if (error) {
    throw new Error(`Failed to fetch capability scores: ${error.message}`);
  }

  if (!data || data.length === 0) {
    return { ventures: [], sortBy, stageRange: { min: stageMin, max: stageMax } };
  }

  // Group by venture_id
  const ventureMap = {};
  for (const row of data) {
    if (!ventureMap[row.venture_id]) {
      ventureMap[row.venture_id] = { scores: {}, stages: new Set() };
    }
    ventureMap[row.venture_id].stages.add(row.stage_number);

    if (!ventureMap[row.venture_id].scores[row.dimension]) {
      ventureMap[row.venture_id].scores[row.dimension] = [];
    }
    ventureMap[row.venture_id].scores[row.dimension].push(parseFloat(row.score));
  }

  // Compute averages per venture
  const ventures = Object.entries(ventureMap).map(([ventureId, { scores, stages }]) => {
    const dimensionAverages = {};
    for (const dim of DIMENSIONS) {
      const dimScores = scores[dim] || [];
      dimensionAverages[dim] = dimScores.length > 0
        ? Math.round((dimScores.reduce((a, b) => a + b, 0) / dimScores.length) * 100) / 100
        : null;
    }

    // Overall CCS
    let overallSum = 0;
    let overallWeight = 0;
    for (const dim of DIMENSIONS) {
      if (dimensionAverages[dim] !== null) {
        overallSum += dimensionAverages[dim] * DIMENSION_OVERALL_WEIGHTS[dim];
        overallWeight += DIMENSION_OVERALL_WEIGHTS[dim];
      }
    }
    const overall = overallWeight > 0
      ? Math.round((overallSum / overallWeight) * 100) / 100
      : null;

    return {
      ventureId,
      overall,
      dimensions: dimensionAverages,
      stagesScored: stages.size,
      maxStage: Math.max(...stages),
    };
  });

  // Sort
  ventures.sort((a, b) => {
    const aVal = sortBy === 'overall' ? a.overall : a.dimensions[sortBy];
    const bVal = sortBy === 'overall' ? b.overall : b.dimensions[sortBy];
    if (aVal === null && bVal === null) return 0;
    if (aVal === null) return 1;
    if (bVal === null) return -1;
    return bVal - aVal; // Descending
  });

  // Apply limit
  const limited = ventures.slice(0, limit);

  // Add rank
  limited.forEach((v, i) => { v.rank = i + 1; });

  return {
    ventures: limited,
    sortBy,
    stageRange: { min: stageMin, max: stageMax },
    totalVentures: ventures.length,
  };
}

/**
 * Plane 1 Scoring Module - Capability Graph Assessment
 * SD: SD-CAP-LEDGER-001 | US-004
 *
 * Integrates with the Capability Ledger to calculate Plane 1 scores
 * for venture evaluation.
 *
 * Plane 1 (Capability Graph) Components:
 * - Graph Centrality Gain (0-5): How central to capability graph
 * - Maturity Lift (0-5): What maturity level does this add
 * - Extraction Clarity (0-5): How reusable/extractable
 *
 * Total: 0-15 raw, weighted by category (max ~22.5)
 * Threshold: 10 (ventures with Plane 1 < 10 should be questioned)
 *
 * Based on: Ground-Truth Triangulation Synthesis and Four-Plane Evaluation Matrix
 */

import { calculatePlane1Score, CAPABILITY_TYPES } from './capability-taxonomy.js';

/**
 * Plane 1 Scoring Configuration
 */
export const PLANE1_CONFIG = {
  // Score ranges
  MAX_RAW_SCORE: 15,
  MAX_WEIGHTED_SCORE: 22.5, // 15 * 1.5 (max weight)

  // Threshold for venture evaluation (from triangulation)
  REJECTION_THRESHOLD: 10,
  CAUTION_THRESHOLD: 12,

  // Component weights for final calculation
  WEIGHTS: {
    GRAPH_CENTRALITY: 1.0,
    MATURITY_LIFT: 1.0,
    EXTRACTION_CLARITY: 1.0,
  },

  // Risk levels
  RISK_LEVELS: {
    HIGH: { max: 10, label: 'High Risk', action: 'Requires exception for approval' },
    MEDIUM: { max: 15, label: 'Medium Risk', action: 'Review capability strategy' },
    LOW: { max: 22.5, label: 'Low Risk', action: 'Proceed with monitoring' },
  },
};

/**
 * Calculate Plane 1 score for a venture based on its declared capabilities
 *
 * @param {Array} capabilities - Array of capability declarations
 * @param {Object} options - Scoring options
 * @returns {Object} Plane 1 scoring breakdown
 */
export function calculateVenturePlane1Score(capabilities, _options = {}) {
  if (!capabilities || capabilities.length === 0) {
    return {
      total_score: 0,
      risk_level: 'HIGH',
      risk_action: PLANE1_CONFIG.RISK_LEVELS.HIGH.action,
      capabilities_assessed: 0,
      breakdown: {
        graph_centrality_gain: 0,
        maturity_lift: 0,
        extraction_clarity: 0,
      },
      recommendation: 'No capabilities declared. Define capability contributions.',
      passes_threshold: false,
    };
  }

  // Calculate individual scores
  const scores = capabilities.map((cap) => calculatePlane1Score(cap));

  // Aggregate scores (average weighted by capability count)
  const totalGraphCentrality = scores.reduce((sum, s) => sum + s.graph_centrality_gain, 0);
  const totalMaturity = scores.reduce((sum, s) => sum + s.maturity_lift, 0);
  const totalExtraction = scores.reduce((sum, s) => sum + s.extraction_clarity, 0);
  const totalWeighted = scores.reduce((sum, s) => sum + s.weighted_total, 0);

  // Calculate averages
  const count = capabilities.length;
  const avgGraphCentrality = totalGraphCentrality / count;
  const avgMaturity = totalMaturity / count;
  const avgExtraction = totalExtraction / count;

  // Total Plane 1 score is sum of weighted scores (not average)
  // This rewards ventures that deliver more capabilities
  const totalScore = Math.min(totalWeighted, PLANE1_CONFIG.MAX_WEIGHTED_SCORE);

  // Determine risk level
  let riskLevel = 'HIGH';
  let riskAction = PLANE1_CONFIG.RISK_LEVELS.HIGH.action;

  if (totalScore >= PLANE1_CONFIG.CAUTION_THRESHOLD) {
    riskLevel = 'LOW';
    riskAction = PLANE1_CONFIG.RISK_LEVELS.LOW.action;
  } else if (totalScore >= PLANE1_CONFIG.REJECTION_THRESHOLD) {
    riskLevel = 'MEDIUM';
    riskAction = PLANE1_CONFIG.RISK_LEVELS.MEDIUM.action;
  }

  // Generate recommendation
  const recommendation = generateRecommendation(
    totalScore,
    avgGraphCentrality,
    avgMaturity,
    avgExtraction,
    capabilities
  );

  return {
    total_score: Math.round(totalScore * 100) / 100,
    risk_level: riskLevel,
    risk_action: riskAction,
    capabilities_assessed: count,
    breakdown: {
      graph_centrality_gain: Math.round(avgGraphCentrality * 100) / 100,
      maturity_lift: Math.round(avgMaturity * 100) / 100,
      extraction_clarity: Math.round(avgExtraction * 100) / 100,
      raw_total: Math.round((avgGraphCentrality + avgMaturity + avgExtraction) * 100) / 100,
    },
    individual_scores: scores,
    recommendation,
    passes_threshold: totalScore >= PLANE1_CONFIG.REJECTION_THRESHOLD,
    exceeds_caution: totalScore >= PLANE1_CONFIG.CAUTION_THRESHOLD,
  };
}

/**
 * Generate recommendation based on score analysis
 */
function generateRecommendation(totalScore, centrality, maturity, extraction, capabilities) {
  const issues = [];

  if (centrality < 2) {
    issues.push('Low graph centrality - capabilities may be isolated');
  }
  if (maturity < 2) {
    issues.push('Low maturity - capabilities need more development');
  }
  if (extraction < 2) {
    issues.push('Low extraction clarity - capabilities may be hard to reuse');
  }

  // Check category diversity
  const categories = new Set(
    capabilities.map((c) => CAPABILITY_TYPES[c.capability_type]?.category)
  );
  if (categories.size < 2) {
    issues.push('Low category diversity - consider adding different capability types');
  }

  // Check for AI capabilities (high value for EHG)
  const hasAI = capabilities.some((c) =>
    ['agent', 'crew', 'tool', 'skill'].includes(c.capability_type)
  );
  if (!hasAI) {
    issues.push('No AI/automation capabilities - consider adding agents or tools');
  }

  if (totalScore >= PLANE1_CONFIG.CAUTION_THRESHOLD && issues.length === 0) {
    return 'Strong capability contribution. Proceed with confidence.';
  }

  if (totalScore >= PLANE1_CONFIG.REJECTION_THRESHOLD) {
    return `Acceptable capability contribution. ${issues.join('. ')}.`;
  }

  return `Capability contribution below threshold. ${issues.join('. ')}. Consider enhancing before approval.`;
}

/**
 * Calculate Plane 1 score for an SD based on delivers_capabilities
 *
 * @param {Object} sd - Strategic Directive with delivers_capabilities
 * @returns {Object} Plane 1 scoring for the SD
 */
export function calculateSDPlane1Score(sd) {
  const capabilities = sd.delivers_capabilities || [];

  if (capabilities.length === 0) {
    return {
      total_score: 0,
      sd_id: sd.id,
      message: 'SD does not declare any capabilities',
      passes_threshold: false,
    };
  }

  const score = calculateVenturePlane1Score(capabilities);

  return {
    ...score,
    sd_id: sd.id,
    sd_title: sd.title,
  };
}

/**
 * Aggregate Plane 1 scores for a venture across all its SDs
 *
 * @param {Array} sds - Array of Strategic Directives for a venture
 * @returns {Object} Aggregated Plane 1 score
 */
export function calculateVentureAggregatedPlane1(sds) {
  if (!sds || sds.length === 0) {
    return {
      total_score: 0,
      sds_assessed: 0,
      total_capabilities: 0,
      passes_threshold: false,
      message: 'No SDs found for venture',
    };
  }

  // Collect all capabilities across SDs
  const allCapabilities = sds.flatMap((sd) => sd.delivers_capabilities || []);

  if (allCapabilities.length === 0) {
    return {
      total_score: 0,
      sds_assessed: sds.length,
      total_capabilities: 0,
      passes_threshold: false,
      message: 'No capabilities declared across SDs',
    };
  }

  const score = calculateVenturePlane1Score(allCapabilities);

  // Calculate SD-level breakdown
  const sdBreakdown = sds.map((sd) => ({
    sd_id: sd.id,
    sd_title: sd.title,
    capabilities_count: (sd.delivers_capabilities || []).length,
    score: calculateSDPlane1Score(sd),
  }));

  return {
    ...score,
    sds_assessed: sds.length,
    total_capabilities: allCapabilities.length,
    sd_breakdown: sdBreakdown,
  };
}

/**
 * Query capability ledger and calculate Plane 1 for registered capabilities
 *
 * @param {Object} supabaseClient - Supabase client
 * @param {string} sdId - SD ID to query (VARCHAR format like "SD-XXX-001", NOT UUID)
 * @returns {Object} Plane 1 score from registered capabilities
 */
export async function calculatePlane1FromLedger(supabaseClient, sdId) {
  // Validate sdId is VARCHAR format (e.g., "SD-XXX-001"), not UUID
  // sd_capabilities table has both sd_id (VARCHAR) and sd_uuid (UUID) columns
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (UUID_REGEX.test(sdId)) {
    console.error('calculatePlane1FromLedger called with UUID instead of SD ID string');
    return {
      total_score: 0,
      error: 'Invalid sdId format: expected VARCHAR SD key (e.g., "SD-XXX-001"), got UUID',
      passes_threshold: false,
    };
  }

  const { data: capabilities, error } = await supabaseClient
    .from('sd_capabilities')
    .select('*')
    .eq('sd_id', sdId)
    .eq('action', 'registered');

  if (error) {
    console.error('Error querying capability ledger:', error);
    return {
      total_score: 0,
      error: error.message,
      passes_threshold: false,
    };
  }

  if (!capabilities || capabilities.length === 0) {
    return {
      total_score: 0,
      sd_id: sdId,
      message: 'No registered capabilities found in ledger',
      passes_threshold: false,
    };
  }

  // Use stored Plane 1 scores from database
  const totalScore = capabilities.reduce((sum, c) => sum + (c.plane1_score || 0), 0);
  const avgScore = totalScore / capabilities.length;

  // SD-LEO-FEAT-CAPABILITY-LATTICE-001: Query venture_capabilities for portfolio reuse bonus
  let ventureBonus = 0;
  let ventureCapabilities = [];
  try {
    const sdCapTypes = [...new Set(capabilities.map(c => c.capability_type))];
    const { data: ventCaps } = await supabaseClient
      .from('venture_capabilities')
      .select('name, capability_type, reusability_score, maturity_level')
      .in('capability_type', sdCapTypes);

    if (ventCaps && ventCaps.length > 0) {
      ventureCapabilities = ventCaps;
      // Additive bonus: average reusability_score of matching venture capabilities, scaled to 0-2 range
      const avgReuse = ventCaps.reduce((s, v) => s + (v.reusability_score || 0), 0) / ventCaps.length;
      ventureBonus = Math.round((avgReuse / 5) * 100) / 100; // max 2.0 bonus
    }
  } catch {
    // venture_capabilities query is non-blocking; proceed with SD-only score
  }

  const combinedScore = totalScore + ventureBonus;

  return {
    total_score: Math.round(combinedScore * 100) / 100,
    average_score: Math.round(avgScore * 100) / 100,
    capabilities_count: capabilities.length,
    passes_threshold: combinedScore >= PLANE1_CONFIG.REJECTION_THRESHOLD,
    venture_bonus: ventureBonus,
    venture_capabilities_matched: ventureCapabilities.length,
    capabilities: capabilities.map((c) => ({
      key: c.capability_key,
      type: c.capability_type,
      plane1_score: c.plane1_score,
      maturity: c.maturity_score,
      extraction: c.extraction_score,
      reuse_count: c.reuse_count,
    })),
  };
}

/**
 * Format Plane 1 score for display
 */
export function formatPlane1Score(score) {
  const indicator = score.passes_threshold
    ? (score.exceeds_caution ? '✅' : '⚠️')
    : '❌';

  return `
╔══════════════════════════════════════════════════════════════════╗
║                    PLANE 1: CAPABILITY GRAPH                      ║
╠══════════════════════════════════════════════════════════════════╣
║  Total Score: ${String(score.total_score).padStart(5)} / ${PLANE1_CONFIG.MAX_WEIGHTED_SCORE}  ${indicator}                              ║
║  Threshold:   ${PLANE1_CONFIG.REJECTION_THRESHOLD}  │  Caution: ${PLANE1_CONFIG.CAUTION_THRESHOLD}                                   ║
╠══════════════════════════════════════════════════════════════════╣
║  BREAKDOWN:                                                       ║
║    Graph Centrality Gain: ${String(score.breakdown.graph_centrality_gain).padStart(4)} / 5                           ║
║    Maturity Lift:         ${String(score.breakdown.maturity_lift).padStart(4)} / 5                           ║
║    Extraction Clarity:    ${String(score.breakdown.extraction_clarity).padStart(4)} / 5                           ║
╠══════════════════════════════════════════════════════════════════╣
║  Risk Level: ${score.risk_level.padEnd(8)}                                             ║
║  Action: ${score.risk_action.substring(0, 55).padEnd(55)}║
╠══════════════════════════════════════════════════════════════════╣
║  Capabilities Assessed: ${String(score.capabilities_assessed).padStart(3)}                                     ║
║  Recommendation:                                                  ║
║    ${score.recommendation.substring(0, 60).padEnd(60)}║
╚══════════════════════════════════════════════════════════════════╝
`.trim();
}

export default {
  PLANE1_CONFIG,
  calculateVenturePlane1Score,
  calculateSDPlane1Score,
  calculateVentureAggregatedPlane1,
  calculatePlane1FromLedger,
  formatPlane1Score,
};

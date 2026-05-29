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

// ═══════════════════════════════════════════════════════════════
// CAPABILITY SCORE ACTIVATION (SD-LEO-INFRA-ACTIVATE-CAPABILITY-SCORING-001)
// ═══════════════════════════════════════════════════════════════
//
// The taxonomy scorer (calculatePlane1Score) consumes maturity_score and
// extraction_score as pass-through inputs but never derives them, so every
// sd_capabilities row sits at maturity=extraction=plane1=0. These helpers
// supply the missing estimator + persistence so the existing BEFORE trigger
// (trg_compute_plane1_score) computes a real plane1_score.

// Category for each capability_type (mirrors fn_compute_plane1_score CASE).
const SCORE_CATEGORY_BY_TYPE = {
  agent: 'ai_automation', crew: 'ai_automation', tool: 'ai_automation', skill: 'ai_automation',
  database_schema: 'infrastructure', database_function: 'infrastructure', rls_policy: 'infrastructure', migration: 'infrastructure',
  api_endpoint: 'application', component: 'application', hook: 'application', service: 'application', utility: 'application',
  workflow: 'integration', webhook: 'integration', external_integration: 'integration',
  validation_rule: 'governance', quality_gate: 'governance', protocol: 'governance',
};

// Maturity baseline by category: a capability registered by a COMPLETED SD has
// shipped, so it is at least "functional/reliable". Governance + infrastructure
// capabilities are gate/schema-enforced once present (higher baseline).
const MATURITY_BASELINE_BY_CATEGORY = {
  governance: 4, infrastructure: 4, ai_automation: 3, application: 3, integration: 3,
};

// Extraction (reusability) baseline by type: utilities/tools/db-functions are the
// most reusable; components/schemas/RLS policies are bound to a specific context.
const EXTRACTION_BASELINE_BY_TYPE = {
  utility: 4, tool: 4, database_function: 4,
  skill: 3, hook: 3, service: 3, api_endpoint: 3, workflow: 3, webhook: 3,
  external_integration: 3, validation_rule: 3, quality_gate: 3, protocol: 3, migration: 3,
  agent: 3, crew: 3,
  component: 2, database_schema: 2, rls_policy: 2,
};

const clampScore = (n) => Math.max(0, Math.min(5, Math.round(n)));

/**
 * Derive maturity_score and extraction_score (0-5 integers) for a capability.
 *
 * Deterministic and type-differentiated: a per-type/category baseline grounded in
 * the taxonomy rubric, adjusted by available evidence signals (source_files count,
 * reuse_count). plane1_score and graph_centrality_score are NOT computed here — the
 * BEFORE trigger owns them; this only supplies maturity + extraction.
 *
 * @param {Object} capability - row with capability_type, source_files, reuse_count
 * @returns {{ maturity_score: number, extraction_score: number }}
 */
export function deriveCapabilityScores(capability) {
  const type = capability?.capability_type;
  const category = SCORE_CATEGORY_BY_TYPE[type];
  if (!category) {
    return { maturity_score: 0, extraction_score: 0 };
  }

  let maturity = MATURITY_BASELINE_BY_CATEGORY[category] ?? 3;
  let extraction = EXTRACTION_BASELINE_BY_TYPE[type] ?? 3;

  const sourceFileCount = Array.isArray(capability.source_files) ? capability.source_files.length : 0;
  const reuse = Number.isFinite(capability.reuse_count) ? capability.reuse_count : 0;

  // Evidence adjustments: substantial implementation (>=2 source files) lifts
  // maturity; proven reuse lifts both reusability and maturity.
  if (sourceFileCount >= 2) maturity += 1;
  if (reuse >= 1) { extraction += 1; maturity += 1; }

  return { maturity_score: clampScore(maturity), extraction_score: clampScore(extraction) };
}

/**
 * Score sd_capabilities rows and persist ONLY maturity_score + extraction_score.
 * The existing trg_compute_plane1_score trigger recomputes plane1_score,
 * graph_centrality_score, category, and category_weight on the UPDATE.
 *
 * Idempotent: by default only scores rows where maturity_score=0 AND
 * extraction_score=0. force re-scores all in-scope rows.
 *
 * @param {Object} supabaseClient
 * @param {Object} opts
 * @param {string} [opts.sdId]   - scope to one SD by sd_capabilities.sd_id (VARCHAR sd_key)
 * @param {string} [opts.sdUuid] - scope to one SD by sd_capabilities.sd_uuid (UUID)
 * @param {boolean} [opts.all]   - scope to ALL action='registered' rows (backfill)
 * @param {boolean} [opts.force] - re-score even rows that already have scores
 * @param {boolean} [opts.dryRun]- compute + report without writing
 * @returns {Promise<{ scanned:number, scored:number, skipped:number, dryRun:boolean, changes:Array, error?:string }>}
 */
export async function scoreAndPersistCapabilities(supabaseClient, opts = {}) {
  const { sdId, sdUuid, all = false, force = false, dryRun = false } = opts;

  let query = supabaseClient
    .from('sd_capabilities')
    .select('id, capability_key, capability_type, source_files, reuse_count, maturity_score, extraction_score');

  if (all) {
    query = query.eq('action', 'registered');
  } else if (sdId) {
    query = query.eq('sd_id', sdId);
  } else if (sdUuid) {
    query = query.eq('sd_uuid', sdUuid);
  } else {
    return { scanned: 0, scored: 0, skipped: 0, dryRun, changes: [], error: 'scoreAndPersistCapabilities requires one of: all, sdId, sdUuid' };
  }

  const { data: rows, error } = await query;
  if (error) {
    return { scanned: 0, scored: 0, skipped: 0, dryRun, changes: [], error: error.message };
  }

  const changes = [];
  let skipped = 0;
  for (const row of rows || []) {
    const alreadyScored = (row.maturity_score || 0) !== 0 || (row.extraction_score || 0) !== 0;
    if (alreadyScored && !force) { skipped += 1; continue; }
    const { maturity_score, extraction_score } = deriveCapabilityScores(row);
    changes.push({ id: row.id, capability_key: row.capability_key, capability_type: row.capability_type, maturity_score, extraction_score });
  }

  if (dryRun) {
    return { scanned: (rows || []).length, scored: changes.length, skipped, dryRun: true, changes };
  }

  let scored = 0;
  const errors = [];
  for (const c of changes) {
    // Write ONLY maturity_score + extraction_score; trigger recomputes the rest.
    const { error: upErr } = await supabaseClient
      .from('sd_capabilities')
      .update({ maturity_score: c.maturity_score, extraction_score: c.extraction_score })
      .eq('id', c.id);
    if (upErr) { errors.push(`${c.capability_key}: ${upErr.message}`); continue; }
    scored += 1;
  }

  const result = { scanned: (rows || []).length, scored, skipped, dryRun: false, changes };
  if (errors.length) result.error = errors.join('; ');
  return result;
}

export default {
  PLANE1_CONFIG,
  calculateVenturePlane1Score,
  calculateSDPlane1Score,
  calculateVentureAggregatedPlane1,
  calculatePlane1FromLedger,
  formatPlane1Score,
  deriveCapabilityScores,
  scoreAndPersistCapabilities,
};

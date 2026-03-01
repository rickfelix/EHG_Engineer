/**
 * OKR Priority Integrator — OKR-Weighted SD Prioritization
 * SD: SD-MAN-ORCH-VISION-HEAL-SCORE-93-002-03-B
 *
 * Provides a clean API for OKR-weighted SD prioritization with
 * alignment scoring. Calculates priority based on contribution type,
 * KR status, and alignment weight for queue ordering.
 *
 * @module lib/eva/okr-priority-integrator
 */

const CONTRIBUTION_WEIGHTS = Object.freeze({
  direct: 1.5,
  enabling: 1.0,
  supporting: 0.5,
});

const KR_STATUS_MULTIPLIERS = Object.freeze({
  off_track: 3.0,
  at_risk: 2.0,
  on_track: 1.0,
  completed: 0.5,
  not_started: 1.5,
});

const MAX_OKR_SCORE = 50; // Maximum OKR priority points (from priority-scorer.js)

/**
 * Calculate the OKR priority score for a single SD.
 *
 * @param {Object} supabase - Supabase client
 * @param {string} sdId - SD UUID
 * @param {Object} [options]
 * @param {Object} [options.logger] - Logger instance
 * @returns {Promise<{ score: number, maxScore: number, alignments: Array, error?: string }>}
 */
export async function calculateOKRPriority(supabase, sdId, options = {}) {
  const { logger = console } = options;

  if (!supabase || !sdId) {
    return { score: 0, maxScore: MAX_OKR_SCORE, alignments: [], error: 'Missing supabase or sdId' };
  }

  try {
    // Load alignments for this SD
    const { data: alignments, error: alignError } = await supabase
      .from('sd_key_result_alignment')
      .select('id, key_result_id, contribution_type, alignment_weight')
      .eq('sd_id', sdId);

    if (alignError) {
      logger.warn(`[OKRPriority] Alignment query failed: ${alignError.message}`);
      return { score: 0, maxScore: MAX_OKR_SCORE, alignments: [], error: alignError.message };
    }

    if (!alignments || alignments.length === 0) {
      return { score: 0, maxScore: MAX_OKR_SCORE, alignments: [] };
    }

    // Load key results for status multipliers
    const krIds = [...new Set(alignments.map((a) => a.key_result_id))];
    const { data: krs, error: krError } = await supabase
      .from('key_results')
      .select('id, status, title')
      .in('id', krIds);

    if (krError) {
      logger.warn(`[OKRPriority] KR query failed: ${krError.message}`);
    }

    const krMap = new Map((krs || []).map((kr) => [kr.id, kr]));

    // Calculate weighted score
    let totalScore = 0;
    const scoredAlignments = [];

    for (const align of alignments) {
      const kr = krMap.get(align.key_result_id) || {};
      const contributionWeight = CONTRIBUTION_WEIGHTS[align.contribution_type] || 0.5;
      const statusMultiplier = KR_STATUS_MULTIPLIERS[kr.status] || 1.0;
      const alignWeight = align.alignment_weight || 1.0;

      const alignScore = contributionWeight * statusMultiplier * alignWeight;
      totalScore += alignScore;

      scoredAlignments.push({
        keyResultId: align.key_result_id,
        keyResultTitle: kr.title || null,
        contributionType: align.contribution_type,
        krStatus: kr.status || 'unknown',
        contributionWeight,
        statusMultiplier,
        alignWeight,
        score: Math.round(alignScore * 100) / 100,
      });
    }

    // Normalize to MAX_OKR_SCORE
    const normalizedScore = Math.min(MAX_OKR_SCORE, Math.round(totalScore * 10));

    return {
      score: normalizedScore,
      maxScore: MAX_OKR_SCORE,
      alignments: scoredAlignments,
    };
  } catch (err) {
    logger.warn(`[OKRPriority] Calculate error: ${err.message}`);
    return { score: 0, maxScore: MAX_OKR_SCORE, alignments: [], error: err.message };
  }
}

/**
 * Get the raw alignment score (not normalized) for an SD.
 *
 * @param {Array} alignments - Alignment records with contribution_type
 * @param {Map} krStatusMap - Map of KR id → status string
 * @returns {{ rawScore: number, breakdown: Array }}
 */
export function getAlignmentScore(alignments, krStatusMap = new Map()) {
  if (!alignments || alignments.length === 0) {
    return { rawScore: 0, breakdown: [] };
  }

  let rawScore = 0;
  const breakdown = [];

  for (const align of alignments) {
    const status = krStatusMap.get(align.key_result_id) || 'on_track';
    const cw = CONTRIBUTION_WEIGHTS[align.contribution_type] || 0.5;
    const sm = KR_STATUS_MULTIPLIERS[status] || 1.0;
    const aw = align.alignment_weight || 1.0;
    const score = cw * sm * aw;

    rawScore += score;
    breakdown.push({
      keyResultId: align.key_result_id,
      contributionType: align.contribution_type,
      krStatus: status,
      score: Math.round(score * 100) / 100,
    });
  }

  return { rawScore: Math.round(rawScore * 100) / 100, breakdown };
}

/**
 * Rank a list of SDs by OKR alignment priority.
 *
 * @param {Object} supabase - Supabase client
 * @param {string[]} sdIds - Array of SD UUIDs to rank
 * @param {Object} [options]
 * @param {Object} [options.logger] - Logger instance
 * @returns {Promise<{ ranked: Array, error?: string }>}
 */
export async function rankByOKRAlignment(supabase, sdIds, options = {}) {
  const { logger = console } = options;

  if (!supabase || !sdIds || sdIds.length === 0) {
    return { ranked: [], error: 'Missing supabase or sdIds' };
  }

  try {
    const results = [];

    for (const sdId of sdIds) {
      const { score, alignments } = await calculateOKRPriority(supabase, sdId, options);
      results.push({
        sdId,
        okrScore: score,
        alignmentCount: alignments.length,
        topContribution: alignments.length > 0
          ? alignments.sort((a, b) => b.score - a.score)[0].contributionType
          : null,
      });
    }

    // Sort descending by OKR score
    results.sort((a, b) => b.okrScore - a.okrScore);

    return { ranked: results };
  } catch (err) {
    logger.warn(`[OKRPriority] Rank error: ${err.message}`);
    return { ranked: [], error: err.message };
  }
}

/**
 * Get the contribution weight constants.
 * @returns {Object}
 */
export function getContributionWeights() {
  return { ...CONTRIBUTION_WEIGHTS };
}

/**
 * Get the KR status multiplier constants.
 * @returns {Object}
 */
export function getKRStatusMultipliers() {
  return { ...KR_STATUS_MULTIPLIERS };
}

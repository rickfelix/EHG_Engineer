/**
 * Corrective Priority Calculator
 * Part of: SD-EHG-ORCH-INTELLIGENCE-INTEGRATION-001-C
 *
 * Blends intelligence signals into a dynamic priority for corrective SDs,
 * replacing the static TIER_CONFIG.priority mapping.
 *
 * Priority output: 'critical' | 'high' | 'medium' | 'low'
 *
 * Uses the same band logic as urgency-scorer.js (P0-P3) but maps to
 * LEO priority strings for SD creation.
 *
 * @module corrective-priority-calculator
 */

import { calculateUrgencyScore, scoreToBand } from '../../scripts/modules/auto-proceed/urgency-scorer.js';

/**
 * Band-to-priority mapping.
 * P0 = critical, P1 = high, P2 = medium, P3 = low
 */
const BAND_PRIORITY_MAP = {
  P0: 'critical',
  P1: 'high',
  P2: 'medium',
  P3: 'low',
};

/**
 * Tier base scores used as starting points before intelligence blending.
 * These represent the "floor" urgency for each corrective tier.
 */
const TIER_BASE_SCORES = {
  escalation:    0.90,  // Starts near P0 — critical
  'gap-closure': 0.70,  // Starts at P1 — high
  minor:         0.45,  // Starts at P2 — medium
};

/**
 * Calculate dynamic priority for a corrective SD by blending:
 * 1. Tier-based floor (from vision score classification)
 * 2. OKR alignment impact
 * 3. Pattern severity/frequency
 * 4. Blocking dependency count
 *
 * @param {Object} params
 * @param {string} params.tier - Corrective tier ('escalation'|'gap-closure'|'minor')
 * @param {Object|null} params.okrImpact - From intelligence-loader: { totalScore }
 * @param {Array} params.patterns - From intelligence-loader: active issue patterns
 * @param {Object} params.blocking - From intelligence-loader: { blocksCount }
 * @param {number} [params.visionScore] - Original vision score (0-100) for context
 * @returns {CorrectivePriorityResult}
 *
 * @typedef {Object} CorrectivePriorityResult
 * @property {string} priority - 'critical' | 'high' | 'medium' | 'low'
 * @property {string} band - 'P0' | 'P1' | 'P2' | 'P3'
 * @property {number} score - Raw urgency score (0.0 - 1.0)
 * @property {Array<string>} reason_codes - Factors that influenced the result
 * @property {string} source - 'intelligence-blended' | 'tier-fallback'
 */
export function calculateCorrectivePriority({
  tier,
  okrImpact = null,
  patterns = [],
  blocking = {},
  visionScore = null,
}) {
  const baseScore = TIER_BASE_SCORES[tier];

  // If tier not recognized, fall back to static mapping
  if (baseScore === undefined) {
    return _tierFallback(tier);
  }

  // Build a synthetic SD object for urgency-scorer consumption
  const syntheticSD = {
    priority: BAND_PRIORITY_MAP[scoreToBand(baseScore)] || 'medium',
    metadata: {
      blocks_count: blocking?.blocksCount || 0,
      okr_impact_score: okrImpact?.totalScore ?? null,
    },
  };

  // Calculate urgency score using the existing 7-factor model
  const urgencyResult = calculateUrgencyScore({
    sd: syntheticSD,
    patterns,
    okrImpact,
  });

  // Blend: 60% tier-based floor + 40% intelligence-informed urgency
  // This ensures the vision tier remains dominant but intelligence can shift priority
  const blendedScore = (baseScore * 0.6) + (urgencyResult.score * 0.4);
  const clampedScore = Math.max(0, Math.min(1, blendedScore));

  const band = scoreToBand(clampedScore);
  const priority = BAND_PRIORITY_MAP[band] || 'medium';

  // Escalation floor: escalation tier never drops below 'high'
  const finalPriority = tier === 'escalation' && priority === 'medium'
    ? 'high'
    : priority;

  const reason_codes = [...urgencyResult.reason_codes];
  if (tier === 'escalation' && finalPriority !== priority) {
    reason_codes.push('escalation_floor');
  }
  if (visionScore != null) {
    reason_codes.push(`vision_score_${visionScore}`);
  }

  return {
    priority: finalPriority,
    band,
    score: Math.round(clampedScore * 100) / 100,
    reason_codes,
    source: 'intelligence-blended',
  };
}

/**
 * Fallback to static tier priority when intelligence blending is not possible.
 */
function _tierFallback(tier) {
  const STATIC_MAP = {
    escalation:    'critical',
    'gap-closure': 'high',
    minor:         'medium',
  };
  const priority = STATIC_MAP[tier] || 'medium';
  return {
    priority,
    band: Object.entries(BAND_PRIORITY_MAP).find(([, v]) => v === priority)?.[0] || 'P2',
    score: TIER_BASE_SCORES[tier] ?? 0.5,
    reason_codes: ['tier_fallback'],
    source: 'tier-fallback',
  };
}

export default { calculateCorrectivePriority };

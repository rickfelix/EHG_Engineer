#!/usr/bin/env node
/**
 * Priority Scorer for Strategic Directives
 *
 * Calculates priority scores for SDs based on multiple factors:
 * - Base priority (critical, high, medium, low)
 * - Triage level (High, Medium, Low, Future)
 * - OKR impact (Key Result urgency × contribution type)
 * - SD type bonus (infrastructure, security)
 * - Readiness score
 *
 * Usage:
 *   import { calculatePriorityScore, rankSDs } from './priority-scorer.js';
 *
 *   const score = calculatePriorityScore(sd, okrAlignments, keyResults);
 *   const ranked = rankSDs(sds, alignments, keyResults);
 */

// Score weights and multipliers
const WEIGHTS = {
  // Base priority scores (0-40 points)
  priority: {
    critical: 40,
    high: 30,
    medium: 20,
    low: 10,
    default: 15,
  },

  // Triage level scores (0-30 points)
  triage: {
    High: 30,
    Medium: 20,
    Low: 10,
    Future: 0,
    default: 15,
  },

  // KR urgency multipliers
  krUrgency: {
    off_track: 3.0,
    at_risk: 2.0,
    on_track: 1.0,
    pending: 1.0,
    achieved: 0.0,
    missed: 0.0,
    default: 1.0,
  },

  // Contribution type multipliers
  contribution: {
    direct: 1.5,
    enabling: 1.0,
    supporting: 0.5,
    default: 0.5,
  },

  // SD type bonuses
  sdType: {
    security: 20,
    infrastructure: 15,
    bug_fix: 10,
    feature: 5,
    documentation: 0,
    default: 5,
  },

  // Time horizon urgency multipliers (for strategy_weight computation)
  timeHorizon: {
    now: 3.0,
    next: 2.0,
    later: 1.0,
    eventually: 0.5,
    default: 1.0,
  },

  // Max points per category
  maxPoints: {
    priority: 40,
    triage: 30,
    okrImpact: 50,
    sdType: 20,
    readiness: 10,
    strategyWeight: 150,  // Max strategy weight (matches max of other dimensions combined)
  },
};

/**
 * Calculate priority score for a single SD
 *
 * @param {Object} sd - Strategic Directive object
 * @param {Array} okrAlignments - Array of alignment objects for this SD
 * @param {Map|Object} keyResults - Map or object of KR ID -> KR object
 * @param {Object} [options] - Optional parameters
 * @param {number} [options.strategyWeight] - Pre-computed strategy weight (0-150)
 * @returns {Object} Score breakdown with total and component scores
 */
export function calculatePriorityScore(sd, okrAlignments = [], keyResults = {}, options = {}) {
  const breakdown = {
    priority: 0,
    triage: 0,
    okrImpact: 0,
    sdType: 0,
    readiness: 0,
    strategyWeight: 0,
    total: 0,
    details: {},
  };

  // 1. Base priority (0-40 points)
  const priorityKey = (sd.priority || '').toLowerCase();
  breakdown.priority = WEIGHTS.priority[priorityKey] || WEIGHTS.priority.default;
  breakdown.details.priority = `${priorityKey} → ${breakdown.priority} pts`;

  // 2. Triage level (0-30 points)
  const triageKey = sd.rolled_triage || '';
  breakdown.triage = WEIGHTS.triage[triageKey] || WEIGHTS.triage.default;
  breakdown.details.triage = `${triageKey || 'none'} → ${breakdown.triage} pts`;

  // 3. OKR impact (0-50 points)
  if (okrAlignments && okrAlignments.length > 0) {
    let okrTotal = 0;
    const okrDetails = [];

    for (const alignment of okrAlignments) {
      const krId = alignment.key_result_id;
      const kr = keyResults instanceof Map
        ? keyResults.get(krId)
        : keyResults[krId];

      if (kr) {
        const urgencyMult = WEIGHTS.krUrgency[kr.status] || WEIGHTS.krUrgency.default;
        const contribMult = WEIGHTS.contribution[alignment.contribution_type] || WEIGHTS.contribution.default;
        const weight = alignment.contribution_weight || 1.0;

        const points = 10 * urgencyMult * contribMult * weight;
        okrTotal += points;

        okrDetails.push(`${kr.code || krId}: ${kr.status} × ${alignment.contribution_type} = ${points.toFixed(1)}`);
      }
    }

    // Cap at max OKR points
    breakdown.okrImpact = Math.min(okrTotal, WEIGHTS.maxPoints.okrImpact);
    breakdown.details.okrImpact = okrDetails.join(', ') || 'none';
  } else {
    breakdown.details.okrImpact = 'no alignments';
  }

  // 4. SD type bonus (0-20 points)
  const sdTypeKey = (sd.sd_type || '').toLowerCase();
  breakdown.sdType = WEIGHTS.sdType[sdTypeKey] || WEIGHTS.sdType.default;
  breakdown.details.sdType = `${sdTypeKey || 'unknown'} → ${breakdown.sdType} pts`;

  // 5. Readiness score (0-10 points)
  const readiness = sd.readiness || 50;
  breakdown.readiness = Math.min(readiness / 10, WEIGHTS.maxPoints.readiness);
  breakdown.details.readiness = `${readiness}% → ${breakdown.readiness.toFixed(1)} pts`;

  // 6. Strategy weight integration
  // When strategy_weight > 0, it becomes 50% of total score.
  // Existing dimensions are scaled to the remaining 50%.
  const rawStrategyWeight = options.strategyWeight || 0;
  const dimensionTotal = breakdown.priority + breakdown.triage + breakdown.okrImpact + breakdown.sdType + breakdown.readiness;

  if (rawStrategyWeight > 0) {
    // Cap strategy weight at max
    breakdown.strategyWeight = Math.min(rawStrategyWeight, WEIGHTS.maxPoints.strategyWeight);

    // Normalize strategy weight to 0-150 range → scale to half of combined max
    const maxDimensions = WEIGHTS.maxPoints.priority + WEIGHTS.maxPoints.triage +
      WEIGHTS.maxPoints.okrImpact + WEIGHTS.maxPoints.sdType + WEIGHTS.maxPoints.readiness;

    // Strategy weight is 50% of total; existing dimensions are 50%
    const strategyPortion = (breakdown.strategyWeight / WEIGHTS.maxPoints.strategyWeight) * maxDimensions;
    const dimensionPortion = dimensionTotal;

    breakdown.total = Math.round((strategyPortion + dimensionPortion) / 2);
    breakdown.details.strategyWeight = `${breakdown.strategyWeight.toFixed(1)} → 50% blend (${breakdown.total} pts)`;
  } else {
    // No strategy weight: scoring unchanged from legacy behavior
    breakdown.total = Math.round(dimensionTotal);
    breakdown.details.strategyWeight = 'none (legacy scoring)';
  }

  return breakdown;
}

/**
 * Compute strategy_weight from OKR alignment + time_horizon urgency.
 *
 * Formula: sum of (10 × KR_urgency × contribution_mult × weight × time_horizon_mult)
 * Capped at WEIGHTS.maxPoints.strategyWeight (150).
 *
 * @param {Array} okrAlignments - Alignments for this SD
 * @param {Map|Object} keyResults - KR lookup
 * @param {string} timeHorizon - Time horizon of the linked strategy objective (now/next/later/eventually)
 * @returns {number} Strategy weight 0-150
 */
export function calculateStrategyWeight(okrAlignments = [], keyResults = {}, timeHorizon = '') {
  if (!okrAlignments || okrAlignments.length === 0) return 0;

  const horizonMult = WEIGHTS.timeHorizon[timeHorizon] || WEIGHTS.timeHorizon.default;
  let total = 0;

  for (const alignment of okrAlignments) {
    const krId = alignment.key_result_id;
    const kr = keyResults instanceof Map
      ? keyResults.get(krId)
      : keyResults[krId];

    if (!kr) continue;

    const urgencyMult = WEIGHTS.krUrgency[kr.status] || WEIGHTS.krUrgency.default;
    const contribMult = WEIGHTS.contribution[alignment.contribution_type] || WEIGHTS.contribution.default;
    const weight = alignment.contribution_weight || 1.0;

    total += 10 * urgencyMult * contribMult * weight * horizonMult;
  }

  return Math.min(Math.round(total * 10) / 10, WEIGHTS.maxPoints.strategyWeight);
}

/**
 * Calculate OKR impact score only (for detailed analysis)
 *
 * @param {Array} okrAlignments - Alignments for an SD
 * @param {Map|Object} keyResults - KR lookup
 * @returns {Object} OKR impact details
 */
export function calculateOKRImpact(okrAlignments, keyResults) {
  const result = {
    totalScore: 0,
    alignmentCount: okrAlignments?.length || 0,
    directCount: 0,
    enablingCount: 0,
    supportingCount: 0,
    atRiskKRs: [],
    details: [],
  };

  if (!okrAlignments || okrAlignments.length === 0) {
    return result;
  }

  for (const alignment of okrAlignments) {
    const krId = alignment.key_result_id;
    const kr = keyResults instanceof Map
      ? keyResults.get(krId)
      : keyResults[krId];

    if (!kr) continue;

    // Count by contribution type
    if (alignment.contribution_type === 'direct') result.directCount++;
    else if (alignment.contribution_type === 'enabling') result.enablingCount++;
    else result.supportingCount++;

    // Track at-risk KRs
    if (kr.status === 'at_risk' || kr.status === 'off_track') {
      result.atRiskKRs.push(kr.code || krId);
    }

    // Calculate score
    const urgencyMult = WEIGHTS.krUrgency[kr.status] || 1.0;
    const contribMult = WEIGHTS.contribution[alignment.contribution_type] || 0.5;
    const weight = alignment.contribution_weight || 1.0;
    const points = 10 * urgencyMult * contribMult * weight;

    result.totalScore += points;
    result.details.push({
      kr: kr.code || krId,
      status: kr.status,
      contribution: alignment.contribution_type,
      points: Math.round(points * 10) / 10,
    });
  }

  result.totalScore = Math.min(result.totalScore, WEIGHTS.maxPoints.okrImpact);
  return result;
}

/**
 * Rank all SDs by priority score
 *
 * @param {Array} sds - Array of SD objects
 * @param {Object} alignmentsBySd - Map of SD ID -> array of alignments
 * @param {Map|Object} keyResults - KR lookup
 * @returns {Array} SDs sorted by priority with scores
 */
export function rankSDs(sds, alignmentsBySd = {}, keyResults = {}, strategyWeights = {}) {
  const ranked = sds.map(sd => {
    const alignments = alignmentsBySd[sd.sd_key] || [];
    const sw = strategyWeights[sd.sd_key] || 0;
    const score = calculatePriorityScore(sd, alignments, keyResults, { strategyWeight: sw });

    return {
      sd,
      score: score.total,
      breakdown: score,
      okrImpact: calculateOKRImpact(alignments, keyResults),
    };
  });

  // Sort by total score descending
  ranked.sort((a, b) => b.score - a.score);

  return ranked;
}

/**
 * Get track assignment based on SD type
 *
 * @param {Object} sd - Strategic Directive
 * @returns {Object} Track assignment
 */
export function assignTrack(sd) {
  const sdType = (sd.sd_type || '').toLowerCase();
  const category = (sd.category || '').toLowerCase();

  // Track A: Infrastructure/Security
  if (['infrastructure', 'security', 'platform'].includes(sdType)) {
    return { track: 'A', trackName: 'Infrastructure/Safety' };
  }

  // Track C: Quality
  if (['quality', 'testing', 'documentation', 'bug_fix'].includes(sdType)) {
    return { track: 'C', trackName: 'Quality' };
  }

  // Track B: Features (default for features and unknown)
  if (['feature', 'enhancement'].includes(sdType)) {
    return { track: 'B', trackName: 'Feature/Stages' };
  }

  // Check category as fallback
  if (category.includes('infra') || category.includes('security')) {
    return { track: 'A', trackName: 'Infrastructure/Safety' };
  }
  if (category.includes('quality') || category.includes('test')) {
    return { track: 'C', trackName: 'Quality' };
  }

  // Default to standalone if can't determine
  return { track: 'STANDALONE', trackName: 'Standalone' };
}

/**
 * Print score summary for debugging
 *
 * @param {Array} rankedSDs - Output from rankSDs()
 */
export function printScoreSummary(rankedSDs) {
  console.log('\nPriority Score Summary:');
  console.log('═'.repeat(70));
  console.log('Rank | Score | SD ID                          | Type          | OKR Impact');
  console.log('─'.repeat(70));

  rankedSDs.slice(0, 20).forEach((item, index) => {
    const rank = String(index + 1).padStart(4);
    const score = String(item.score).padStart(5);
    const sdId = item.sd.sd_key.padEnd(30);
    const sdType = (item.sd.sd_type || 'unknown').padEnd(13);
    const okr = item.okrImpact.atRiskKRs.length > 0
      ? `at-risk: ${item.okrImpact.atRiskKRs.join(',')}`
      : `${item.okrImpact.alignmentCount} KRs`;

    console.log(`${rank} | ${score} | ${sdId} | ${sdType} | ${okr}`);
  });

  console.log('─'.repeat(70));
}

/**
 * Calculate deadline proximity factor for OKR-driven prioritization.
 * SD-MAN-GEN-CORRECTIVE-VISION-GAP-004 (FR-006)
 *
 * Returns a multiplier between 0.0 and 1.0:
 *   - 1.0 when at or past the deadline
 *   - 0.0 when 90+ days away
 *   - Linear interpolation between
 *
 * @param {string|Date} deadline - Key result deadline
 * @param {Date} [now] - Reference date (default: Date.now())
 * @returns {number} Proximity factor 0.0-1.0
 */
export function getDeadlineProximityFactor(deadline, now = new Date()) {
  if (!deadline) return 0.0;
  const deadlineDate = new Date(deadline);
  if (isNaN(deadlineDate.getTime())) return 0.0;

  const daysRemaining = (deadlineDate - now) / (1000 * 60 * 60 * 24);

  // At or past deadline → maximum urgency
  if (daysRemaining <= 0) return 1.0;

  // More than 90 days → no urgency boost
  const MAX_DAYS = 90;
  if (daysRemaining >= MAX_DAYS) return 0.0;

  // Linear interpolation: closer to deadline = higher factor
  return Math.round((1 - daysRemaining / MAX_DAYS) * 100) / 100;
}

// Export weights for reference
export { WEIGHTS };

// CLI support
if (process.argv[1]?.endsWith('priority-scorer.js')) {
  console.log('Priority Scorer Library');
  console.log('');
  console.log('Score Weights:');
  console.log('  Priority (critical/high/medium/low): 40/30/20/10 pts');
  console.log('  Triage (High/Medium/Low/Future): 30/20/10/0 pts');
  console.log('  OKR Impact: up to 50 pts');
  console.log('    - KR urgency: off_track=3x, at_risk=2x, on_track=1x');
  console.log('    - Contribution: direct=1.5x, enabling=1x, supporting=0.5x');
  console.log('  SD Type (security/infra/feature): 20/15/5 pts');
  console.log('  Readiness: up to 10 pts');
  console.log('');
  console.log('  Strategy Weight: up to 150 pts (50% blend when present)');
  console.log('    - Time horizon: now=3x, next=2x, later=1x, eventually=0.5x');
  console.log('');
  console.log('Max Total Score: ~150 pts (legacy) or blended when strategy active');
}

export default {
  calculatePriorityScore,
  calculateOKRImpact,
  calculateStrategyWeight,
  rankSDs,
  assignTrack,
  printScoreSummary,
  getDeadlineProximityFactor,
  WEIGHTS,
};

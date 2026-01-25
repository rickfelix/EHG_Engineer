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

  // Max points per category
  maxPoints: {
    priority: 40,
    triage: 30,
    okrImpact: 50,
    sdType: 20,
    readiness: 10,
  },
};

/**
 * Calculate priority score for a single SD
 *
 * @param {Object} sd - Strategic Directive object
 * @param {Array} okrAlignments - Array of alignment objects for this SD
 * @param {Map|Object} keyResults - Map or object of KR ID -> KR object
 * @returns {Object} Score breakdown with total and component scores
 */
export function calculatePriorityScore(sd, okrAlignments = [], keyResults = {}) {
  const breakdown = {
    priority: 0,
    triage: 0,
    okrImpact: 0,
    sdType: 0,
    readiness: 0,
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

  // Calculate total
  breakdown.total = Math.round(
    breakdown.priority +
    breakdown.triage +
    breakdown.okrImpact +
    breakdown.sdType +
    breakdown.readiness
  );

  return breakdown;
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
export function rankSDs(sds, alignmentsBySd = {}, keyResults = {}) {
  const ranked = sds.map(sd => {
    const alignments = alignmentsBySd[sd.sd_key] || [];
    const score = calculatePriorityScore(sd, alignments, keyResults);

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

// Export weights for reference
export { WEIGHTS };

// CLI support
if (process.argv[1].endsWith('priority-scorer.js')) {
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
  console.log('Max Total Score: ~150 pts');
}

export default {
  calculatePriorityScore,
  calculateOKRImpact,
  rankSDs,
  assignTrack,
  printScoreSummary,
  WEIGHTS,
};

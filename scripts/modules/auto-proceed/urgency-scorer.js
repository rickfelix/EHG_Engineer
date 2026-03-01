/**
 * Urgency Scorer for Learning-Based Queue Re-Prioritization
 * Part of SD-LEO-ENH-AUTO-PROCEED-001-11
 *
 * Computes normalized urgency scores and maps them to priority bands.
 * Uses deterministic band thresholds for explainability.
 *
 * @module urgency-scorer
 */

/**
 * Priority bands with deterministic thresholds
 * P0 (Critical): >= 0.85
 * P1 (High): 0.65 - 0.849
 * P2 (Medium): 0.40 - 0.649
 * P3 (Low): < 0.40
 */
export const BAND_THRESHOLDS = {
  P0: 0.85,
  P1: 0.65,
  P2: 0.40,
  P3: 0.00
};

/**
 * Configuration defaults (can be overridden via environment)
 */
export const CONFIG = {
  // Minimum delta to trigger re-prioritization
  THRESHOLD_DELTA: parseFloat(process.env.URGENCY_THRESHOLD_DELTA || '0.15'),
  // Rate limit window in ms
  RATE_LIMIT_WINDOW_MS: parseInt(process.env.URGENCY_RATE_LIMIT_MS || '500'),
  // Jitter protection window in ms
  JITTER_WINDOW_MS: parseInt(process.env.URGENCY_JITTER_WINDOW_MS || '2000'),
  // Override delta (bypasses jitter protection)
  OVERRIDE_DELTA: parseFloat(process.env.URGENCY_OVERRIDE_DELTA || '0.30')
};

/**
 * Map a score to its priority band
 * @param {number} score - Urgency score (0.0 - 1.0)
 * @returns {string} Priority band (P0, P1, P2, P3)
 */
export function scoreToBand(score) {
  if (typeof score !== 'number' || isNaN(score)) {
    return 'P3'; // Default to lowest priority for invalid scores
  }

  // Clamp score to valid range
  const clampedScore = Math.max(0, Math.min(1, score));

  if (clampedScore >= BAND_THRESHOLDS.P0) return 'P0';
  if (clampedScore >= BAND_THRESHOLDS.P1) return 'P1';
  if (clampedScore >= BAND_THRESHOLDS.P2) return 'P2';
  return 'P3';
}

/**
 * Convert priority band to numeric value for sorting
 * @param {string} band - Priority band (P0, P1, P2, P3)
 * @returns {number} Numeric priority (0 = highest, 3 = lowest)
 */
export function bandToNumeric(band) {
  const bandMap = { P0: 0, P1: 1, P2: 2, P3: 3 };
  return bandMap[band] ?? 3;
}

/**
 * Calculate urgency score from learning signals
 *
 * @param {Object} params - Scoring parameters
 * @param {Object} params.sd - Strategic directive data
 * @param {Array} params.patterns - Related issue patterns
 * @param {Array} params.retrospectives - Related retrospectives
 * @param {Object} params.learningUpdate - Learning update event (if any)
 * @returns {Object} { score, band, reason_codes, model_version }
 */
export function calculateUrgencyScore({
  sd,
  patterns = [],
  _retrospectives = [],
  learningUpdate = null,
  okrImpact = null,
  okrDateProximity = null
}) {
  let score = 0.5; // Base score (medium priority)
  const reason_codes = [];

  // Factor 1: SD Priority (weight: 0.25)
  const priorityBoost = {
    critical: 0.25,
    high: 0.15,
    medium: 0.0,
    low: -0.10
  };
  const sdPriority = sd?.priority?.toLowerCase() || 'medium';
  score += priorityBoost[sdPriority] || 0;
  if (priorityBoost[sdPriority] > 0) {
    reason_codes.push(`priority_${sdPriority}`);
  }

  // Factor 2: Related Issue Patterns (weight: 0.20)
  const activePatterns = patterns.filter(p =>
    p.status !== 'resolved' &&
    (p.severity === 'critical' || p.severity === 'high')
  );
  if (activePatterns.length > 0) {
    const patternBoost = Math.min(activePatterns.length * 0.05, 0.20);
    score += patternBoost;
    reason_codes.push(`patterns_${activePatterns.length}`);
  }

  // Factor 3: Blocking Dependencies (weight: 0.15)
  // If this SD is blocking others, it should be prioritized
  if (sd?.metadata?.blocks_count > 0) {
    const blockBoost = Math.min(sd.metadata.blocks_count * 0.05, 0.15);
    score += blockBoost;
    reason_codes.push(`blocks_${sd.metadata.blocks_count}`);
  }

  // Factor 4: Time Sensitivity (weight: 0.15)
  // SDs in progress for too long get deprioritized to allow fresh work
  // SDs with recent activity get prioritized for momentum
  if (sd?.updated_at) {
    const hoursSinceUpdate = (Date.now() - new Date(sd.updated_at).getTime()) / (1000 * 60 * 60);
    if (hoursSinceUpdate < 1) {
      score += 0.10; // Recent momentum
      reason_codes.push('recent_activity');
    } else if (hoursSinceUpdate > 168) { // 7 days
      score -= 0.05; // Stale
      reason_codes.push('stale_7d');
    }
  }

  // Factor 5: Learning Update Override (weight: 0.20, reduced from 0.40 for OKR blend)
  if (learningUpdate?.urgency_score != null) {
    const learningWeight = 0.20;
    score = score * (1 - learningWeight) + learningUpdate.urgency_score * learningWeight;
    reason_codes.push(...(learningUpdate.reason_codes || ['learning_signal']));
  }

  // Factor 6: Current Phase Progress (weight: 0.10)
  if (sd?.progress_percentage != null && sd.progress_percentage >= 80) {
    score += 0.10;
    reason_codes.push('near_completion');
  }

  // Factor 7: OKR Impact (weight: 0.20)
  // Blends OKR alignment into urgency instead of overriding it.
  // okrImpact can be provided directly or read from sd.metadata.okr_impact_score
  const okrScore = okrImpact?.totalScore ?? sd?.metadata?.okr_impact_score ?? null;
  if (okrScore != null && okrScore > 0) {
    // Normalize: priority-scorer.js OKR impact is 0-50, normalize to 0-1
    const normalizedOkr = Math.min(okrScore / 50, 1.0);
    score += normalizedOkr * 0.20;
    reason_codes.push('okr_priority');
  }

  // Factor 8: OKR Date Proximity (weight: 0.15)
  // Boosts urgency for SDs linked to OKRs nearing their end_date.
  // okrDateProximity can be provided as { daysRemaining: N } or read from sd.metadata.okr_days_remaining
  const daysRemaining = okrDateProximity?.daysRemaining ?? sd?.metadata?.okr_days_remaining ?? null;
  if (daysRemaining != null && daysRemaining >= 0) {
    if (daysRemaining <= 3) {
      score += 0.15; // Critical — OKR cycle ending imminently
      reason_codes.push('okr_deadline_critical');
    } else if (daysRemaining <= 7) {
      score += 0.10; // Urgent — within a week
      reason_codes.push('okr_deadline_urgent');
    } else if (daysRemaining <= 14) {
      score += 0.05; // Approaching
      reason_codes.push('okr_deadline_approaching');
    }
  }

  // Factor 9: Escalation Status (weight: 0.20)
  // SDs with active DFE escalations get a priority boost to ensure
  // escalated items are addressed before non-escalated work.
  // Checks sd.metadata.has_active_escalation (set by DFE gate) or escalationActive param.
  const hasEscalation = sd?.metadata?.has_active_escalation === true
    || sd?.metadata?.escalation_status === 'pending';
  if (hasEscalation) {
    score += 0.20;
    reason_codes.push('escalated_by_dfe');
  }

  // Clamp final score to valid range
  score = Math.max(0, Math.min(1, score));

  return {
    score: Math.round(score * 100) / 100,
    band: scoreToBand(score),
    reason_codes: reason_codes.length > 0 ? reason_codes : ['baseline'],
    model_version: 'v1.3.0'
  };
}

/**
 * Check if score delta exceeds threshold for re-prioritization
 *
 * @param {number} oldScore - Previous urgency score
 * @param {number} newScore - New urgency score
 * @returns {boolean} Whether re-prioritization should occur
 */
export function shouldReprioritize(oldScore, newScore) {
  const delta = Math.abs(newScore - oldScore);
  return delta >= CONFIG.THRESHOLD_DELTA;
}

/**
 * Check if band change is allowed given jitter protection
 *
 * @param {Object} params - Check parameters
 * @param {string} params.oldBand - Previous band
 * @param {string} params.newBand - New band
 * @param {number} params.scoreDelta - Score change delta
 * @param {Date} params.lastChangeAt - Last band change timestamp
 * @returns {{ allowed: boolean, reason: string }}
 */
export function checkJitterProtection({
  oldBand,
  newBand,
  scoreDelta,
  lastChangeAt
}) {
  // If bands are the same, no jitter concern
  if (oldBand === newBand) {
    return { allowed: true, reason: 'same_band' };
  }

  // Check if override delta is met (bypasses jitter protection)
  if (Math.abs(scoreDelta) >= CONFIG.OVERRIDE_DELTA) {
    return { allowed: true, reason: 'override_delta' };
  }

  // Check jitter window
  if (lastChangeAt) {
    const msSinceChange = Date.now() - new Date(lastChangeAt).getTime();
    if (msSinceChange < CONFIG.JITTER_WINDOW_MS) {
      return {
        allowed: false,
        reason: `deferred_due_to_jitter_${msSinceChange}ms`
      };
    }
  }

  return { allowed: true, reason: 'jitter_window_passed' };
}

/**
 * Determine OKR hard tier for an SD.
 * OKR-linked SDs get tier 0 (highest), non-OKR SDs get tier 1.
 * This acts as a hard boundary: all OKR-linked SDs appear before non-OKR SDs
 * within the same priority band.
 *
 * Part of SD-MAN-FEAT-CORRECTIVE-VISION-GAP-070
 *
 * @param {Object} sd - SD object with metadata
 * @returns {number} 0 for OKR-linked, 1 for non-OKR
 */
export function getOkrHardTier(sd) {
  const hasOkr = sd?.metadata?.okr_id != null
    || (Array.isArray(sd?.metadata?.objective_ids) && sd.metadata.objective_ids.length > 0)
    || sd?.metadata?.okr_impact_score > 0;
  return hasOkr ? 0 : 1;
}

/**
 * Compare two SDs for queue ordering
 * Orders by: band (P0 first) > OKR hard tier > score (descending) > enqueue_time (ascending)
 *
 * SD-MAN-FEAT-CORRECTIVE-VISION-GAP-070: Added OKR hard tier between band and score.
 * Within the same priority band, OKR-linked SDs always appear before non-OKR SDs.
 * Non-OKR SDs still get a minimum slot allocation (they're not starved — they appear
 * after OKR-linked SDs within each band, maintaining fairness).
 *
 * @param {Object} a - First SD with urgency data
 * @param {Object} b - Second SD with urgency data
 * @returns {number} Comparison result (-1, 0, 1)
 */
export function compareByUrgency(a, b) {
  // Primary: Band (P0 = 0, P3 = 3, lower is higher priority)
  const bandA = bandToNumeric(a.urgency_band || 'P3');
  const bandB = bandToNumeric(b.urgency_band || 'P3');

  if (bandA !== bandB) {
    return bandA - bandB;
  }

  // Secondary: OKR hard tier (0 = OKR-linked, 1 = non-OKR)
  const okrTierA = getOkrHardTier(a);
  const okrTierB = getOkrHardTier(b);

  if (okrTierA !== okrTierB) {
    return okrTierA - okrTierB;
  }

  // Tertiary: Score (descending)
  const scoreA = a.urgency_score ?? 0.5;
  const scoreB = b.urgency_score ?? 0.5;

  if (Math.abs(scoreA - scoreB) > 0.01) {
    return scoreB - scoreA; // Higher score first
  }

  // Quaternary: Enqueue time (ascending - older first for FIFO within same priority)
  const timeA = new Date(a.enqueue_time || a.created_at || 0).getTime();
  const timeB = new Date(b.enqueue_time || b.created_at || 0).getTime();

  return timeA - timeB;
}

/**
 * Sort an array of SDs by urgency with stable sort
 *
 * @param {Array} sds - Array of SD objects with urgency data
 * @returns {Array} Sorted array (new array, original unchanged)
 */
export function sortByUrgency(sds) {
  if (!Array.isArray(sds)) return [];

  // Create indexed copy for stable sort
  const indexed = sds.map((sd, idx) => ({ sd, originalIndex: idx }));

  // Sort with stability preservation
  indexed.sort((a, b) => {
    const comparison = compareByUrgency(a.sd, b.sd);
    // If equal, preserve original order
    return comparison !== 0 ? comparison : a.originalIndex - b.originalIndex;
  });

  return indexed.map(item => item.sd);
}

export default {
  BAND_THRESHOLDS,
  CONFIG,
  scoreToBand,
  bandToNumeric,
  calculateUrgencyScore,
  shouldReprioritize,
  checkJitterProtection,
  getOkrHardTier,
  compareByUrgency,
  sortByUrgency
};

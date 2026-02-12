/**
 * Quarantine Engine
 * SD-LEO-SELF-IMPROVE-001C - Phase 1: Feedback Quality Layer
 *
 * Handles risk-based quarantine decisions for feedback items.
 * Items with high risk scores (e.g., prompt injection) are quarantined
 * for human review before processing.
 *
 * @module lib/quality/quarantine-engine
 */

import { getThresholds } from './sanitizer.js';

/**
 * Quarantine status enum
 */
export const QUARANTINE_STATUS = {
  NONE: 'none',
  PENDING: 'pending_review',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  AUTO_RELEASED: 'auto_released'
};

/**
 * Quarantine reasons
 */
export const QUARANTINE_REASONS = {
  PROMPT_INJECTION: 'prompt_injection_detected',
  HIGH_RISK_SCORE: 'high_risk_score',
  SUSPICIOUS_CONTENT: 'suspicious_content',
  MULTIPLE_PII: 'multiple_pii_redactions',
  MANUAL: 'manual_quarantine'
};

/**
 * Evaluate if feedback should be quarantined
 * @param {Object} feedback - Feedback item
 * @param {Object} sanitizationResult - Result from sanitizer
 * @returns {Promise<Object>} Quarantine decision
 */
export async function evaluateQuarantine(feedback, sanitizationResult) {
  const startTime = Date.now();
  const { quarantineRiskThreshold } = await getThresholds();

  const decision = {
    shouldQuarantine: false,
    reasons: [],
    riskScore: 0,
    status: QUARANTINE_STATUS.NONE,
    processing_time_ms: 0
  };

  try {
    // Check for injection detection
    if (sanitizationResult.injection?.detected) {
      decision.shouldQuarantine = true;
      decision.reasons.push({
        type: QUARANTINE_REASONS.PROMPT_INJECTION,
        detail: `Detected ${sanitizationResult.injection.patterns.length} injection pattern(s)`,
        patterns: sanitizationResult.injection.patterns.map(p => p.type)
      });
      decision.riskScore = Math.max(decision.riskScore, sanitizationResult.injection.risk_score);
    }

    // Check risk score threshold
    const riskScore = sanitizationResult.injection?.risk_score || 0;
    if (riskScore >= quarantineRiskThreshold) {
      if (!decision.shouldQuarantine) {
        decision.shouldQuarantine = true;
        decision.reasons.push({
          type: QUARANTINE_REASONS.HIGH_RISK_SCORE,
          detail: `Risk score ${riskScore} >= threshold ${quarantineRiskThreshold}`
        });
      }
      decision.riskScore = riskScore;
    }

    // Check for excessive PII redactions (suspicious)
    const redactionCount = sanitizationResult.redactions?.length || 0;
    const highSeverityRedactions = (sanitizationResult.redactions || [])
      .filter(r => r.severity === 'high' || r.severity === 'critical').length;

    if (highSeverityRedactions >= 3 || redactionCount >= 5) {
      decision.shouldQuarantine = true;
      decision.reasons.push({
        type: QUARANTINE_REASONS.MULTIPLE_PII,
        detail: `${redactionCount} redactions (${highSeverityRedactions} high/critical)`,
        redactionCount,
        highSeverityCount: highSeverityRedactions
      });
      decision.riskScore = Math.max(decision.riskScore, 60);
    }

    // Set appropriate status
    if (decision.shouldQuarantine) {
      decision.status = QUARANTINE_STATUS.PENDING;
    }

    decision.processing_time_ms = Date.now() - startTime;
    return decision;

  } catch (error) {
    console.error('[QuarantineEngine] Evaluation failed:', error.message);
    decision.error = error.message;
    decision.processing_time_ms = Date.now() - startTime;
    return decision;
  }
}

/**
 * Create quarantine record for feedback item
 * @param {Object} feedback - Feedback item to quarantine
 * @param {Object} decision - Quarantine decision
 * @param {Object} supabase - Supabase client
 * @returns {Promise<Object>} Created quarantine record
 */
export async function createQuarantineRecord(feedback, decision, supabase) {
  const record = {
    feedback_id: feedback.id,
    status: decision.status,
    risk_score: decision.riskScore,
    reasons: decision.reasons,
    original_content: {
      title: feedback.title,
      description: feedback.description
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  // Store in metadata if no dedicated quarantine table
  const { data, error } = await supabase
    .from('feedback')
    .update({
      metadata: {
        ...feedback.metadata,
        quarantine: record
      },
      status: 'quarantined',
      updated_at: new Date().toISOString()
    })
    .eq('id', feedback.id)
    .select()
    .single();

  if (error) {
    console.error('[QuarantineEngine] Failed to create quarantine record:', error.message);
    throw error;
  }

  return { record, feedback: data };
}

/**
 * Release feedback from quarantine
 * @param {string} feedbackId - ID of quarantined feedback
 * @param {Object} options - Release options
 * @param {string} options.status - New quarantine status (approved/rejected)
 * @param {string} options.reviewedBy - Reviewer identifier
 * @param {string} options.notes - Review notes
 * @param {Object} supabase - Supabase client
 * @returns {Promise<Object>} Updated feedback
 */
export async function releaseFromQuarantine(feedbackId, options, supabase) {
  const { status, reviewedBy, notes } = options;

  // Get current feedback
  const { data: feedback, error: fetchError } = await supabase
    .from('feedback')
    .select('*')
    .eq('id', feedbackId)
    .single();

  if (fetchError) throw fetchError;

  const quarantine = feedback.metadata?.quarantine || {};

  // Update quarantine record
  const updatedQuarantine = {
    ...quarantine,
    status: status === 'approved' ? QUARANTINE_STATUS.APPROVED : QUARANTINE_STATUS.REJECTED,
    reviewed_at: new Date().toISOString(),
    reviewed_by: reviewedBy,
    review_notes: notes
  };

  // Determine new feedback status
  const newFeedbackStatus = status === 'approved' ? 'new' : 'rejected';

  const { data, error } = await supabase
    .from('feedback')
    .update({
      metadata: {
        ...feedback.metadata,
        quarantine: updatedQuarantine
      },
      status: newFeedbackStatus,
      updated_at: new Date().toISOString()
    })
    .eq('id', feedbackId)
    .select()
    .single();

  if (error) throw error;

  return data;
}

/**
 * Get all quarantined items pending review
 * @param {Object} options - Query options
 * @param {number} options.limit - Max items to return
 * @param {string} options.sortBy - Sort field
 * @param {Object} supabase - Supabase client
 * @returns {Promise<Array>} Quarantined items
 */
export async function getPendingQuarantineItems(options = {}, supabase) {
  const { limit = 50, sortBy = 'created_at' } = options;

  const { data, error } = await supabase
    .from('feedback')
    .select('*')
    .eq('status', 'quarantined')
    .order(sortBy, { ascending: false })
    .limit(limit);

  if (error) throw error;

  return data || [];
}

/**
 * Get quarantine statistics
 * @param {Object} supabase - Supabase client
 * @returns {Promise<Object>} Quarantine stats
 */
export async function getQuarantineStats(supabase) {
  const { data, error } = await supabase
    .from('feedback')
    .select('status, metadata')
    .eq('status', 'quarantined');

  if (error) throw error;

  const stats = {
    total: data?.length || 0,
    byReason: {},
    avgRiskScore: 0
  };

  let totalRiskScore = 0;

  for (const item of data || []) {
    const quarantine = item.metadata?.quarantine;
    if (quarantine) {
      totalRiskScore += quarantine.risk_score || 0;

      for (const reason of quarantine.reasons || []) {
        stats.byReason[reason.type] = (stats.byReason[reason.type] || 0) + 1;
      }
    }
  }

  if (stats.total > 0) {
    stats.avgRiskScore = Math.round(totalRiskScore / stats.total);
  }

  return stats;
}

// Export default for CommonJS compatibility
export default {
  QUARANTINE_STATUS,
  QUARANTINE_REASONS,
  evaluateQuarantine,
  createQuarantineRecord,
  releaseFromQuarantine,
  getPendingQuarantineItems,
  getQuarantineStats
};

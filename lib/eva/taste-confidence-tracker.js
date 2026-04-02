/**
 * Taste Confidence Tracker
 *
 * Computes rolling agreement rate with recency weighting
 * over the last N taste decisions per gate type.
 * NOT ML — pure statistics over a structured decision log.
 *
 * SD: SD-LEO-ORCH-GSTACK-TASTE-GATE-001-B
 * @module lib/eva/taste-confidence-tracker
 */

import { createSupabaseServiceClient } from '../supabase-client.js';

const DEFAULT_WINDOW = 20;
const RECENCY_DECAY = 0.95;

/**
 * Compute confidence for a gate type based on historical decisions.
 *
 * Agreement = would the system's recommendation have matched
 * the chairman's actual decision? Computed with exponential
 * recency weighting so recent decisions matter more.
 *
 * @param {string} gateType - 'design', 'scope', or 'architecture'
 * @param {object} [options]
 * @param {string} [options.ventureCategory] - Filter by venture type
 * @param {number} [options.window] - Number of decisions to consider (default: 20)
 * @returns {Promise<object>} { confidence, totalDecisions, agreementCount, window, driftAlert }
 */
export async function computeConfidence(gateType, options = {}) {
  const supabase = createSupabaseServiceClient();
  const window = options.window || DEFAULT_WINDOW;

  // Fetch recent active decisions (exclude timeout/system)
  const { data: decisions, error } = await supabase
    .from('taste_interaction_logs')
    .select('decision, dimension_scores, confidence_at_decision, created_at')
    .eq('gate_type', gateType)
    .eq('source', 'active')
    .order('created_at', { ascending: false })
    .limit(window);

  if (error || !decisions?.length) {
    return {
      confidence: 0,
      totalDecisions: 0,
      agreementCount: 0,
      window,
      driftAlert: false,
      reason: error ? `Query error: ${error.message}` : 'No active decisions found',
    };
  }

  // Compute weighted agreement rate
  // "Agreement" = decision was APPROVE (system would have recommended proceed)
  let weightedAgreement = 0;
  let weightSum = 0;

  for (let i = 0; i < decisions.length; i++) {
    const weight = Math.pow(RECENCY_DECAY, i);
    const agreed = decisions[i].decision === 'approve' ? 1 : 0;
    weightedAgreement += agreed * weight;
    weightSum += weight;
  }

  const confidence = weightSum > 0 ? weightedAgreement / weightSum : 0;
  const roundedConfidence = Math.round(confidence * 1000) / 1000;

  // Drift detection: compare last 10 vs last 30 agreement rates
  let driftAlert = false;
  if (decisions.length >= 15) {
    const recent10 = decisions.slice(0, 10);
    const older = decisions.slice(10);
    const recentRate = recent10.filter(d => d.decision === 'approve').length / recent10.length;
    const olderRate = older.filter(d => d.decision === 'approve').length / older.length;
    driftAlert = Math.abs(recentRate - olderRate) > 0.15;
  }

  return {
    confidence: roundedConfidence,
    totalDecisions: decisions.length,
    agreementCount: decisions.filter(d => d.decision === 'approve').length,
    window,
    driftAlert,
  };
}

/**
 * Get comprehensive metrics for the observability dashboard.
 * Returns all data needed by TasteConfidenceMetrics widget.
 * SD: SD-LEO-ORCH-GSTACK-TASTE-GATE-001-C
 *
 * @param {string} gateType - 'design', 'scope', or 'architecture'
 * @returns {Promise<object>} Dashboard metrics
 */
export async function getDashboardMetrics(gateType) {
  const supabase = createSupabaseServiceClient();
  const confidence = await computeConfidence(gateType);

  const { data: allDecisions } = await supabase
    .from('taste_interaction_logs')
    .select('decision, source, created_at')
    .eq('gate_type', gateType)
    .order('created_at', { ascending: false })
    .limit(50);

  const total = allDecisions?.length || 0;
  const approvals = allDecisions?.filter(d => d.decision === 'approve').length || 0;
  const passRate = total > 0 ? Math.round((approvals / total) * 100) : 0;

  const overrides = allDecisions?.filter(d =>
    (d.source === 'system' || d.source === 'timeout') && d.decision !== 'approve'
  ).length || 0;
  const overrideRate = total > 0 ? Math.round((overrides / total) * 100) : 0;

  const { data: profile } = await supabase
    .from('taste_profiles')
    .select('trust_level')
    .eq('gate_type', gateType)
    .is('venture_id', null)
    .maybeSingle();

  return {
    gateType,
    confidence: confidence.confidence,
    totalDecisions: confidence.totalDecisions,
    driftAlert: confidence.driftAlert,
    passRate,
    overrideRate,
    trustLevel: profile?.trust_level || 'manual',
    decisionsForPromotion: Math.max(0, 15 - confidence.totalDecisions),
  };
}

/**
 * Check if a gate type has sufficient decisions for trust promotion.
 *
 * @param {string} gateType
 * @param {number} [minDecisions=15] - Minimum decisions required
 * @returns {Promise<object>} { ready, confidence, decisionsNeeded }
 */
export async function checkPromotionReadiness(gateType, minDecisions = 15) {
  const result = await computeConfidence(gateType);

  return {
    ready: result.totalDecisions >= minDecisions && result.confidence >= 0.85,
    confidence: result.confidence,
    totalDecisions: result.totalDecisions,
    decisionsNeeded: Math.max(0, minDecisions - result.totalDecisions),
    driftAlert: result.driftAlert,
  };
}

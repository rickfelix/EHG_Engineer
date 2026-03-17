/**
 * Operations Customer Health Scoring Service
 * SD: SD-LEO-INFRA-OPERATIONS-CUSTOMER-HEALTH-001
 *
 * Per-customer health scoring across 4 dimensions:
 * - login_frequency: Login patterns and session duration
 * - feature_adoption: Feature breadth and depth metrics
 * - sentiment: Support interactions and NPS signals
 * - payment: Billing history and plan changes
 *
 * Includes at-risk detection with configurable thresholds
 * and persona behavioral feed aggregation.
 */

import { createSupabaseServiceClient } from '../../supabase-client.js';
import dotenv from 'dotenv';

dotenv.config();

function getSupabase() {
  return createSupabaseServiceClient();
}

export const HEALTH_DIMENSIONS = [
  'login_frequency',
  'feature_adoption',
  'sentiment',
  'payment',
];

const DEFAULT_AT_RISK_THRESHOLD = 40;

/**
 * Create a health score record for a customer.
 * @param {Object} params
 * @param {string} params.ventureId - Venture UUID
 * @param {string} params.customerId - Customer identifier
 * @param {Object} params.dimensionScores - {login_frequency, feature_adoption, sentiment, payment}
 * @param {number} params.overallScore - Weighted average 0-100
 * @param {Object} [params.metadata] - Additional scoring context
 * @param {string} [params.createdBy]
 * @returns {Promise<Object>} Created record
 */
export async function createHealthScore({
  ventureId,
  customerId,
  dimensionScores,
  overallScore,
  metadata = null,
  createdBy = 'ops-health-service',
}) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('ops_customer_health_scores')
    .insert({
      venture_id: ventureId,
      customer_id: customerId,
      dimension_scores: dimensionScores,
      overall_score: overallScore,
      metadata,
      created_by: createdBy,
      computed_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw new Error(`createHealthScore failed: ${error.message}`);
  return data;
}

/**
 * Get the latest health score for a customer.
 * @param {string} ventureId
 * @param {string} customerId
 * @returns {Promise<Object|null>}
 */
export async function getLatestHealthScore(ventureId, customerId) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('ops_customer_health_scores')
    .select('*')
    .eq('venture_id', ventureId)
    .eq('customer_id', customerId)
    .order('computed_at', { ascending: false })
    .limit(1)
    .single();

  if (error) return null;
  return data;
}

/**
 * List health scores for a venture (latest per customer).
 * @param {string} ventureId
 * @param {Object} [options]
 * @param {number} [options.limit]
 * @param {string} [options.sortBy] - 'overall_score' or 'computed_at'
 * @param {boolean} [options.ascending]
 * @returns {Promise<Array>}
 */
export async function listHealthScores(ventureId, { limit = 100, sortBy = 'overall_score', ascending = true } = {}) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('ops_customer_health_scores')
    .select('*')
    .eq('venture_id', ventureId)
    .order(sortBy, { ascending })
    .limit(limit);

  if (error) throw new Error(`listHealthScores failed: ${error.message}`);
  return data || [];
}

/**
 * Get health score history for a customer (time-series).
 * @param {string} ventureId
 * @param {string} customerId
 * @param {Object} [options]
 * @param {number} [options.limit] - Max records
 * @returns {Promise<Array>}
 */
export async function getHealthScoreHistory(ventureId, customerId, { limit = 30 } = {}) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('ops_customer_health_scores')
    .select('overall_score, dimension_scores, computed_at')
    .eq('venture_id', ventureId)
    .eq('customer_id', customerId)
    .order('computed_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`getHealthScoreHistory failed: ${error.message}`);
  return data || [];
}

/**
 * Detect at-risk customers based on health score threshold.
 * @param {string} ventureId
 * @param {number} [threshold] - Score below which customer is at-risk
 * @returns {Promise<Array<{customerId, overallScore, triggerType, recommendedAction}>>}
 */
export async function detectAtRiskCustomers(ventureId, threshold = DEFAULT_AT_RISK_THRESHOLD) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('ops_customer_health_scores')
    .select('customer_id, overall_score, dimension_scores, computed_at')
    .eq('venture_id', ventureId)
    .lt('overall_score', threshold)
    .order('overall_score', { ascending: true });

  if (error) throw new Error(`detectAtRiskCustomers failed: ${error.message}`);

  return (data || []).map(row => {
    const lowestDimension = Object.entries(row.dimension_scores || {})
      .sort(([, a], [, b]) => a - b)[0];

    return {
      customerId: row.customer_id,
      overallScore: row.overall_score,
      triggerType: lowestDimension ? `low_${lowestDimension[0]}` : 'low_overall',
      recommendedAction: getRecommendedAction(lowestDimension?.[0], row.overall_score),
      computedAt: row.computed_at,
    };
  });
}

/**
 * Get recommended action based on lowest scoring dimension.
 */
function getRecommendedAction(dimension, score) {
  if (score < 20) return 'urgent_outreach';
  const actions = {
    login_frequency: 'engagement_campaign',
    feature_adoption: 'onboarding_refresh',
    sentiment: 'support_followup',
    payment: 'billing_review',
  };
  return actions[dimension] || 'general_checkup';
}

/**
 * Aggregate anonymized behavioral patterns for persona feed.
 * @param {string} ventureId
 * @param {Object} params
 * @param {string} params.personaType - Persona category
 * @param {Object} params.behavioralPatterns - Aggregated patterns
 * @param {number} params.sampleSize - Number of customers in aggregate
 * @param {string} [params.createdBy]
 * @returns {Promise<Object>}
 */
export async function createBehavioralFeedEntry({
  ventureId,
  personaType,
  behavioralPatterns,
  sampleSize,
  createdBy = 'ops-health-service',
}) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('persona_behavioral_data')
    .insert({
      venture_id: ventureId,
      persona_type: personaType,
      behavioral_patterns: behavioralPatterns,
      sample_size: sampleSize,
      created_by: createdBy,
    })
    .select()
    .single();

  if (error) throw new Error(`createBehavioralFeedEntry failed: ${error.message}`);
  return data;
}

/**
 * List behavioral feed entries for a venture.
 * @param {string} ventureId
 * @param {Object} [options]
 * @param {string} [options.personaType]
 * @returns {Promise<Array>}
 */
export async function listBehavioralFeed(ventureId, { personaType } = {}) {
  const supabase = getSupabase();
  let query = supabase
    .from('persona_behavioral_data')
    .select('*')
    .eq('venture_id', ventureId)
    .order('created_at', { ascending: false });

  if (personaType) query = query.eq('persona_type', personaType);

  const { data, error } = await query;
  if (error) throw new Error(`listBehavioralFeed failed: ${error.message}`);
  return data || [];
}

export { DEFAULT_AT_RISK_THRESHOLD };

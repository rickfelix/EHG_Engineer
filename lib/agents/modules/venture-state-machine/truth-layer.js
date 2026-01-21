/**
 * VentureStateMachine - Truth Layer Module
 *
 * Handles prediction and outcome logging for calibration.
 *
 * @module lib/agents/modules/venture-state-machine/truth-layer
 */

import { v4 as uuidv4 } from 'uuid';

/**
 * Truth Layer: Log prediction before state transition
 *
 * @param {Object} supabase - Supabase client
 * @param {string} ceoAgentId - CEO agent ID
 * @param {string} ventureId - Venture ID
 * @param {Object} predictionData - Predicted outcome
 * @param {string} correlationId - Operation correlation ID
 * @returns {Promise<string>} prediction_event_id for outcome linking
 */
export async function logPrediction(supabase, ceoAgentId, ventureId, predictionData, correlationId = null) {
  const idempotencyKey = uuidv4();
  const actualCorrelationId = correlationId || uuidv4();

  const { data, error } = await supabase
    .from('system_events')
    .insert({
      event_type: 'AGENT_PREDICTION',
      correlation_id: actualCorrelationId,
      idempotency_key: idempotencyKey,
      event_data: {
        predicted_outcome: predictionData,
        agent_id: ceoAgentId,
        venture_id: ventureId,
        timestamp: new Date().toISOString()
      },
      metadata: {
        source: 'VentureStateMachine',
        prediction_type: predictionData.action || 'unknown'
      }
    })
    .select('id')
    .single();

  if (error) {
    console.warn(`   [TRUTH] Prediction logging failed: ${error.message}`);
    return null;
  }

  console.log(`   [TRUTH] Prediction logged: ${data.id}`);
  return data.id;
}

/**
 * Truth Layer: Log actual outcome and compute calibration delta
 *
 * @param {Object} supabase - Supabase client
 * @param {string} ceoAgentId - CEO agent ID
 * @param {string} ventureId - Venture ID
 * @param {string} predictionEventId - ID from logPrediction
 * @param {Object} actualOutcome - Actual outcome data
 * @param {Object} prediction - Original prediction for delta calculation
 * @returns {Promise<void>}
 */
export async function logOutcome(supabase, ceoAgentId, ventureId, predictionEventId, actualOutcome, prediction = {}) {
  if (!predictionEventId) {
    console.warn('   [TRUTH] No prediction event ID provided for outcome logging');
    return;
  }

  const calibrationDelta = computeCalibrationDelta(prediction, actualOutcome);

  const { error } = await supabase
    .from('system_events')
    .insert({
      event_type: 'AGENT_OUTCOME',
      parent_event_id: predictionEventId,
      event_data: {
        actual_outcome: actualOutcome,
        calibration_delta: calibrationDelta,
        agent_id: ceoAgentId,
        venture_id: ventureId,
        timestamp: new Date().toISOString()
      },
      metadata: {
        source: 'VentureStateMachine',
        calibration_accuracy: calibrationDelta.accuracy_score || 0
      }
    });

  if (error) {
    console.warn(`   [TRUTH] Outcome logging failed: ${error.message}`);
    return;
  }

  console.log(`   [TRUTH] Outcome logged (accuracy: ${(calibrationDelta.accuracy_score * 100).toFixed(1)}%)`);
}

/**
 * Compute calibration delta between prediction and outcome
 *
 * @param {Object} prediction - Original prediction
 * @param {Object} outcome - Actual outcome
 * @returns {Object} Calibration delta
 */
export function computeCalibrationDelta(prediction, outcome) {
  const delta = {
    fields_compared: [],
    differences: {},
    accuracy_score: 1.0
  };

  // Compare stage transition success
  if (prediction.expected_success !== undefined && outcome.success !== undefined) {
    const successMatch = prediction.expected_success === outcome.success;
    delta.fields_compared.push('success');
    delta.differences.success = {
      predicted: prediction.expected_success,
      actual: outcome.success,
      match: successMatch
    };
    if (!successMatch) {
      delta.accuracy_score *= 0.1; // 90% penalty for transition failure
    }
  }

  // Compare stage advancement
  if (prediction.from_stage && prediction.to_stage && outcome.new_stage) {
    const stageMatch = outcome.new_stage === prediction.to_stage;
    delta.fields_compared.push('stage');
    delta.differences.stage = {
      predicted_from: prediction.from_stage,
      predicted_to: prediction.to_stage,
      actual: outcome.new_stage,
      match: stageMatch
    };
    if (!stageMatch) {
      delta.accuracy_score *= 0.3; // 70% penalty for wrong stage
    }
  }

  // Compare action outcome
  if (prediction.action && outcome.action) {
    const actionMatch = prediction.action === outcome.action;
    delta.fields_compared.push('action');
    delta.differences.action = {
      predicted: prediction.action,
      actual: outcome.action,
      match: actionMatch
    };
    if (!actionMatch) {
      delta.accuracy_score *= 0.5; // 50% penalty for action mismatch
    }
  }

  return delta;
}

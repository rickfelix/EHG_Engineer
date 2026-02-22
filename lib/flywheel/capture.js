/**
 * Flywheel Data Capture — Fire-and-Forget EVA Interaction Logging
 *
 * SD: SD-LEO-FEAT-DATA-FLYWHEEL-001 (FR-002)
 *
 * Captures handoff gate events and other EVA interactions into the
 * eva_interactions table. All public APIs are exception-safe (no-throw)
 * and async fire-and-forget — capture NEVER blocks the handoff SLA.
 *
 * Follows the workflow-timer.js precedent for non-blocking persistence.
 */

import { createSupabaseServiceClient } from '../supabase-client.js';

const TABLE = 'eva_interactions';

const VALID_DECISION_TYPES = new Set([
  'gate_event', 'recommendation', 'directive_decision',
  'venture_stage_transition', 'kill_gate', 'resource_allocation',
  'priority_override', 'scope_change', 'risk_escalation'
]);

const VALID_INTERACTION_TYPES = new Set([
  'handoff_gate', 'quality_assessment', 'sd_creation',
  'pattern_detection', 'learning_decision'
]);

const VALID_CHAIRMAN_ACTIONS = new Set([
  'accepted', 'modified', 'rejected', 'deferred', 'escalated'
]);

/**
 * Capture an EVA interaction (fire-and-forget).
 *
 * @param {object} payload - Interaction data
 * @param {string} payload.decision_type - One of VALID_DECISION_TYPES
 * @param {string} payload.interaction_type - One of VALID_INTERACTION_TYPES
 * @param {string} [payload.chairman_action] - One of VALID_CHAIRMAN_ACTIONS
 * @param {number} [payload.gate_score] - 0-100
 * @param {number} [payload.confidence_score] - 0-100
 * @param {string} [payload.sd_id] - Strategic Directive UUID or sd_key
 * @param {string} [payload.venture_id] - Venture UUID
 * @param {string} [payload.session_id] - Claude session ID
 * @param {string} [payload.parent_interaction_id] - Parent interaction UUID
 * @param {object} [payload.context] - Context JSONB
 * @param {object} [payload.recommendation] - Recommendation JSONB
 * @param {object} [payload.outcome_details] - Outcome JSONB
 * @param {object} [payload.metadata] - Arbitrary metadata JSONB
 * @param {object} [payload.input_context] - ML training input
 * @param {object} [payload.output_decision] - ML training output
 * @returns {Promise<{success: boolean, id?: string, error?: string}>}
 */
export async function captureInteraction(payload) {
  try {
    const validation = validatePayload(payload);
    if (!validation.valid) {
      console.warn(`[flywheel] Invalid capture payload: ${validation.reason}`);
      return { success: false, error: validation.reason };
    }

    const supabase = createSupabaseServiceClient();
    const row = buildRow(payload);

    const { data, error } = await supabase
      .from(TABLE)
      .insert(row)
      .select('id')
      .single();

    if (error) {
      console.warn(`[flywheel] Capture failed: ${error.message}`);
      return { success: false, error: error.message };
    }

    return { success: true, id: data.id };
  } catch (err) {
    console.warn(`[flywheel] Capture exception: ${err.message}`);
    return { success: false, error: err.message };
  }
}

/**
 * Capture a handoff gate event — convenience wrapper for the most common case.
 *
 * @param {object} handoffResult - Result from HandoffOrchestrator.executeHandoff()
 * @param {string} handoffType - e.g., 'LEAD-TO-PLAN', 'PLAN-TO-EXEC'
 * @param {string} sdId - SD id or sd_key (will resolve sd_key to UUID if needed)
 * @param {string} [sessionId] - Claude session ID
 * @returns {Promise<{success: boolean, id?: string, error?: string}>}
 */
export async function captureHandoffGate(handoffResult, handoffType, sdId, sessionId) {
  const action = handoffResult.success ? 'accepted' : 'rejected';
  const score = handoffResult.gateResults?.compositeScore
    ?? handoffResult.compositeScore
    ?? null;

  // Resolve sd_key to UUID if sdId looks like an sd_key (starts with "SD-")
  let resolvedSdId = sdId;
  if (sdId && sdId.startsWith('SD-')) {
    try {
      const supabase = createSupabaseServiceClient();
      const { data } = await supabase
        .from('strategic_directives_v2')
        .select('id')
        .eq('sd_key', sdId)
        .single();
      if (data?.id) resolvedSdId = data.id;
    } catch {
      // Fall through with original sdId — capture will skip sd_id if FK fails
      resolvedSdId = null;
    }
  }

  return captureInteraction({
    decision_type: 'gate_event',
    interaction_type: 'handoff_gate',
    chairman_action: action,
    gate_score: score != null ? Math.round(score) : null,
    confidence_score: score != null ? Math.round(score) : null,
    sd_id: resolvedSdId,
    session_id: sessionId || null,
    context: {
      handoff_type: handoffType,
      success: handoffResult.success,
      gate_results: handoffResult.gateResults || {},
      phase_from: handoffType.split('-')[0],
      phase_to: handoffType.split('-').slice(-1)[0],
      original_sd_key: sdId
    },
    input_context: {
      handoff_type: handoffType,
      sd_id: sdId
    },
    output_decision: {
      action,
      score,
      success: handoffResult.success
    }
  });
}

/**
 * Validate a capture payload before sending to DB.
 */
function validatePayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return { valid: false, reason: 'Payload must be an object' };
  }
  if (!VALID_DECISION_TYPES.has(payload.decision_type)) {
    return { valid: false, reason: `Invalid decision_type: ${payload.decision_type}` };
  }
  if (!VALID_INTERACTION_TYPES.has(payload.interaction_type)) {
    return { valid: false, reason: `Invalid interaction_type: ${payload.interaction_type}` };
  }
  if (payload.chairman_action && !VALID_CHAIRMAN_ACTIONS.has(payload.chairman_action)) {
    return { valid: false, reason: `Invalid chairman_action: ${payload.chairman_action}` };
  }
  if (payload.gate_score != null && (payload.gate_score < 0 || payload.gate_score > 100)) {
    return { valid: false, reason: `gate_score out of range: ${payload.gate_score}` };
  }
  if (payload.confidence_score != null && (payload.confidence_score < 0 || payload.confidence_score > 100)) {
    return { valid: false, reason: `confidence_score out of range: ${payload.confidence_score}` };
  }
  return { valid: true };
}

/**
 * Build a clean row object from the payload.
 */
function buildRow(payload) {
  const row = {
    decision_type: payload.decision_type,
    interaction_type: payload.interaction_type
  };

  if (payload.chairman_action) row.chairman_action = payload.chairman_action;
  if (payload.gate_score != null) row.gate_score = payload.gate_score;
  if (payload.confidence_score != null) row.confidence_score = payload.confidence_score;
  if (payload.sd_id) row.sd_id = payload.sd_id;
  if (payload.venture_id) row.venture_id = payload.venture_id;
  if (payload.session_id) row.session_id = payload.session_id;
  if (payload.parent_interaction_id) row.parent_interaction_id = payload.parent_interaction_id;
  if (payload.context) row.context = payload.context;
  if (payload.recommendation) row.recommendation = payload.recommendation;
  if (payload.outcome_details) row.outcome_details = payload.outcome_details;
  if (payload.metadata) row.metadata = payload.metadata;
  if (payload.input_context) row.input_context = payload.input_context;
  if (payload.output_decision) row.output_decision = payload.output_decision;

  return row;
}

// Expose validation sets for testing
export const _testing = { VALID_DECISION_TYPES, VALID_INTERACTION_TYPES, VALID_CHAIRMAN_ACTIONS, validatePayload, buildRow };

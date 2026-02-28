/**
 * Chairman Escalation Routing (V02: chairman_governance_model)
 *
 * Routes DFE ESCALATE decisions to the chairman_decisions table
 * for governance oversight. Accepts a Supabase client via dependency
 * injection for testability.
 */

import { DECISIONS } from './decision-filter-engine.js';

/**
 * Decision types recognized by the chairman_decisions table.
 */
const DECISION_TYPES = {
  DFE_ESCALATION: 'dfe_escalation',
  GATE_REVIEW: 'gate_review',
  OVERRIDE_REQUEST: 'override_request',
};

/**
 * Escalation statuses.
 */
const ESCALATION_STATUS = {
  PENDING: 'pending',
  REVIEWED: 'reviewed',
  APPROVED: 'approved',
  REJECTED: 'rejected',
};

/**
 * Create an escalation record object from a DFE evaluation result.
 *
 * @param {Object} dfeResult - Result from DFE evaluate()
 * @param {Object} [context] - Additional context (sdId, gateType, etc.)
 * @returns {Object|null} Escalation record or null if not an ESCALATE decision
 */
function createEscalationRecord(dfeResult, context = {}) {
  if (!dfeResult || dfeResult.decision !== DECISIONS.ESCALATE) {
    return null;
  }

  return {
    decision_type: context.decisionType || DECISION_TYPES.DFE_ESCALATION,
    status: ESCALATION_STATUS.PENDING,
    blocking: context.blocking || false,
    priority: context.priority || 'medium',
    title: context.title || `DFE Escalation: confidence ${dfeResult.confidence}`,
    description: dfeResult.reasoning || `Decision requires chairman review (confidence: ${dfeResult.confidence})`,
    context: {
      confidence: dfeResult.confidence,
      gate_type: dfeResult.gateType || context.gateType || 'DEFAULT',
      sd_id: context.sdId || null,
      sd_key: context.sdKey || null,
      cost_evaluation: dfeResult.costEvaluation || null,
      source: 'decision-filter-engine',
      escalated_at: new Date().toISOString(),
    },
  };
}

/**
 * Route a DFE ESCALATE decision to the chairman_decisions table.
 *
 * @param {Object} dfeResult - Result from DFE evaluate()
 * @param {Object} supabase - Supabase client (dependency injection)
 * @param {Object} [context] - Additional context
 * @returns {Promise<Object|null>} Inserted record or null if not applicable
 */
async function routeEscalation(dfeResult, supabase, context = {}) {
  const record = createEscalationRecord(dfeResult, context);
  if (!record) {
    return null;
  }

  if (!supabase) {
    throw new Error('Supabase client required for chairman escalation routing');
  }

  const { data, error } = await supabase
    .from('chairman_decisions')
    .insert(record)
    .select('id, decision_type, status, blocking')
    .single();

  if (error) {
    throw new Error(`Chairman escalation insert failed: ${error.message}`);
  }

  return data;
}

/**
 * Check if a DFE result requires chairman escalation.
 *
 * @param {Object} dfeResult - Result from DFE evaluate()
 * @returns {boolean}
 */
function requiresEscalation(dfeResult) {
  return dfeResult && dfeResult.decision === DECISIONS.ESCALATE;
}

/**
 * Integration helper for handoff gate validators.
 * Evaluates via DFE and routes escalations to chairman if needed.
 *
 * @param {Object} params - { confidence, gateType, sdId, sdKey, context }
 * @param {Function} dfeEvaluate - DFE evaluate function
 * @param {Object} [supabase] - Supabase client (optional - skips DB insert if null)
 * @returns {Promise<Object>} { dfeResult, escalation }
 */
async function evaluateAndEscalate(params, dfeEvaluate, supabase = null) {
  const dfeResult = dfeEvaluate({
    confidence: params.confidence,
    gateType: params.gateType,
    context: params.context,
  });

  let escalation = null;
  if (requiresEscalation(dfeResult) && supabase) {
    escalation = await routeEscalation(dfeResult, supabase, {
      sdId: params.sdId,
      sdKey: params.sdKey,
      gateType: params.gateType,
    });
  }

  return { dfeResult, escalation };
}

export {
  routeEscalation,
  createEscalationRecord,
  requiresEscalation,
  evaluateAndEscalate,
  DECISION_TYPES,
  ESCALATION_STATUS,
};

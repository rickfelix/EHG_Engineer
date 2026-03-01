/**
 * DFE Adapter Layer
 * SD-MAN-GEN-CORRECTIVE-VISION-GAP-012 (V04: governance_enforcement_consistency)
 *
 * Single entry point for DFE escalation evaluation that routes to
 * the appropriate implementation based on context:
 *   - Handoff contexts → dfe-escalation-gate.js (gate-based)
 *   - EVA service contexts → unified-escalation-router.js (standalone)
 *
 * Both paths log to governance_audit_log and eva_event_log.
 *
 * @module lib/governance/dfe-adapter
 */

import { evaluate } from './decision-filter-engine.js';
import {
  evaluateAndEscalate,
  requiresEscalation,
} from './chairman-escalation.js';
import { routeEscalation, ESCALATION_TYPES } from '../eva/unified-escalation-router.js';

/**
 * Evaluate a DFE escalation through the appropriate implementation.
 *
 * @param {Object} supabase - Supabase client
 * @param {Object} context - Evaluation context
 * @param {string} context.source - 'handoff' | 'eva_service' | 'manual'
 * @param {number} context.confidence - Confidence score 0-1
 * @param {string} [context.sdId] - SD UUID or key
 * @param {string} [context.sdKey] - SD human-readable key
 * @param {string} [context.ventureId] - Venture UUID (for EVA contexts)
 * @param {string} [context.gateType] - Gate type for handoff contexts
 * @param {string} [context.handoffType] - Handoff type (e.g., 'plan-to-exec')
 * @param {string} [context.type] - Escalation sub-type for EVA contexts
 * @param {Object} [context.metadata] - Additional metadata for audit trail
 * @returns {Promise<{decision: string, escalated: boolean, escalationId: string|null, details: Object}>}
 */
export async function evaluateEscalation(supabase, context) {
  if (!supabase) {
    throw new Error('dfe-adapter: supabase client is required');
  }
  if (!context || !context.source) {
    throw new Error('dfe-adapter: context.source is required (handoff | eva_service | manual)');
  }

  const source = context.source;

  if (source === 'handoff') {
    return _evaluateViaGate(supabase, context);
  }

  if (source === 'eva_service' || source === 'manual') {
    return _evaluateViaRouter(supabase, context);
  }

  throw new Error(`dfe-adapter: unknown source '${source}'. Expected: handoff, eva_service, manual`);
}

/**
 * Route through the gate-based DFE (handoff contexts).
 * Uses evaluateAndEscalate() from chairman-escalation.js.
 */
async function _evaluateViaGate(supabase, context) {
  const confidence = context.confidence ?? 0.85;
  const sdId = context.sdId || context.sdKey;

  const { dfeResult, escalation } = await evaluateAndEscalate(
    {
      confidence,
      gateType: context.gateType || 'PHASE_GATE',
      sdId,
      sdKey: context.sdKey,
      context: {
        source: context.handoffType || 'dfe-adapter',
        ...(context.metadata || {}),
      },
    },
    evaluate,
    supabase,
  );

  const escalated = requiresEscalation(dfeResult);

  return {
    decision: dfeResult.decision,
    escalated,
    escalationId: escalation?.id || null,
    details: {
      path: 'gate',
      confidence,
      reasoning: dfeResult.reasoning,
      costEvaluation: dfeResult.costEvaluation || null,
    },
  };
}

/**
 * Route through the unified escalation router (EVA service contexts).
 * Uses routeEscalation() from unified-escalation-router.js.
 */
async function _evaluateViaRouter(supabase, context) {
  const result = await routeEscalation(supabase, {
    type: _mapTypeToEscalationType(context.type),
    ventureId: context.ventureId || null,
    sdId: context.sdId || context.sdKey || null,
    reason: context.reason || `DFE adapter evaluation (confidence: ${context.confidence})`,
    source: `dfe-adapter:${context.source}`,
    dfeResult: context.dfeResult || null,
    gateContext: context.gateContext || null,
  });

  return {
    decision: result.action === 'log_and_continue' ? 'PROCEED' : 'ESCALATE',
    escalated: result.requiresChairman,
    escalationId: result.eventId,
    details: {
      path: 'router',
      severity: result.severity,
      severityLabel: result.severityLabel,
      action: result.action,
    },
  };
}

/**
 * Map adapter context type to ESCALATION_TYPES.
 */
function _mapTypeToEscalationType(type) {
  switch (type) {
    case 'cost_override':
    case 'dfe_severity':
      return ESCALATION_TYPES.DFE_SEVERITY;
    case 'timeout':
      return ESCALATION_TYPES.CHAIRMAN_TIMEOUT;
    case 'gate_failure':
      return ESCALATION_TYPES.GATE_FAILURE;
    case 'manual':
      return ESCALATION_TYPES.MANUAL_OVERRIDE;
    default:
      return ESCALATION_TYPES.DFE_SEVERITY;
  }
}

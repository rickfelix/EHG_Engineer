/**
 * Unified Escalation Router
 * SD-MAN-INFRA-CORRECTIVE-ARCHITECTURE-GAP-025
 *
 * Consolidates escalation logic from DFE (decision-filter-engine.js),
 * chairman-escalation (escalation-event-persister.js), and
 * chairman-decision-timeout.js into a single routing module.
 *
 * All escalation types — L1/L2/L3 severity from DFE, chairman timeout
 * escalations, and gate-failure escalations — route through one consistent,
 * auditable entry point.
 *
 * Design principles:
 *   - Stateless: all state in database
 *   - Backward-compatible: existing callers can continue using original modules
 *   - All decisions logged to eva_event_log
 *   - Constructor injection for Supabase client
 *
 * @module lib/eva/unified-escalation-router
 */

import { ServiceError } from './shared-services.js';

export const MODULE_VERSION = '1.0.0';

/**
 * Escalation types supported by the unified router.
 */
export const ESCALATION_TYPES = {
  DFE_SEVERITY: 'DFE_SEVERITY',
  CHAIRMAN_TIMEOUT: 'CHAIRMAN_TIMEOUT',
  GATE_FAILURE: 'GATE_FAILURE',
  MANUAL_OVERRIDE: 'MANUAL_OVERRIDE',
};

/**
 * Severity levels with their routing behavior.
 */
const SEVERITY_CONFIG = {
  L1: { label: 'Low', action: 'log_and_continue', requiresChairman: false },
  L2: { label: 'Medium', action: 'escalate_notify', requiresChairman: true },
  L3: { label: 'Critical', action: 'escalate_block', requiresChairman: true },
};

/**
 * Route an escalation through the unified router.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {object} params
 * @param {string} params.type - Escalation type (from ESCALATION_TYPES)
 * @param {string} params.ventureId - Venture UUID
 * @param {string} [params.severity] - L1/L2/L3 (required for DFE_SEVERITY)
 * @param {object} [params.dfeResult] - DFE evaluation result (for DFE_SEVERITY type)
 * @param {object} [params.timeoutContext] - Timeout context (for CHAIRMAN_TIMEOUT type)
 * @param {object} [params.gateContext] - Gate failure context (for GATE_FAILURE type)
 * @param {string} [params.reason] - Human-readable reason for escalation
 * @param {string} [params.sdId] - SD key for context
 * @param {string} [params.source] - Calling module identifier
 * @returns {Promise<{action: string, eventId: string, requiresChairman: boolean, severity: string}>}
 */
export async function routeEscalation(supabase, {
  type,
  ventureId,
  severity = null,
  dfeResult = null,
  timeoutContext = null,
  gateContext = null,
  reason = '',
  sdId = null,
  source = 'unknown',
}) {
  if (!supabase) throw new ServiceError('INVALID_ARGS', 'supabase client is required', 'UnifiedEscalationRouter');
  if (!type) throw new ServiceError('INVALID_ARGS', 'escalation type is required', 'UnifiedEscalationRouter');
  if (!ESCALATION_TYPES[type]) throw new ServiceError('INVALID_TYPE', `Unknown escalation type: ${type}. Valid: ${Object.keys(ESCALATION_TYPES).join(', ')}`, 'UnifiedEscalationRouter');

  // Determine severity based on escalation type
  const resolvedSeverity = resolveSeverity(type, { severity, dfeResult, timeoutContext, gateContext });
  const config = SEVERITY_CONFIG[resolvedSeverity];

  // Log the routing decision
  const eventId = await logEscalationEvent(supabase, {
    type,
    ventureId,
    severity: resolvedSeverity,
    action: config.action,
    requiresChairman: config.requiresChairman,
    reason,
    sdId,
    source,
    context: buildContext(type, { dfeResult, timeoutContext, gateContext }),
  });

  // If chairman decision needed, create the chairman_decisions entry
  if (config.requiresChairman && ventureId) {
    await createChairmanDecision(supabase, {
      ventureId,
      type,
      severity: resolvedSeverity,
      reason,
      sdId,
      eventId,
    });
  }

  return {
    action: config.action,
    eventId,
    requiresChairman: config.requiresChairman,
    severity: resolvedSeverity,
    severityLabel: config.label,
  };
}

/**
 * Resolve the severity level based on escalation type and context.
 */
function resolveSeverity(type, { severity, dfeResult, timeoutContext, gateContext }) {
  switch (type) {
    case ESCALATION_TYPES.DFE_SEVERITY:
      if (severity && SEVERITY_CONFIG[severity]) return severity;
      if (dfeResult?.escalation_level) return dfeResult.escalation_level;
      return 'L1';

    case ESCALATION_TYPES.CHAIRMAN_TIMEOUT:
      // Timeouts are at least L2 (always need chairman attention)
      if (timeoutContext?.decision_type === 'budget_review') return 'L3';
      if (timeoutContext?.decision_type === 'gate_decision') return 'L2';
      return 'L2';

    case ESCALATION_TYPES.GATE_FAILURE:
      if (gateContext?.blocking) return 'L3';
      return 'L2';

    case ESCALATION_TYPES.MANUAL_OVERRIDE:
      return severity || 'L2';

    default:
      return 'L1';
  }
}

/**
 * Build context metadata for the event log.
 */
function buildContext(type, { dfeResult, timeoutContext, gateContext }) {
  switch (type) {
    case ESCALATION_TYPES.DFE_SEVERITY:
      return dfeResult ? {
        triggers: dfeResult.triggers?.map(t => t.type) || [],
        severity_score: dfeResult.severity_score,
        recommendation: dfeResult.recommendation,
      } : {};

    case ESCALATION_TYPES.CHAIRMAN_TIMEOUT:
      return timeoutContext ? {
        decision_type: timeoutContext.decision_type,
        timeout_ms: timeoutContext.timeout_ms,
        decision_id: timeoutContext.decision_id,
      } : {};

    case ESCALATION_TYPES.GATE_FAILURE:
      return gateContext ? {
        gate_name: gateContext.gate_name,
        gate_score: gateContext.score,
        blocking: gateContext.blocking,
      } : {};

    default:
      return {};
  }
}

/**
 * Log an escalation routing decision to eva_event_log.
 */
async function logEscalationEvent(supabase, { type, ventureId, severity, action, requiresChairman, reason, sdId, source, context }) {
  const { data, error } = await supabase
    .from('eva_event_log')
    .insert({
      venture_id: ventureId,
      event_type: 'ESCALATION_ROUTED',
      severity: severity === 'L3' ? 'critical' : severity === 'L2' ? 'warning' : 'info',
      metadata: {
        escalation_type: type,
        severity_level: severity,
        action,
        requires_chairman: requiresChairman,
        reason,
        sd_id: sdId,
        source,
        context,
        module_version: MODULE_VERSION,
      },
    })
    .select('id')
    .single();

  if (error) {
    throw new ServiceError('LOG_FAILED', `Failed to log escalation event: ${error.message}`, 'UnifiedEscalationRouter', error);
  }

  return data.id;
}

/**
 * Create a chairman decision entry for escalations that require chairman review.
 */
async function createChairmanDecision(supabase, { ventureId, type, severity, reason, sdId, eventId }) {
  const { error } = await supabase
    .from('chairman_decisions')
    .insert({
      venture_id: ventureId,
      decision_type: type === ESCALATION_TYPES.CHAIRMAN_TIMEOUT ? 'timeout_escalation' : 'escalation_review',
      status: 'pending',
      context: {
        escalation_type: type,
        severity,
        reason,
        sd_id: sdId,
        source_event_id: eventId,
      },
    });

  if (error) {
    // Non-fatal: log but don't throw (escalation routing should still succeed)
    console.warn(`[UnifiedEscalationRouter] Failed to create chairman decision: ${error.message}`);
  }
}

/**
 * Get escalation history for a venture.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} ventureId
 * @param {object} [options]
 * @param {number} [options.limit=20]
 * @param {string} [options.severity] - Filter by severity level
 * @param {string} [options.type] - Filter by escalation type
 * @returns {Promise<Array>}
 */
export async function getEscalationHistory(supabase, ventureId, { limit = 20, severity = null, type = null } = {}) {
  let query = supabase
    .from('eva_event_log')
    .select('id, venture_id, event_type, severity, metadata, created_at')
    .eq('venture_id', ventureId)
    .eq('event_type', 'ESCALATION_ROUTED')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (severity) {
    query = query.eq('metadata->>severity_level', severity);
  }
  if (type) {
    query = query.eq('metadata->>escalation_type', type);
  }

  const { data, error } = await query;

  if (error) {
    throw new ServiceError('QUERY_FAILED', `Failed to query escalation history: ${error.message}`, 'UnifiedEscalationRouter', error);
  }

  return data || [];
}

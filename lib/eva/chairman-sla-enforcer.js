/**
 * Chairman SLA Enforcer — Unified Decision Timing & Escalation
 * SD: SD-MAN-ORCH-VISION-HEAL-SCORE-93-002-02-A
 *
 * Consolidates SLA enforcement from chairman-decision-timeout.js into a
 * unified module that writes all escalation events to eva_orchestration_events
 * (single audit trail, not split across tables).
 *
 * @module lib/eva/chairman-sla-enforcer
 */

import { randomUUID } from 'crypto';

// Default SLA matrix (configurable via constructor)
export const DEFAULT_SLA_MATRIX = Object.freeze({
  gate_decision: 4 * 60 * 60 * 1000,      // 4 hours
  guardrail_override: 8 * 60 * 60 * 1000,  // 8 hours
  cascade_override: 8 * 60 * 60 * 1000,    // 8 hours
  advisory: 24 * 60 * 60 * 1000,           // 24 hours
  override: 12 * 60 * 60 * 1000,           // 12 hours
  budget_review: 2 * 60 * 60 * 1000,       // 2 hours
});

const DEFAULT_FALLBACK_SLA_MS = 24 * 60 * 60 * 1000;

/**
 * Check pending decisions against their SLA and escalate overdue ones.
 *
 * @param {Object} supabase - Supabase client
 * @param {Object} [options]
 * @param {Object} [options.slaMatrix] - Custom SLA matrix (overrides defaults)
 * @param {Object} [options.logger] - Logger instance
 * @returns {Promise<{ checked: number, escalated: number, skipped: number, errors: string[] }>}
 */
export async function enforceDecisionSLAs(supabase, options = {}) {
  const { slaMatrix = DEFAULT_SLA_MATRIX, logger = console } = options;
  const result = { checked: 0, escalated: 0, skipped: 0, errors: [] };

  if (!supabase) {
    result.errors.push('No supabase client');
    return result;
  }

  try {
    const { data: pendingDecisions, error } = await supabase
      .from('chairman_decisions')
      .select('id, decision_type, created_at, blocking, venture_id, metadata')
      .eq('status', 'pending');

    if (error) {
      result.errors.push(`Query failed: ${error.message}`);
      return result;
    }

    if (!pendingDecisions || pendingDecisions.length === 0) {
      return result;
    }

    const now = Date.now();

    for (const decision of pendingDecisions) {
      result.checked++;

      // Blocking decisions are exempt — Chairman has absolute authority
      if (decision.blocking) {
        result.skipped++;
        continue;
      }

      // Already escalated?
      if (decision.metadata?.escalation) {
        result.skipped++;
        continue;
      }

      const slaMs = slaMatrix[decision.decision_type] || DEFAULT_FALLBACK_SLA_MS;
      const ageMs = now - new Date(decision.created_at).getTime();

      if (ageMs < slaMs) {
        continue; // Not yet overdue
      }

      // Escalate
      const escalation = await escalateDecision(supabase, decision, {
        slaMs,
        ageMs,
        logger,
      });

      if (escalation.escalated) {
        result.escalated++;
      } else {
        result.errors.push(`Escalation failed for ${decision.id}: ${escalation.error}`);
      }
    }

    return result;
  } catch (err) {
    result.errors.push(`Enforcement error: ${err.message}`);
    return result;
  }
}

/**
 * Escalate a single overdue decision.
 * Writes to eva_orchestration_events (unified audit trail).
 *
 * @param {Object} supabase - Supabase client
 * @param {Object} decision - Decision record
 * @param {Object} context - Escalation context
 * @param {number} context.slaMs - SLA threshold in ms
 * @param {number} context.ageMs - Current age in ms
 * @param {Object} [context.logger] - Logger instance
 * @returns {Promise<{ escalated: boolean, error?: string }>}
 */
export async function escalateDecision(supabase, decision, context = {}) {
  const { slaMs, ageMs, logger = console } = context;

  const escalationRecord = {
    escalated_at: new Date().toISOString(),
    age_hours: Math.round((ageMs / 3600000) * 10) / 10,
    sla_hours: Math.round((slaMs / 3600000) * 10) / 10,
    strategy: 'escalate_notify',
  };

  try {
    // Update decision metadata with escalation flag
    const { error: updateError } = await supabase
      .from('chairman_decisions')
      .update({
        metadata: {
          ...(decision.metadata || {}),
          escalation: escalationRecord,
          requires_urgent_review: true,
        },
      })
      .eq('id', decision.id);

    if (updateError) {
      logger.warn(`[SLAEnforcer] Failed to flag decision ${decision.id}: ${updateError.message}`);
    }

    // Write unified audit event to eva_orchestration_events
    const { error: auditError } = await supabase
      .from('eva_orchestration_events')
      .insert({
        event_id: randomUUID(),
        event_type: 'chairman_sla_escalation',
        event_source: 'chairman_sla_enforcer',
        venture_id: decision.venture_id || null,
        event_data: {
          decision_id: decision.id,
          decision_type: decision.decision_type,
          sla_ms: slaMs,
          age_hours: escalationRecord.age_hours,
          strategy: escalationRecord.strategy,
          escalated_at: escalationRecord.escalated_at,
        },
        chairman_flagged: true,
        created_at: new Date().toISOString(),
      });

    if (auditError) {
      logger.warn(`[SLAEnforcer] Audit write failed: ${auditError.message}`);
      return { escalated: true, warning: 'Decision flagged but audit write failed' };
    }

    return { escalated: true };
  } catch (err) {
    logger.warn(`[SLAEnforcer] Escalation error: ${err.message}`);
    return { escalated: false, error: err.message };
  }
}

/**
 * Get SLA status for a specific decision.
 *
 * @param {Object} decision - Decision record with decision_type and created_at
 * @param {Object} [slaMatrix] - Custom SLA matrix
 * @returns {{ overdue: boolean, remainingMs: number, slaMs: number, ageMs: number }}
 */
export function getDecisionSLAStatus(decision, slaMatrix = DEFAULT_SLA_MATRIX) {
  const slaMs = slaMatrix[decision.decision_type] || DEFAULT_FALLBACK_SLA_MS;
  const ageMs = Date.now() - new Date(decision.created_at).getTime();

  return {
    overdue: ageMs >= slaMs,
    remainingMs: Math.max(0, slaMs - ageMs),
    slaMs,
    ageMs,
  };
}

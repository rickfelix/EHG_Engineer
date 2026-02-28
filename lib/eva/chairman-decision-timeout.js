/**
 * Chairman Decision Timeout Manager
 *
 * Monitors pending decisions and escalates after a configurable
 * timeout threshold. Escalation NEVER auto-approves — it only
 * flags decisions for urgent Chairman review. Blocking decisions
 * are exempt from timeout processing entirely.
 *
 * Chairman has absolute authority: no system process may approve,
 * acknowledge, or override a decision on the Chairman's behalf.
 *
 * Part of SD-MAN-ORCH-EVA-CODEBASE-PLUS-001-I
 * Modified by SD-MAN-ORCH-VISION-HEAL-GOVERNANCE-001-01
 */

import { createClient } from '@supabase/supabase-js';

const DEFAULT_TIMEOUT_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Configurable SLA per decision type (in milliseconds).
 * Chairman decisions have different urgency levels.
 * Part of SD-MAN-ORCH-VISION-HEAL-SCORE-93-001-02-A
 */
const DECISION_TYPE_SLA = {
  gate_decision: 4 * 60 * 60 * 1000,       // 4 hours — gates block SD progress
  guardrail_override: 8 * 60 * 60 * 1000,  // 8 hours — guardrail violations
  cascade_override: 8 * 60 * 60 * 1000,    // 8 hours — cascade violations
  advisory: 24 * 60 * 60 * 1000,           // 24 hours — informational
  override: 12 * 60 * 60 * 1000,           // 12 hours — manual override requests
  budget_review: 2 * 60 * 60 * 1000,       // 2 hours — budget decisions are urgent
};

// Escalation strategies — NONE of these auto-approve or auto-resolve.
// They only flag the decision for urgent Chairman attention.
const ESCALATION_STRATEGIES = {
  gate_decision: 'escalate_notify',
  advisory: 'escalate_notify',
  override: 'escalate_notify',
  guardrail_override: 'escalate_notify',
  cascade_override: 'escalate_notify',
  budget_review: 'escalate_notify',
};

/**
 * Check for timed-out decisions and escalate them.
 * Blocking decisions are never processed — Chairman has absolute authority.
 *
 * @param {Object} options
 * @param {Object} [options.supabase] - Supabase client (auto-created if not provided)
 * @param {Object} [options.logger] - Logger instance
 * @param {number} [options.timeoutMs] - Timeout threshold in ms (default: 24h)
 * @param {boolean} [options.dryRun] - If true, report but don't escalate
 * @returns {Promise<{checked: number, escalated: Array, skippedBlocking: Array, errors: Array}>}
 */
export async function checkAndEscalateTimeouts({
  supabase: supabaseClient,
  logger = console,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  dryRun = false,
} = {}) {
  const supabase = supabaseClient || createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Use per-type SLA: find ALL pending decisions, then filter by type-specific timeout
  const { data: allPending, error } = await supabase
    .from('chairman_decisions')
    .select('id, venture_id, lifecycle_stage, status, decision_type, summary, created_at, blocking, metadata')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  // Filter by per-type SLA timeout
  const now = Date.now();
  const timedOut = (allPending || []).filter(d => {
    const typeSla = DECISION_TYPE_SLA[d.decision_type] || timeoutMs;
    const age = now - new Date(d.created_at).getTime();
    return age > typeSla;
  });

  if (error) {
    logger.error(`Timeout check failed: ${error.message}`);
    return { checked: 0, escalated: [], skippedBlocking: [], errors: [error.message] };
  }

  if (!timedOut || timedOut.length === 0) {
    logger.log('No timed-out decisions found');
    return { checked: 0, escalated: [], skippedBlocking: [], errors: [] };
  }

  logger.log(`Found ${timedOut.length} timed-out decision(s)`);
  const escalated = [];
  const skippedBlocking = [];
  const errors = [];

  for (const decision of timedOut) {
    const ageMs = Date.now() - new Date(decision.created_at).getTime();
    const ageHours = Math.round(ageMs / 3600000);

    // Blocking decisions are NEVER auto-processed — Chairman absolute authority
    if (decision.blocking) {
      logger.log(`  Decision ${decision.id.slice(0, 8)}: BLOCKING — skipped (Chairman absolute authority)`);
      skippedBlocking.push({
        decisionId: decision.id,
        ageHours,
        reason: 'blocking_decision_exempt',
      });
      continue;
    }

    const strategy = ESCALATION_STRATEGIES[decision.decision_type] || 'escalate_notify';
    logger.log(`  Decision ${decision.id.slice(0, 8)}: stage ${decision.lifecycle_stage}, age ${ageHours}h → ${strategy}`);

    if (dryRun) {
      escalated.push({
        decisionId: decision.id,
        strategy,
        ageHours,
        wouldEscalate: true,
      });
      continue;
    }

    try {
      const result = await applyEscalation(supabase, decision, strategy);
      escalated.push({
        decisionId: decision.id,
        strategy,
        ageHours,
        result,
      });
    } catch (err) {
      logger.error(`  Escalation failed for ${decision.id}: ${err.message}`);
      errors.push({ decisionId: decision.id, error: err.message });
    }
  }

  return { checked: timedOut.length, escalated, skippedBlocking, errors };
}

/**
 * Apply escalation strategy to a timed-out decision.
 * Decisions remain in 'pending' status — only metadata is updated
 * to flag them for urgent Chairman review. No auto-approval occurs.
 *
 * @param {Object} supabase - Supabase client
 * @param {Object} decision - The timed-out decision
 * @param {string} strategy - Escalation strategy name
 * @returns {Promise<Object>} Escalation result
 */
async function applyEscalation(supabase, decision, strategy) {
  // All strategies now use the same escalation-only approach:
  // Flag the decision as needing urgent attention, but do NOT change
  // its status from 'pending'. Only the Chairman can approve/reject.
  const escalationRecord = {
    type: 'timeout',
    strategy,
    escalated_at: new Date().toISOString(),
    original_created_at: decision.created_at,
    age_hours: Math.round((Date.now() - new Date(decision.created_at).getTime()) / 3600000),
    urgency: 'high',
  };

  const { error } = await supabase
    .from('chairman_decisions')
    .update({
      // Status remains 'pending' — Chairman must still decide
      metadata: {
        ...(decision.metadata || {}),
        escalation: escalationRecord,
        requires_urgent_review: true,
      },
    })
    .eq('id', decision.id);

  if (error) throw new Error(error.message);

  // Persist to escalation ledger for audit trail
  await supabase.from('orchestration_events').insert({
    event_type: 'chairman_sla_escalation',
    sd_id: decision.venture_id || null,
    payload: {
      decision_id: decision.id,
      decision_type: decision.decision_type,
      sla_ms: DECISION_TYPE_SLA[decision.decision_type] || DEFAULT_TIMEOUT_MS,
      age_hours: escalationRecord.age_hours,
      strategy,
      escalated_at: escalationRecord.escalated_at,
    },
  }).then(() => {}).catch(() => {}); // Non-blocking audit

  return { action: 'escalated_for_review', autoApproved: false };
}

function _formatAge(dateStr) {
  const ms = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(ms / 3600000);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h`;
  return `${hours}h`;
}

/**
 * Get the timeout configuration for a specific decision type.
 *
 * @param {string} decisionType - The decision type
 * @param {Object} [overrides] - Custom timeout overrides
 * @returns {{timeoutMs: number, strategy: string}}
 */
export function getTimeoutConfig(decisionType, overrides = {}) {
  const strategy = ESCALATION_STRATEGIES[decisionType] || 'escalate_notify';
  const timeoutMs = overrides[decisionType] || DECISION_TYPE_SLA[decisionType] || DEFAULT_TIMEOUT_MS;
  return { timeoutMs, strategy };
}

export { DECISION_TYPE_SLA };

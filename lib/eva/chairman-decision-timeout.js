/**
 * Chairman Decision Timeout Manager
 *
 * Monitors pending decisions and auto-escalates after a configurable
 * timeout threshold. Escalation creates a new decision at the next
 * authority level or auto-approves based on the decision type.
 *
 * Part of SD-MAN-ORCH-EVA-CODEBASE-PLUS-001-I
 */

import { createClient } from '@supabase/supabase-js';

const DEFAULT_TIMEOUT_MS = 24 * 60 * 60 * 1000; // 24 hours
const ESCALATION_STRATEGIES = {
  gate_decision: 'auto_approve_with_flag',
  advisory: 'auto_acknowledge',
  override: 'revert_to_system',
};

/**
 * Check for timed-out decisions and escalate them.
 *
 * @param {Object} options
 * @param {Object} [options.supabase] - Supabase client (auto-created if not provided)
 * @param {Object} [options.logger] - Logger instance
 * @param {number} [options.timeoutMs] - Timeout threshold in ms (default: 24h)
 * @param {boolean} [options.dryRun] - If true, report but don't escalate
 * @returns {Promise<{checked: number, escalated: Array, errors: Array}>}
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

  const cutoff = new Date(Date.now() - timeoutMs).toISOString();

  // Find pending decisions older than the timeout
  const { data: timedOut, error } = await supabase
    .from('chairman_decisions')
    .select('id, venture_id, lifecycle_stage, status, decision_type, summary, created_at, blocking')
    .eq('status', 'pending')
    .lt('created_at', cutoff)
    .order('created_at', { ascending: true });

  if (error) {
    logger.error(`Timeout check failed: ${error.message}`);
    return { checked: 0, escalated: [], errors: [error.message] };
  }

  if (!timedOut || timedOut.length === 0) {
    logger.log('No timed-out decisions found');
    return { checked: 0, escalated: [], errors: [] };
  }

  logger.log(`Found ${timedOut.length} timed-out decision(s)`);
  const escalated = [];
  const errors = [];

  for (const decision of timedOut) {
    const strategy = ESCALATION_STRATEGIES[decision.decision_type] || 'auto_approve_with_flag';
    const ageMs = Date.now() - new Date(decision.created_at).getTime();
    const ageHours = Math.round(ageMs / 3600000);

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

  return { checked: timedOut.length, escalated, errors };
}

/**
 * Apply escalation strategy to a timed-out decision.
 *
 * @param {Object} supabase - Supabase client
 * @param {Object} decision - The timed-out decision
 * @param {string} strategy - Escalation strategy name
 * @returns {Promise<Object>} Escalation result
 */
async function applyEscalation(supabase, decision, strategy) {
  switch (strategy) {
    case 'auto_approve_with_flag': {
      const { error } = await supabase
        .from('chairman_decisions')
        .update({
          status: 'approved',
          decision: 'auto_escalated',
          rationale: `Auto-escalated: decision timed out after ${formatAge(decision.created_at)}. Requires chairman review.`,
          resolved_at: new Date().toISOString(),
          metadata: {
            ...(decision.metadata || {}),
            escalation: {
              type: 'timeout',
              strategy,
              escalated_at: new Date().toISOString(),
              original_created_at: decision.created_at,
            },
          },
        })
        .eq('id', decision.id);

      if (error) throw new Error(error.message);
      return { action: 'auto_approved', flagged: true };
    }

    case 'auto_acknowledge': {
      const { error } = await supabase
        .from('chairman_decisions')
        .update({
          status: 'info',
          decision: 'auto_acknowledged',
          rationale: `Advisory auto-acknowledged after timeout of ${formatAge(decision.created_at)}.`,
          resolved_at: new Date().toISOString(),
        })
        .eq('id', decision.id);

      if (error) throw new Error(error.message);
      return { action: 'auto_acknowledged' };
    }

    case 'revert_to_system': {
      const { error } = await supabase
        .from('chairman_decisions')
        .update({
          status: 'approved',
          decision: 'system_default',
          rationale: `Override timed out after ${formatAge(decision.created_at)}. Reverted to system recommendation.`,
          resolved_at: new Date().toISOString(),
        })
        .eq('id', decision.id);

      if (error) throw new Error(error.message);
      return { action: 'reverted_to_system' };
    }

    default:
      throw new Error(`Unknown escalation strategy: ${strategy}`);
  }
}

function formatAge(dateStr) {
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
  const strategy = ESCALATION_STRATEGIES[decisionType] || 'auto_approve_with_flag';
  const timeoutMs = overrides[decisionType] || DEFAULT_TIMEOUT_MS;
  return { timeoutMs, strategy };
}

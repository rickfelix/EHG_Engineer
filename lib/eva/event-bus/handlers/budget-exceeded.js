/**
 * Handler: budget.exceeded
 * SD: SD-MAN-ORCH-VISION-GOVERNANCE-ENFORCEMENT-001-C
 *
 * When a venture exceeds its budget threshold, escalate to
 * chairman decision queue. In enforcement mode, also blocks
 * further execution until chairman acknowledges.
 */

import { getComputePosture } from '../../../governance/compute-posture.js';

/**
 * Handle a budget.exceeded event.
 * @param {object} payload - { ventureId, currentBudget, threshold, overage, sdKey }
 * @param {object} context - { supabase, ventureId }
 * @returns {Promise<{ outcome: string, blocked: boolean }>}
 */
export async function handleBudgetExceeded(payload, context) {
  const { supabase } = context;
  const { ventureId, currentBudget, threshold, overage, sdKey } = payload;

  if (!ventureId) {
    const err = new Error('ventureId is required');
    err.retryable = false;
    throw err;
  }

  const posture = getComputePosture();
  const enforcing = posture.blockOnExceed;

  // Log to audit trail
  await supabase.from('eva_audit_log').insert({
    venture_id: ventureId,
    action_type: 'budget_exceeded',
    details: {
      current_budget: currentBudget,
      threshold,
      overage,
      escalated: true,
      enforcement_mode: enforcing,
      sd_key: sdKey || null,
    },
    actor: 'event_bus',
  });

  // Add to chairman decision queue
  try {
    await supabase.from('chairman_decisions').insert({
      venture_id: ventureId,
      decision_type: 'budget_override',
      blocking: enforcing,
      context: {
        current_budget: currentBudget,
        threshold,
        overage,
        source: 'event_bus',
        enforcement_mode: enforcing,
        sd_key: sdKey || null,
      },
      status: 'pending',
    });
  } catch {
    // chairman_decisions table may not exist — non-fatal
  }

  // In enforcement mode, log the blocking event to governance audit
  if (enforcing) {
    try {
      await supabase.from('governance_audit_log').insert({
        event_type: 'compute_budget_blocked',
        severity: 'high',
        gate_name: 'BUDGET_EXCEEDED_HANDLER',
        sd_key: sdKey || null,
        details: {
          venture_id: ventureId,
          current_budget: currentBudget,
          threshold,
          overage,
          blocked_at: new Date().toISOString(),
        },
      });
    } catch {
      // governance_audit_log write failure is non-fatal
    }
  }

  return {
    outcome: enforcing ? 'budget_blocked' : 'budget_escalated',
    blocked: enforcing,
    ventureId,
    overage,
  };
}

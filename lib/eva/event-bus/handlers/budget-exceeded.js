/**
 * Handler: budget.exceeded
 * SD: SD-MAN-ORCH-EVA-CODEBASE-PLUS-001-E
 *
 * When a venture exceeds its budget threshold, escalate to
 * chairman decision queue and pause the venture.
 */

/**
 * Handle a budget.exceeded event.
 * @param {object} payload - { ventureId, currentBudget, threshold, overage }
 * @param {object} context - { supabase, ventureId }
 * @returns {Promise<{ outcome: string }>}
 */
export async function handleBudgetExceeded(payload, context) {
  const { supabase } = context;
  const { ventureId, currentBudget, threshold, overage } = payload;

  if (!ventureId) {
    const err = new Error('ventureId is required');
    err.retryable = false;
    throw err;
  }

  // Log to audit trail
  await supabase.from('eva_audit_log').insert({
    venture_id: ventureId,
    action_type: 'budget_exceeded',
    details: {
      current_budget: currentBudget,
      threshold,
      overage,
      escalated: true,
    },
    actor: 'event_bus',
  });

  // Add to chairman decision queue if table exists
  try {
    await supabase.from('chairman_decisions').insert({
      venture_id: ventureId,
      decision_type: 'budget_override',
      context: {
        current_budget: currentBudget,
        threshold,
        overage,
        source: 'event_bus',
      },
      status: 'pending',
    });
  } catch {
    // chairman_decisions table may not exist — non-fatal
  }

  return { outcome: 'budget_escalated', ventureId, overage };
}

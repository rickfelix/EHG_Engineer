/**
 * Handler: stage.failed
 * SD: SD-MAN-ORCH-EVA-CODEBASE-PLUS-001-E
 *
 * When a stage fails (gate rejection, timeout, error),
 * log the failure and escalate if needed.
 */

import { logEvaAudit } from './_log-eva-audit.js';

/**
 * Handle a stage.failed event.
 * @param {object} payload - { ventureId, stageId, reason, failureType }
 * @param {object} context - { supabase, ventureId }
 * @returns {Promise<{ outcome: string }>}
 */
export async function handleStageFailed(payload, context) {
  const { supabase } = context;
  const { ventureId, stageId, reason, failureType } = payload;

  if (!ventureId || !stageId) {
    const err = new Error('ventureId and stageId are required');
    err.retryable = false;
    throw err;
  }

  // Log to audit trail (fail-loud: SD-LEO-FIX-FIX-PHANTOM-COLUMN-002)
  await logEvaAudit(supabase, {
    eva_venture_id: ventureId,
    action_type: 'stage_failed',
    action_data: {
      stage_id: stageId,
      reason: reason || 'Unknown failure',
      failure_type: failureType || 'error',
    },
    actor_type: 'event_bus',
  }, { handler: 'StageFailed' });

  // If it's a gate rejection, it may need chairman review
  if (failureType === 'gate_rejection') {
    try {
      await supabase.from('chairman_decisions').insert({
        venture_id: ventureId,
        decision_type: 'stage_failure_review',
        context: {
          stage_id: stageId,
          reason,
          failure_type: failureType,
          source: 'event_bus',
        },
        status: 'pending',
      });
    } catch {
      // chairman_decisions table may not exist — non-fatal
    }
  }

  return { outcome: 'failure_logged', ventureId, stageId, failureType };
}

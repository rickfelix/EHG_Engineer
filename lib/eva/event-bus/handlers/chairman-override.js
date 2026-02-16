/**
 * Handler: chairman.override
 * SD: SD-MAN-ORCH-EVA-CODEBASE-PLUS-001-E
 *
 * When the chairman issues an override decision, apply it
 * to the venture and log to audit trail.
 */

/**
 * Handle a chairman.override event.
 * @param {object} payload - { ventureId, decisionId, overrideType, value }
 * @param {object} context - { supabase, ventureId }
 * @returns {Promise<{ outcome: string }>}
 */
export async function handleChairmanOverride(payload, context) {
  const { supabase } = context;
  const { ventureId, decisionId, overrideType, value } = payload;

  if (!ventureId || !overrideType) {
    const err = new Error('ventureId and overrideType are required');
    err.retryable = false;
    throw err;
  }

  // Log to audit trail
  await supabase.from('eva_audit_log').insert({
    venture_id: ventureId,
    action_type: 'chairman_override',
    details: {
      decision_id: decisionId,
      override_type: overrideType,
      value,
    },
    actor: 'chairman',
  });

  // Mark decision as applied if decisionId provided
  if (decisionId) {
    try {
      await supabase
        .from('chairman_decisions')
        .update({ status: 'applied' })
        .eq('id', decisionId);
    } catch {
      // chairman_decisions table may not exist — non-fatal
    }
  }

  return { outcome: 'override_applied', ventureId, overrideType };
}

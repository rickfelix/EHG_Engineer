/**
 * Handler: venture.killed
 * SD: SD-MAN-ORCH-EVA-CODEBASE-PLUS-001-E
 *
 * When a venture is killed (terminated), clean up resources
 * and log the kill decision to the audit trail.
 */

/**
 * Handle a venture.killed event.
 * @param {object} payload - { ventureId, reason, killedBy }
 * @param {object} context - { supabase, ventureId }
 * @returns {Promise<{ outcome: string }>}
 */
export async function handleVentureKilled(payload, context) {
  const { supabase } = context;
  const { ventureId, reason, killedBy } = payload;

  if (!ventureId) {
    const err = new Error('ventureId is required');
    err.retryable = false;
    throw err;
  }

  // Update venture status to killed
  const { error: updateError } = await supabase
    .from('eva_ventures')
    .update({ status: 'killed' })
    .eq('id', ventureId);

  if (updateError) {
    throw new Error(`Failed to update venture status: ${updateError.message}`);
  }

  // Log to audit trail
  await supabase.from('eva_audit_log').insert({
    venture_id: ventureId,
    action_type: 'venture_killed',
    details: {
      reason: reason || 'No reason provided',
      killed_by: killedBy || 'system',
    },
    actor: 'event_bus',
  });

  return { outcome: 'venture_killed', ventureId, reason };
}

/**
 * Handler: venture.created
 * SD: SD-MAN-ORCH-EVA-CODEBASE-PLUS-001-E
 *
 * When a new venture is created, initialize its stage pipeline
 * and log the creation to the audit trail.
 */

import { logEvaAudit } from './_log-eva-audit.js';

/**
 * Handle a venture.created event.
 * @param {object} payload - { ventureId, name, createdBy }
 * @param {object} context - { supabase, ventureId }
 * @returns {Promise<{ outcome: string }>}
 */
export async function handleVentureCreated(payload, context) {
  const { supabase } = context;
  const { ventureId, name, createdBy } = payload;

  if (!ventureId) {
    const err = new Error('ventureId is required');
    err.retryable = false;
    throw err;
  }

  // Verify venture exists
  const { data: venture, error } = await supabase
    .from('eva_ventures')
    .select('id, name, status')
    .eq('id', ventureId)
    .single();

  if (error || !venture) {
    const err = new Error(`Venture not found: ${ventureId}`);
    err.retryable = false;
    throw err;
  }

  // Log to audit trail (fail-loud: SD-LEO-FIX-FIX-PHANTOM-COLUMN-002)
  await logEvaAudit(supabase, {
    eva_venture_id: ventureId,
    action_type: 'venture_created',
    action_data: {
      name: name || venture.name,
      created_by: createdBy || 'system',
      initial_status: venture.status,
    },
    actor_type: 'event_bus',
  }, { handler: 'VentureCreated' });

  return { outcome: 'venture_initialized', ventureId };
}

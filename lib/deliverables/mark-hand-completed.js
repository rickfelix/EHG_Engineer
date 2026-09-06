// SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-G FR-4.
//
// The one sanctioned way to hand-complete an sd_scope_deliverables row outside
// the automated producers (fn_auto_close_deliverables_on_sd_completion,
// complete_deliverables_on_subagent_pass, autoCompleteDeliverables(),
// reconcileDeliverables()). A raw UPDATE from a script or console leaves
// metadata.producer unset, which DELIVERABLES_COMPLETENESS and SCOPE_AUDIT
// now treat as unproven past the FR-4 cutover
// (scripts/modules/handoff/validation/semantic-gate-utils.js
// isUnprovenancedPostCutover) -- a human completing a deliverable by hand
// must go through this helper, not a bare `.update()`, to be counted.

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} deliverableId - sd_scope_deliverables.id
 * @param {{actor: string, reason: string}} opts - actor: who/what completed it
 *   by hand; reason: why it's being marked complete outside an automated path.
 * @returns {Promise<{error: Error|null}>}
 */
export async function markDeliverableHandCompleted(supabase, deliverableId, { actor, reason } = {}) {
  if (!actor) throw new Error('markDeliverableHandCompleted requires an actor');
  if (!reason) throw new Error('markDeliverableHandCompleted requires a reason');

  const { data: existing, error: fetchError } = await supabase
    .from('sd_scope_deliverables')
    .select('metadata')
    .eq('id', deliverableId)
    .single();
  if (fetchError) return { error: fetchError };

  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .from('sd_scope_deliverables')
    .update({ // schema-lint-disable-line staged col completed_at (20260905_add_deliverables_provenance.sql, chairman-gated)
      completion_status: 'completed',
      completed_at: nowIso,
      completion_notes: reason,
      metadata: {
        ...(existing?.metadata || {}),
        producer: 'hand_completed',
        producer_actor: actor,
        hand_completed_reason: reason,
        hand_completed_at: nowIso
      }
    })
    .eq('id', deliverableId);

  return { error: error || null };
}

// SD-LEO-ORCH-OPERATING-COMPANY-SPINE-001-C: Relationship Engine satellite (FR-2, FR-3)
// Branching pipeline-stage transition engine — a SIBLING of fn_advance_venture_stage
// (lib/agents/modules/venture-state-machine/), never a generalization of it. This module
// has zero import dependency on that state machine or on fn_advance_venture_stage.

// 'support' case type is intentionally NOT seeded (no crm_pipeline_stage_defs/edges rows
// for it) — support-intake case flows are out of scope for this SD; only 'pipeline' is
// live. createPipelineCase rejects 'support' below rather than accepting a caseType whose
// stage graph doesn't exist (the FK would reject it anyway, but the error here is clearer).
const INITIAL_STAGE = { pipeline: 'inbound' };

export async function createPipelineCase(supabase, { contactId, ventureId, caseType = 'pipeline', dealValueCents = null, dealCurrency = 'USD' }) {
  if (!contactId) throw new Error('createPipelineCase: contactId is required');
  if (!ventureId) throw new Error('createPipelineCase: ventureId is required');
  const initialStage = INITIAL_STAGE[caseType];
  if (!initialStage) throw new Error(`createPipelineCase: unknown caseType ${caseType}`);

  const { data, error } = await supabase
    .from('crm_pipeline_cases')
    .insert({
      contact_id: contactId,
      venture_id: ventureId,
      case_type: caseType,
      current_stage: initialStage,
      deal_value_cents: dealValueCents,
      deal_currency: dealCurrency,
    })
    .select('id, contact_id, venture_id, case_type, current_stage, deal_value_cents, deal_currency')
    .single();
  if (error) throw new Error(`createPipelineCase failed: ${error.message}`);
  return data;
}

/**
 * Advances a pipeline case one branching hop via fn_advance_pipeline_stage.
 * Rejects (returns { success:false }) on stage mismatch, non-edge transitions
 * (no-stage-skipping guard), or missing/fabricated provenance (stranger-provenance
 * guard, enforced by the crm_pipeline_transitions FK to crm_inbound_events).
 */
export async function advancePipelineStage(supabase, { caseId, fromStage, toStage, provenanceEventId, idempotencyKey = null }) {
  if (!provenanceEventId) {
    return { success: false, error: 'provenance_missing: provenanceEventId is required' };
  }
  const { data, error } = await supabase.rpc('fn_advance_pipeline_stage', {
    p_case_id: caseId,
    p_from_stage: fromStage,
    p_to_stage: toStage,
    p_provenance_event_id: provenanceEventId,
    p_idempotency_key: idempotencyKey,
  });
  if (error) return { success: false, error: error.message };
  return data;
}

export async function getPipelineCase(supabase, caseId) {
  const { data, error } = await supabase
    .from('crm_pipeline_cases')
    .select('id, contact_id, venture_id, case_type, current_stage, updated_at')
    .eq('id', caseId)
    .single();
  if (error) throw new Error(`getPipelineCase failed: ${error.message}`);
  return data;
}

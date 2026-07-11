// SD-LEO-ORCH-OPERATING-COMPANY-SPINE-001-C: Relationship Engine satellite (FR-4)
// Read-only integration exposing qualified-pipeline-value to the EVA chairman meeting
// surface. Modeled after lib/eva/services/friday-briefing-card.js: pure function,
// versioned shape, null-safe. Per DESIGN sub-agent review (evidence row 1f97886b):
// a structured payload with a tri-state `data_state` discriminator is required so the
// surface can distinguish a legitimately empty pipeline from an unavailable/incomplete
// read — never a fabricated zero (the honest-gauge / NO-DATA-over-fabricated rule, S-4).

export const MEETING_SURFACE_ADAPTER_VERSION = 1;

/**
 * Builds the structured read contract for a venture's pipeline state.
 * @param {object|null} raw - { qualifiedValue, currency, stageBreakdown, contactCount, orgCount, lastActivityAt } or null
 */
export function buildPipelineMeetingSurfacePayload(raw) {
  if (raw === null || raw === undefined) {
    return {
      version: MEETING_SURFACE_ADAPTER_VERSION,
      type: 'crm_pipeline_summary',
      data_state: 'unavailable',
      qualified_pipeline_value: null,
      currency: null,
      stage_breakdown: [],
      contact_count: null,
      org_count: null,
      last_activity_at: null,
    };
  }

  const isEmpty = (raw.contactCount ?? 0) === 0 && (raw.qualifiedValue ?? 0) === 0;

  return {
    version: MEETING_SURFACE_ADAPTER_VERSION,
    type: 'crm_pipeline_summary',
    data_state: isEmpty ? 'empty' : 'available',
    qualified_pipeline_value: raw.qualifiedValue ?? 0,
    currency: raw.currency ?? 'USD',
    stage_breakdown: raw.stageBreakdown ?? [],
    contact_count: raw.contactCount ?? 0,
    org_count: raw.orgCount ?? 0,
    last_activity_at: raw.lastActivityAt ?? null,
  };
}

/**
 * Reads live pipeline state for a venture and shapes it via buildPipelineMeetingSurfacePayload.
 * Read-only: never writes to any spine or CRM table.
 */
export async function getPipelineMeetingSurfaceReport(supabase, ventureId) {
  if (!ventureId) return buildPipelineMeetingSurfacePayload(null);

  const { data: cases, error } = await supabase
    .from('crm_pipeline_cases')
    .select('id, current_stage, case_type, updated_at, contact_id, deal_value_cents, deal_currency')
    .eq('venture_id', ventureId)
    .eq('case_type', 'pipeline');
  if (error) return buildPipelineMeetingSurfacePayload(null);

  const { data: qualifiedDefs, error: defsError } = await supabase
    .from('crm_pipeline_stage_defs')
    .select('stage_key')
    .eq('case_type', 'pipeline')
    .eq('is_qualified', true);
  // A failed stage-def read must NOT silently render as "0 qualified" — that would be a
  // fabricated number, not honest NO-DATA (S-4). Bail out to `unavailable` instead.
  if (defsError) return buildPipelineMeetingSurfacePayload(null);
  const qualifiedStages = new Set((qualifiedDefs ?? []).map((d) => d.stage_key));

  const stageBreakdown = {};
  let lastActivityAt = null;
  for (const c of cases ?? []) {
    stageBreakdown[c.current_stage] = (stageBreakdown[c.current_stage] ?? 0) + 1;
    if (!lastActivityAt || c.updated_at > lastActivityAt) lastActivityAt = c.updated_at;
  }
  const qualifiedCases = (cases ?? []).filter((c) => qualifiedStages.has(c.current_stage));
  // Sum only cases with an actual estimated deal_value_cents — a case with no estimate
  // yet contributes nothing rather than being silently coerced to 0-as-if-estimated.
  const qualifiedValueCents = qualifiedCases.reduce((sum, c) => sum + (c.deal_value_cents ?? 0), 0);
  const contactIds = (cases ?? []).map((c) => c.contact_id);
  const contactCount = new Set(contactIds).size;

  let orgCount = 0;
  if (contactIds.length > 0) {
    const { data: contacts, error: contactsError } = await supabase
      .from('crm_contacts')
      .select('org_id')
      .in('id', contactIds);
    if (contactsError) return buildPipelineMeetingSurfacePayload(null);
    orgCount = new Set((contacts ?? []).map((c) => c.org_id).filter(Boolean)).size;
  }

  return buildPipelineMeetingSurfacePayload({
    qualifiedValue: qualifiedValueCents / 100,
    currency: 'USD',
    stageBreakdown: Object.entries(stageBreakdown).map(([stage, count]) => ({ stage, count })),
    contactCount,
    orgCount,
    lastActivityAt,
  });
}

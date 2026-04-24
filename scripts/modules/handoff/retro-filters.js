/**
 * Retrospective-gate query filters (SD-LEO-INFRA-RETROSPECTIVE-GATES-FAIL-001)
 *
 * Both PLAN-TO-LEAD (retrospective-quality.js) and LEAD-FINAL-APPROVAL
 * (createRetrospectiveExistsGate) must enforce the same three invariants:
 *   1. Existence: at least one retrospective row for the SD
 *   2. Type: retro_type = 'SD_COMPLETION'
 *   3. Freshness: created_at > the SD's LEAD-TO-PLAN acceptance timestamp
 *
 * Handoff-time retrospectives are written with retro_type='SD_COMPLETION'
 * (see scripts/modules/handoff/executors/lead-to-plan/retrospective.js line
 * 283), so retro_type alone does not distinguish them from true SD-completion
 * retrospectives. The timestamp filter is what reliably separates them.
 */

/**
 * Resolve the LEAD-TO-PLAN acceptance timestamp for an SD.
 * Falls back to sdCreatedAt if no accepted LEAD-TO-PLAN handoff row exists
 * (Phase-0 / unusual SDs — see SD risk analysis, accepted permissive).
 *
 * @param {string} sdUuid - strategic_directives_v2.id (UUID)
 * @param {string|null} sdCreatedAt - SD.created_at ISO string, used as fallback
 * @param {Object} supabase - Supabase client
 * @returns {Promise<string>} ISO timestamp string
 */
export async function resolveLeadToPlanAcceptedAt(sdUuid, sdCreatedAt, supabase) {
  const { data: handoff } = await supabase
    .from('sd_phase_handoffs')
    .select('accepted_at')
    .eq('sd_id', sdUuid)
    .eq('from_phase', 'LEAD')
    .eq('to_phase', 'PLAN')
    .eq('status', 'accepted')
    .order('accepted_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (handoff?.accepted_at) return handoff.accepted_at;
  if (sdCreatedAt) return sdCreatedAt;
  return new Date(0).toISOString();
}

/**
 * Fetch the most recent SD-completion retrospective that satisfies the three
 * invariants (existence, type, freshness). Returns null when no row matches.
 *
 * @param {string} sdUuid - strategic_directives_v2.id (UUID)
 * @param {string|null} sdCreatedAt - SD.created_at ISO string, freshness fallback
 * @param {Object} supabase - Supabase client
 * @returns {Promise<{retrospective: Object|null, leadToPlanAcceptedAt: string, error: Object|null}>}
 */
export async function getFilteredRetrospective(sdUuid, sdCreatedAt, supabase) {
  const leadToPlanAcceptedAt = await resolveLeadToPlanAcceptedAt(sdUuid, sdCreatedAt, supabase);

  const { data: retrospective, error } = await supabase
    .from('retrospectives')
    .select('*')
    .eq('sd_id', sdUuid)
    .eq('retro_type', 'SD_COMPLETION')
    .gt('created_at', leadToPlanAcceptedAt)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return { retrospective: retrospective || null, leadToPlanAcceptedAt, error: error || null };
}

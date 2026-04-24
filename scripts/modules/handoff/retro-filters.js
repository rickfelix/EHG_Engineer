/**
 * Retrospective-gate query filters (SD-LEO-INFRA-RETROSPECTIVE-GATES-FAIL-001)
 *
 * Both PLAN-TO-LEAD (retrospective-quality.js) and LEAD-FINAL-APPROVAL
 * (createRetrospectiveExistsGate) must enforce the same invariants:
 *   1. Existence: at least one retrospective row for the SD
 *   2. Type: retro_type = 'SD_COMPLETION' (excludes SPRINT/INCIDENT/AUDIT)
 *   3. Not a handoff-time retro: retrospective_type IS NULL (handoff-time
 *      retros tag this column with LEAD_TO_PLAN / PLAN_TO_EXEC / etc.)
 *   4. Freshness: created_at > the SD's LEAD-TO-PLAN acceptance timestamp
 *      (defense in depth — catches any handoff-type retros missed by #3)
 *
 * Handoff-time retrospectives are written with retro_type='SD_COMPLETION'
 * but also set retrospective_type to the handoff phase (see
 * scripts/modules/handoff/executors/lead-to-plan/retrospective.js line 283-284),
 * so retro_type alone does not distinguish them from true SD-completion retros.
 * The retrospective_type and timestamp filters are both required.
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
    .is('retrospective_type', null)
    .gt('created_at', leadToPlanAcceptedAt)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return { retrospective: retrospective || null, leadToPlanAcceptedAt, error: error || null };
}

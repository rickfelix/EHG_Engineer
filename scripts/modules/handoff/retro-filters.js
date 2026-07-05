/**
 * Retrospective-gate query filters (SD-LEO-INFRA-RETROSPECTIVE-GATES-FAIL-001)
 *
 * Both PLAN-TO-LEAD (retrospective-quality.js) and LEAD-FINAL-APPROVAL
 * (createRetrospectiveExistsGate) must enforce the same invariants:
 *   1. Existence: at least one retrospective row for the SD
 *   2. Type: retro_type = 'SD_COMPLETION' (excludes SPRINT/INCIDENT/AUDIT/HANDOFF)
 *   3. Not a handoff-time retro: retrospective_type IS NULL (defense in depth)
 *   4. Freshness: created_at > the SD's LEAD-TO-PLAN acceptance timestamp
 *      (defense in depth)
 *
 * SD-LEO-INFRA-NORMALIZE-HANDOFF-RETROSPECTIVE-001: handoff-time retrospectives
 * are now written with retro_type='HANDOFF' (the 3 handoff retro writers), so the
 * retro_type='SD_COMPLETION' filter (#2) excludes them on its own — that is the
 * primary mechanism. The retrospective_type (#3) and timestamp (#4) filters are
 * retained as defense-in-depth: they still exclude any legacy rows from before the
 * backfill that a manual writer might leave tagged with a handoff phase under
 * retro_type='SD_COMPLETION'. (Previously handoff retros shared
 * retro_type='SD_COMPLETION', so retro_type alone could NOT distinguish them and
 * #3/#4 were load-bearing — see git history pre-NORMALIZE-HANDOFF.)
 */

/**
 * QF-20260704-127: ctx.sd.id has been observed carrying the SD's legacy uuid_id
 * column instead of its canonical id (same corruption class as QF-20260703-906,
 * which patched PREREQUISITE_HANDOFF_CHECK inline) — for child SDs specifically,
 * making every .eq(sdUuid) below come back clean-empty (valid UUID, zero matches)
 * rather than erroring, so a real retrospective silently reads as missing.
 * Re-resolve via sd_key (unaffected by the id/uuid_id ambiguity) whenever available.
 *
 * @param {string} sdUuid - candidate strategic_directives_v2.id (UUID)
 * @param {string|null} sdKey - SD's sd_key, used to re-resolve the canonical id
 * @param {Object} supabase - Supabase client
 * @returns {Promise<string>} the canonical id (or the original sdUuid if unresolvable)
 */
async function resolveCanonicalSdId(sdUuid, sdKey, supabase) {
  if (!sdKey) return sdUuid;
  const { data: canonical } = await supabase
    .from('strategic_directives_v2')
    .select('id')
    .eq('sd_key', sdKey)
    .maybeSingle();
  if (canonical?.id && canonical.id !== sdUuid) {
    console.log(`   ⚠️  [retro-filters] sdUuid mismatch (${sdUuid} vs canonical ${canonical.id}) — using canonical id`);
    return canonical.id;
  }
  return sdUuid;
}

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
 * @param {string} sdUuid - candidate strategic_directives_v2.id (UUID)
 * @param {string|null} sdCreatedAt - SD.created_at ISO string, freshness fallback
 * @param {Object} supabase - Supabase client
 * @param {string|null} [sdKey] - SD's sd_key, used to re-resolve the canonical id (QF-20260704-127)
 * @returns {Promise<{retrospective: Object|null, leadToPlanAcceptedAt: string, error: Object|null}>}
 */
export async function getFilteredRetrospective(sdUuid, sdCreatedAt, supabase, sdKey = null) {
  const canonicalId = await resolveCanonicalSdId(sdUuid, sdKey, supabase);
  const leadToPlanAcceptedAt = await resolveLeadToPlanAcceptedAt(canonicalId, sdCreatedAt, supabase);

  const { data: retrospective, error } = await supabase
    .from('retrospectives')
    .select('*')
    .eq('sd_id', canonicalId)
    .eq('retro_type', 'SD_COMPLETION')
    // QF-20260530-670: accept retrospective_type IS NULL (canonical generate-retrospective.js)
    // OR ='SD_COMPLETION' (retro-agent's ad-hoc inserts mistag it). Handoff-time retros tag this
    // column with the PHASE (LEAD_TO_PLAN/PLAN_TO_EXEC/EXEC_TO_PLAN), never 'SD_COMPLETION', so
    // they remain correctly excluded — this only admits genuine SD-completion retros.
    .or('retrospective_type.is.null,retrospective_type.eq.SD_COMPLETION')
    .gt('created_at', leadToPlanAcceptedAt)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return { retrospective: retrospective || null, leadToPlanAcceptedAt, error: error || null };
}

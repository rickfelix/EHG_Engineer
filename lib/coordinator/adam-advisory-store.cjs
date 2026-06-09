/**
 * Shared read/ack helpers for the Adam advisory lane.
 * SD-LEO-INFRA-RESILIENT-SYMMETRIC-ADAM-001 (FR-2 + FR-5 shared selector — Q8 scope
 * reduction: one place defines "an unactioned advisory" so the read-only peek and the
 * ack verb cannot drift apart).
 *
 * An adam_advisory is RETIRED only by payload.actioned_at (the two-stage ACK, mirroring
 * lib/coordinator/adam-action-ack.cjs). read_at is DELIVERED (the coordinator saw it on a
 * render), NOT actioned. Pure-ish IO helpers — fail-soft for the display path, explicit
 * error returns for the mutate path. CommonJS so both .cjs verbs can require() it.
 *
 * @module lib/coordinator/adam-advisory-store
 */
'use strict';

const ADAM_ADVISORY_KIND = 'adam_advisory';
const BROADCAST_COORDINATOR = 'broadcast-coordinator';

/**
 * Read-only: unactioned advisories targeting the coordinator (or the broadcast sentinel).
 * Stamps NOTHING (the peek verb relies on this). Returns { rows, error }; rows=[] on error.
 *
 * @param {object} supabase
 * @param {string} coordinatorId - the active coordinator's session_id (may be null/absent)
 * @param {object} [opts] - { limit }
 * @returns {Promise<{rows:Array<object>, error:object|null}>}
 */
async function selectUnactionedAdvisories(supabase, coordinatorId, opts = {}) {
  const limit = Number.isFinite(opts.limit) ? opts.limit : 20;
  const targets = [coordinatorId, BROADCAST_COORDINATOR].filter(Boolean);
  let q = supabase
    .from('session_coordination')
    .select('id, sender_session, sender_type, subject, body, payload, read_at, created_at')
    .eq('payload->>kind', ADAM_ADVISORY_KIND)
    .is('payload->>actioned_at', null)
    .order('created_at', { ascending: false })
    .limit(limit);
  q = targets.length <= 1 ? q.eq('target_session', targets[0] || BROADCAST_COORDINATOR) : q.in('target_session', targets);
  const { data, error } = await q;
  if (error) return { rows: [], error };
  return { rows: data || [], error: null };
}

/**
 * Fetch a single advisory row by id (for ack/reply resolution).
 * @returns {Promise<{row:object|null, error:object|null}>}
 */
async function fetchAdvisory(supabase, advisoryId) {
  const { data, error } = await supabase
    .from('session_coordination')
    .select('id, sender_session, target_session, payload, read_at')
    .eq('id', advisoryId)
    .maybeSingle();
  return { row: data || null, error: error || null };
}

/**
 * Stamp payload.actioned_at on the advisory (JSONB merge — preserves existing keys).
 * This is the ONLY thing that retires an advisory. Idempotent (re-stamp is harmless).
 * @param {object} supabase
 * @param {object} advisoryRow - row with { id, payload }
 * @param {string} nowIso - ISO timestamp
 * @returns {Promise<{error:object|null}>}
 */
async function stampActioned(supabase, advisoryRow, nowIso) {
  const mergedPayload = Object.assign({}, advisoryRow.payload || {}, { actioned_at: nowIso });
  const { error } = await supabase
    .from('session_coordination')
    .update({ payload: mergedPayload })
    .eq('id', advisoryRow.id);
  return { error: error || null };
}

module.exports = {
  ADAM_ADVISORY_KIND,
  BROADCAST_COORDINATOR,
  selectUnactionedAdvisories,
  fetchAdvisory,
  stampActioned,
};

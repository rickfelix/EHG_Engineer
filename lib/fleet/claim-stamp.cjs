/* claim-stamp.cjs — boundary instrumentation for the same-turn next-claim KPI
 * (SD-MAN-INFRA-SAME-TURN-NEXT-001 FR-3).
 *
 * Stamps strategic_directives_v2.metadata at the two fleet boundary events:
 *   - stampClaim:      metadata.claim_history[] += { session_id, claimed_at } (FIFO-capped)
 *   - stampCompletion: metadata.completed_by_session + metadata.completed_stamp_at
 *
 * KPI derivation: join completed_stamp_at to the NEXT claim_history entry for the
 * same session_id → completion→next-claim latency (target: median ≤3m, p90 ≤8m
 * with a non-empty belt).
 *
 * Contract:
 *   - FAIL-SOFT: never throws, returns null on any failure — a stamp must never
 *     break the host claim or completion path (learning-layer wiring pattern).
 *   - Read-merge-write: additive JSONB merge preserving all existing metadata keys.
 *   - Accepts either the SD UUID or the sd_key (the claim_sd RPC callers pass sd_key;
 *     the completion flip passes the UUID).
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CLAIM_HISTORY_CAP = 20;

/** Apply the right filter for a UUID vs sd_key reference. */
function bySdRef(query, sdRef) {
  return UUID_RE.test(String(sdRef)) ? query.eq('id', sdRef) : query.eq('sd_key', sdRef);
}

/** Read the SD row's id + metadata. Returns null on any failure. */
async function readSd(supabase, sdRef) {
  const { data, error } = await bySdRef(
    supabase.from('strategic_directives_v2').select('id, metadata'),
    sdRef
  ).maybeSingle();
  if (error || !data) return null;
  return data;
}

/**
 * Append { session_id, claimed_at } to metadata.claim_history (FIFO cap 20)
 * after a successful claim_sd. Fail-soft: returns the appended entry or null.
 */
async function stampClaim(supabase, sdRef, sessionId) {
  try {
    if (!supabase || !sdRef || !sessionId) return null;
    const row = await readSd(supabase, sdRef);
    if (!row) return null;
    const md = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
    const entry = { session_id: sessionId, claimed_at: new Date().toISOString() };
    const history = Array.isArray(md.claim_history) ? md.claim_history : [];
    history.push(entry);
    md.claim_history = history.slice(-CLAIM_HISTORY_CAP);
    const { error } = await supabase
      .from('strategic_directives_v2')
      .update({ metadata: md })
      .eq('id', row.id);
    if (error) return null;
    return entry;
  } catch {
    return null;
  }
}

/**
 * Stamp metadata.completed_by_session + completed_stamp_at at the completion
 * flip. Capture the session id BEFORE the completion update nulls
 * active_session_id. Fail-soft: returns the stamp or null.
 */
async function stampCompletion(supabase, sdRef, sessionId) {
  try {
    if (!supabase || !sdRef || !sessionId) return null;
    const row = await readSd(supabase, sdRef);
    if (!row) return null;
    const md = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
    md.completed_by_session = sessionId;
    md.completed_stamp_at = new Date().toISOString();
    const { error } = await supabase
      .from('strategic_directives_v2')
      .update({ metadata: md })
      .eq('id', row.id);
    if (error) return null;
    return { completed_by_session: md.completed_by_session, completed_stamp_at: md.completed_stamp_at };
  } catch {
    return null;
  }
}

module.exports = { stampClaim, stampCompletion, CLAIM_HISTORY_CAP };

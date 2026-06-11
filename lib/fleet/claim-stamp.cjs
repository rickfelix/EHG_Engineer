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

/**
 * Build the per-SD execution context for the effort-tier experiment
 * (SD-MAN-INFRA-EFFORT-TIER-EXPERIMENT-001 FR-1). All lookups fail-soft to
 * null fields — the build always succeeds with whatever is knowable.
 *
 * - effort_arm: coordinator-declared arm in claude_sessions.metadata.effort_arm
 *   (session effort is NOT programmatically discoverable — recorded, not detected)
 * - model_id:   latest model_usage_log reported_model_id for this SD
 * - item_class: declared via SD metadata.item_class, else derived from sd_type
 *   (documentation→docs, qa→test, everything else→code)
 * - loc_changed: left null here; the readout enriches from PR stats when needed
 */
async function buildExecutionContext(supabase, sdRef, sessionId) {
  const ctx = {
    effort_arm: null,
    arm_source: 'unassigned',
    model_id: null,
    item_class: null,
    loc_changed: null,
    session_id: sessionId || null,
    stamped_at: new Date().toISOString()
  };
  try {
    if (sessionId) {
      const { data } = await supabase
        .from('claude_sessions')
        .select('metadata')
        .eq('session_id', sessionId)
        .maybeSingle();
      if (data && data.metadata && data.metadata.effort_arm) {
        ctx.effort_arm = data.metadata.effort_arm;
        ctx.arm_source = 'coordinator';
      }
    }
  } catch { /* fail-soft */ }
  let sdRow = null;
  try {
    const { data } = await bySdRef(
      supabase.from('strategic_directives_v2').select('id, sd_key, sd_type, metadata'),
      sdRef
    ).maybeSingle();
    sdRow = data || null;
  } catch { /* fail-soft */ }
  try {
    if (sdRow) {
      const { data: usage } = await supabase
        .from('model_usage_log')
        .select('reported_model_id')
        .in('sd_id', [sdRow.id, sdRow.sd_key].filter(Boolean))
        .order('captured_at', { ascending: false })
        .limit(1);
      if (usage && usage[0] && usage[0].reported_model_id) ctx.model_id = usage[0].reported_model_id;
    }
  } catch { /* fail-soft */ }
  try {
    const declared = sdRow && sdRow.metadata && sdRow.metadata.item_class;
    const t = (sdRow && sdRow.sd_type) || '';
    ctx.item_class = declared || (t === 'documentation' ? 'docs' : t === 'qa' ? 'test' : 'code');
  } catch { /* fail-soft */ }
  return ctx;
}

/**
 * Stamp metadata.execution_context at SD completion (effort-tier experiment
 * FR-1). Additive read-merge-write preserving any pre-existing
 * execution_context keys (e.g. tokens written by attribute-tokens). Fail-soft;
 * never throws.
 */
async function stampExecutionContext(supabase, sdRef, sessionId) {
  try {
    if (!supabase || !sdRef) return null;
    const ctx = await buildExecutionContext(supabase, sdRef, sessionId);
    const row = await readSd(supabase, sdRef);
    if (!row) return null;
    const md = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
    md.execution_context = { ...(md.execution_context || {}), ...ctx };
    const { error } = await supabase
      .from('strategic_directives_v2')
      .update({ metadata: md })
      .eq('id', row.id);
    if (error) return null;
    return md.execution_context;
  } catch {
    return null;
  }
}

module.exports = { stampClaim, stampCompletion, stampExecutionContext, buildExecutionContext, CLAIM_HISTORY_CAP };

/**
 * handoff-memory-store.cjs — SD-LEO-INFRA-COORDINATOR-ORCHESTRATED-SINGLETON-REFRESH-001-B (FR-1/FR-2)
 *
 * The persistence seam for handoff_memory. Reads are a plain SELECT of
 * claude_sessions.metadata.handoff_memory (normalized through the pure library). Writes go
 * EXCLUSIVELY through the atomic set_session_handoff_memory RPC (metadata || jsonb_build_object)
 * — NEVER a JS read-modify-write of the whole metadata object.
 *
 * FAIL-SOFT: when the RPC is absent (the chairman-gated migration is not yet applied) the writer
 * returns { persisted:false, reason:'rpc_absent' } and warns — it does NOT fall back to a
 * dangerous RMW and it does not crash. The feature is dormant-but-safe until apply.
 *
 * Injectable: the supabase client is passed in so the store is unit-testable with a stub.
 * Mirrors lib/coordinator/working-context-store.cjs.
 */

const hmLib = require('./handoff-memory.cjs');

// Postgres/PostgREST signals that the RPC function is not defined (migration unapplied).
function isMissingFunctionError(error) {
  if (!error) return false;
  const code = error.code || '';
  if (code === '42883' || code === 'PGRST202') return true; // undefined_function / PostgREST not-found
  const msg = String(error.message || error.hint || '').toLowerCase();
  return /could not find the function|function .*does not exist|set_session_handoff_memory/.test(msg) && /not (found|exist)/.test(msg);
}

/** Best-effort audit event; never throws, never blocks the caller on failure. */
async function logLifecycleEvent(supabase, eventType, sessionId, metadata) {
  try {
    await supabase.from('session_lifecycle_events').insert({ event_type: eventType, session_id: sessionId || null, metadata: metadata || {} });
  } catch { /* audit emission is best-effort */ }
}

/**
 * Read + normalize a session's handoff_memory. `sessionId` is the PREDECESSOR session's id
 * (the retiring singleton), not the caller's own — the new session has no row of its own yet
 * when it needs to read this. Returns a normalized (possibly empty) context; never throws.
 */
async function readHandoffMemory(supabase, sessionId) {
  if (!supabase || !sessionId) return hmLib.normalizeHandoffMemory(null);
  try {
    const { data, error } = await supabase
      .from('claude_sessions')
      .select('metadata')
      .eq('session_id', sessionId)
      .maybeSingle();
    if (error) return hmLib.normalizeHandoffMemory(null);
    const hm = hmLib.normalizeHandoffMemory(data && data.metadata ? data.metadata.handoff_memory : null);
    if (hm.items.length > 0) await logLifecycleEvent(supabase, 'HANDOFF_MEMORY_CONSUMED', sessionId, { item_count: hm.items.length });
    return hm;
  } catch {
    return hmLib.normalizeHandoffMemory(null);
  }
}

/**
 * Persist a handoff_memory value atomically via the RPC. Returns:
 *   { persisted:true }                                 on success
 *   { persisted:false, reason:'rpc_absent', warn }     when the migration is not applied (fail-soft)
 *   { persisted:false, reason:'error', error }         on any other DB error
 * NEVER performs a JS read-modify-write fallback (lost-update safety).
 */
async function writeHandoffMemory(supabase, sessionId, hm) {
  if (!supabase || !sessionId) return { persisted: false, reason: 'no_client_or_session' };
  let res;
  try {
    res = await supabase.rpc('set_session_handoff_memory', { p_session_id: sessionId, p_hm: hm });
  } catch (e) {
    if (isMissingFunctionError(e)) return rpcAbsent();
    return { persisted: false, reason: 'error', error: e && e.message ? e.message : String(e) };
  }
  const error = res && res.error;
  if (error) {
    if (isMissingFunctionError(error)) return rpcAbsent();
    return { persisted: false, reason: 'error', error: error.message || String(error) };
  }
  await logLifecycleEvent(supabase, 'HANDOFF_MEMORY_WRITTEN', sessionId, { item_count: Array.isArray(hm && hm.items) ? hm.items.length : 0 });
  return { persisted: true };
}

function rpcAbsent() {
  const warn = '[handoff-memory] persistence pending: set_session_handoff_memory RPC is not applied (chairman-gated migration). Memory not persisted (no unsafe RMW fallback).';
  return { persisted: false, reason: 'rpc_absent', warn };
}

module.exports = { readHandoffMemory, writeHandoffMemory, isMissingFunctionError };

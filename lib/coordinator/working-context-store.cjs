/**
 * working-context-store.cjs — SD-LEO-INFRA-ADAM-COORDINATOR-INTERFACE-001 (FR-2)
 *
 * The persistence seam for working_context. Reads are a plain SELECT of
 * claude_sessions.metadata.working_context (normalized through the pure library). Writes go
 * EXCLUSIVELY through the atomic set_session_working_context RPC (metadata || jsonb_build_object)
 * — NEVER a JS read-modify-write of the whole metadata object, which is the lost-update race the
 * atomic coordinator-flag RPCs already fixed for this table.
 *
 * FAIL-SOFT: when the RPC is absent (the chairman-gated migration is not yet applied) the writer
 * returns { persisted:false, reason:'rpc_absent' } and warns — it does NOT fall back to a
 * dangerous RMW and it does not crash. The feature is dormant-but-safe until apply.
 *
 * Injectable: the supabase client is passed in so the store is unit-testable with a stub.
 */

const wcLib = require('./working-context.cjs');

// Postgres/PostgREST signals that the RPC function is not defined (migration unapplied).
function isMissingFunctionError(error) {
  if (!error) return false;
  const code = error.code || '';
  if (code === '42883' || code === 'PGRST202') return true; // undefined_function / PostgREST not-found
  const msg = String(error.message || error.hint || '').toLowerCase();
  return /could not find the function|function .*does not exist|set_session_working_context/.test(msg) && /not (found|exist)/.test(msg);
}

/** Read + normalize a session's working_context. Returns a normalized context (empty if absent). */
async function getWorkingContext(supabase, sessionId) {
  if (!supabase || !sessionId) return wcLib.normalizeWorkingContext(null);
  try {
    const { data, error } = await supabase
      .from('claude_sessions')
      .select('metadata')
      .eq('session_id', sessionId)
      .maybeSingle();
    if (error) return wcLib.normalizeWorkingContext(null);
    return wcLib.normalizeWorkingContext(data && data.metadata ? data.metadata.working_context : null);
  } catch {
    return wcLib.normalizeWorkingContext(null);
  }
}

/**
 * Persist a working_context value atomically via the RPC. Returns:
 *   { persisted:true }                                 on success
 *   { persisted:false, reason:'rpc_absent', warn }     when the migration is not applied (fail-soft)
 *   { persisted:false, reason:'error', error }         on any other DB error
 * NEVER performs a JS read-modify-write fallback (lost-update safety).
 */
async function writeWorkingContext(supabase, sessionId, wc) {
  if (!supabase || !sessionId) return { persisted: false, reason: 'no_client_or_session' };
  let res;
  try {
    res = await supabase.rpc('set_session_working_context', { p_session_id: sessionId, p_wc: wc });
  } catch (e) {
    if (isMissingFunctionError(e)) return rpcAbsent();
    return { persisted: false, reason: 'error', error: e && e.message ? e.message : String(e) };
  }
  const error = res && res.error;
  if (error) {
    if (isMissingFunctionError(error)) return rpcAbsent();
    return { persisted: false, reason: 'error', error: error.message || String(error) };
  }
  return { persisted: true };
}

function rpcAbsent() {
  const warn = '[working-context] persistence pending: set_session_working_context RPC is not applied (chairman-gated migration). Context not persisted (no unsafe RMW fallback).';
  return { persisted: false, reason: 'rpc_absent', warn };
}

module.exports = { getWorkingContext, writeWorkingContext, isMissingFunctionError };

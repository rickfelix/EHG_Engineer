/**
 * working-signal-store.cjs — SD-LEO-INFRA-COMMS-PRESENCE-GROUNDING-SIGNALS-001 (FR-4)
 *
 * The persistence seam for the ephemeral working/thinking backchannel signal. Reads are a plain
 * SELECT of claude_sessions.metadata.working_signal (staleness-checked by the pure
 * getWorkingSignal() in presence-grounding-signals.cjs). Writes go EXCLUSIVELY through the atomic
 * set_session_working_signal RPC (metadata || jsonb_build_object) — NEVER a JS read-modify-write
 * of the whole metadata object, which is the lost-update race the atomic coordinator-flag /
 * working-context RPCs already fixed for this table.
 *
 * FAIL-SOFT: when the RPC is absent (the chairman-gated migration is not yet applied) the writer
 * returns { persisted:false, reason:'rpc_absent' } and warns — it does NOT fall back to a
 * dangerous RMW and it does not crash. The feature is dormant-but-safe until apply.
 *
 * Injectable: the supabase client is passed in so the store is unit-testable with a stub.
 */

const DEFAULT_SIGNAL_TTL_MS = 30 * 60 * 1000; // 30min, matches ARMED_SILENCE_MAX_MS convention

// Postgres/PostgREST signals that the RPC function is not defined (migration unapplied).
function isMissingFunctionError(error) {
  if (!error) return false;
  const code = error.code || '';
  if (code === '42883' || code === 'PGRST202') return true; // undefined_function / PostgREST not-found
  const msg = String(error.message || error.hint || '').toLowerCase();
  return /could not find the function|function .*does not exist|set_session_working_signal/.test(msg) && /not (found|exist)/.test(msg);
}

/** Read a session's raw working_signal (unfiltered by staleness — callers use getWorkingSignal for that). */
async function getRawWorkingSignal(supabase, sessionId) {
  if (!supabase || !sessionId) return null;
  try {
    const { data, error } = await supabase
      .from('claude_sessions')
      .select('metadata')
      .eq('session_id', sessionId)
      .maybeSingle();
    if (error) return null;
    return (data && data.metadata && data.metadata.working_signal) || null;
  } catch {
    return null;
  }
}

/**
 * Persist a working-signal value atomically via the RPC. Returns:
 *   { persisted:true }                                 on success
 *   { persisted:false, reason:'rpc_absent', warn }     when the migration is not applied (fail-soft)
 *   { persisted:false, reason:'error', error }         on any other DB error
 * NEVER performs a JS read-modify-write fallback (lost-update safety).
 */
async function writeWorkingSignal(supabase, sessionId, { body, etaMs = null, ttlMs = DEFAULT_SIGNAL_TTL_MS } = {}) {
  if (!supabase || !sessionId) return { persisted: false, reason: 'no_client_or_session' };
  if (!body) return { persisted: false, reason: 'no_body' };
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();
  let res;
  try {
    res = await supabase.rpc('set_session_working_signal', {
      p_session_id: sessionId,
      p_body: body,
      p_eta_ms: etaMs,
      p_expires_at: expiresAt,
    });
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
  const warn = '[working-signal] persistence pending: set_session_working_signal RPC is not applied (chairman-gated migration). Signal not persisted (no unsafe RMW fallback).';
  return { persisted: false, reason: 'rpc_absent', warn };
}

module.exports = { getRawWorkingSignal, writeWorkingSignal, isMissingFunctionError, DEFAULT_SIGNAL_TTL_MS };

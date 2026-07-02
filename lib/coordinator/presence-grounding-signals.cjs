'use strict';

/**
 * Shared presence + grounding signals — SD-LEO-INFRA-COMMS-PRESENCE-GROUNDING-SIGNALS-001.
 *
 * The single shared module any role-session (Adam, coordinator, Solomon) calls for three
 * complementary grounding signals so a live exchange has the visual cues that keep conversation
 * flow (Clark & Brennan grounding; complements the shipped adaptive-comms-cadence SD, which fixed
 * RECEIPT LATENCY — this fixes PRESENCE/ACKNOWLEDGMENT/BACKCHANNEL):
 *
 *   1. READ-RECEIPT ECHO — getReadReceipts(): surfaces session_coordination.read_at back to the
 *      SENDER of a message. Builds ON the existing two-stage-ACK contract, mirrors the sender-side
 *      query shape already established in lib/coordinator/receipts.cjs / coordinator-comms-check.mjs.
 *   2. PRESENCE / EXPECTATION INDICATOR — derivePresence() (pure) + getFleetPresence() (I/O):
 *      active_now / parked-until-~Xmin / away, reusing isSessionAlive()/hasExpectedSilence() from
 *      lib/fleet/session-liveness.cjs — NOT a new liveness derivation.
 *   3. EPHEMERAL WORKING/THINKING BACKCHANNEL — getWorkingSignal() (pure read) +
 *      lib/coordinator/working-signal-store.cjs (atomic RPC write) — kept OFF the durable
 *      session_coordination log, self-expiring, never a chat message.
 *
 * Both I/O helpers are FAIL-OPEN: any query error or thrown exception resolves to an empty/absent
 * result — never blocks the caller's tick, never throws.
 *
 * SD-LEO-INFRA-ROLE-BASED-COMMS-ROUTING-PROTOCOL-001-D: this is one of the TACTICAL mechanisms
 * organized under docs/protocol/crew-comms-routing-protocol.md (Rule 4, silence-by-default) —
 * see that doc's "Tactical layer" section for the full hierarchy.
 */

const { isSessionAlive, hasExpectedSilence } = require('../fleet/session-liveness.cjs');

const DEFAULT_FETCH_LIMIT = 60; // matches the established claude_sessions liveness call-site convention
const DEFAULT_RECEIPT_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h — recent-enough to be a live grounding cue

// ---- 2. Presence / expectation indicator -----------------------------------------------------

/**
 * PURE. Derives a tri-state presence for a role-session from the SAME liveness primitives every
 * other consumer uses (isSessionAlive/hasExpectedSilence) — never a bespoke heartbeat-recency
 * check. Returns { state, reason, expectationWindowMs, loopState }.
 *   state: 'active_now' | 'parked' | 'away'
 *   expectationWindowMs: only set (>=0) when state==='parked' — ms until expected_silence_until
 * @param {object|null} session - a claude_sessions-shaped row
 * @param {{nowMs?:number, aliveCcPids?:Set<string>}} [opts]
 */
function derivePresence(session, { nowMs = Date.now(), aliveCcPids = null } = {}) {
  const { alive, reason } = isSessionAlive(session, { nowMs, aliveCcPids });
  const loopState = (session && session.loop_state) || null;
  if (!alive) return { state: 'away', reason: null, expectationWindowMs: null, loopState };
  if (reason === 'armed_silence' && hasExpectedSilence(session, nowMs)) {
    const until = typeof session.expected_silence_until === 'number'
      ? session.expected_silence_until
      : Date.parse(session.expected_silence_until);
    const expectationWindowMs = Number.isFinite(until) ? Math.max(0, until - nowMs) : null;
    return { state: 'parked', reason, expectationWindowMs, loopState };
  }
  return { state: 'active_now', reason, expectationWindowMs: null, loopState };
}

/**
 * I/O helper. Fetches claude_sessions rows following the SAME pattern as every existing liveness
 * call site (coordinator-audit.mjs, coordinator-email-summary.mjs, fleet-worker-pulse.mjs, etc.):
 * one ordered+capped fetch, then a pure predicate applied in JS — never a bespoke server-side
 * filter chain, never an unbounded/unfiltered select.
 *
 * @param {object} supabase
 * @param {string[]} sessionIds - the sessions to resolve presence for (subset of the fetched page)
 * @param {{nowMs?:number, limit?:number}} [opts]
 * @returns {Promise<Map<string, {state,reason,expectationWindowMs,loopState}>>} fail-open: empty Map on error
 */
async function getFleetPresence(supabase, sessionIds, { nowMs = Date.now(), limit = DEFAULT_FETCH_LIMIT } = {}) {
  const result = new Map();
  if (!supabase || !Array.isArray(sessionIds) || sessionIds.length === 0) return result;
  try {
    const { data, error } = await supabase
      .from('claude_sessions')
      .select('session_id, heartbeat_at, status, loop_state, expected_silence_until, is_alive, terminal_id, process_alive_at, metadata')
      .order('heartbeat_at', { ascending: false })
      .limit(limit);
    if (error || !Array.isArray(data)) return result;
    const wanted = new Set(sessionIds);
    for (const session of data) {
      if (!wanted.has(session.session_id)) continue;
      result.set(session.session_id, derivePresence(session, { nowMs }));
    }
    return result;
  } catch {
    return result;
  }
}

// ---- 1. Read-receipt echo ---------------------------------------------------------------------

/**
 * I/O helper. Sender-side query: rows THIS session sent that have since been read. Mirrors the
 * existing sender-side ownership check in lib/coordinator/receipts.cjs / coordinator-comms-check.mjs
 * (.eq('sender_session', X)) with the opposite polarity — .not('read_at','is',null) instead of
 * .is('read_at', null) — builds ON the existing two-stage-ACK contract rather than a parallel one.
 * Fail-open: resolves to [] on any error, never throws.
 *
 * @param {object} supabase
 * @param {string} sessionId - the sender whose sent-message receipts we're echoing back
 * @param {{sinceMs?:number, limit?:number}} [opts]
 * @returns {Promise<Array<{id,target_session,read_at,created_at,subject}>>}
 */
async function getReadReceipts(supabase, sessionId, { sinceMs = DEFAULT_RECEIPT_WINDOW_MS, limit = 50 } = {}) {
  if (!supabase || !sessionId) return [];
  try {
    const sinceIso = new Date(Date.now() - sinceMs).toISOString();
    const { data, error } = await supabase
      .from('session_coordination')
      .select('id, target_session, read_at, created_at, subject')
      .eq('sender_session', sessionId)
      .not('read_at', 'is', null)
      .gte('created_at', sinceIso)
      .order('read_at', { ascending: false })
      .limit(limit);
    if (error || !Array.isArray(data)) return [];
    return data;
  } catch {
    return [];
  }
}

// ---- 3. Ephemeral working/thinking backchannel (pure read side) ------------------------------

/**
 * PURE. Reads session.metadata.working_signal and returns it only if not stale (now <= expires_at).
 * The write side (lib/coordinator/working-signal-store.cjs) is I/O and lives in a separate module
 * (atomic RPC only — never a JS read-modify-write of metadata).
 * @param {object|null} session - a claude_sessions-shaped row (already fetched by the caller)
 * @param {{nowMs?:number}} [opts]
 * @returns {{body:string, etaMs:number|null, stampedAt:string}|null}
 */
function getWorkingSignal(session, { nowMs = Date.now() } = {}) {
  const signal = session && session.metadata && session.metadata.working_signal;
  if (!signal || !signal.body) return null;
  const expiresAt = signal.expires_at ? Date.parse(signal.expires_at) : NaN;
  if (Number.isFinite(expiresAt) && nowMs > expiresAt) return null;
  return { body: signal.body, etaMs: signal.eta_ms ?? null, stampedAt: signal.stamped_at || null };
}

module.exports = {
  derivePresence,
  getFleetPresence,
  getReadReceipts,
  getWorkingSignal,
  DEFAULT_FETCH_LIMIT,
  DEFAULT_RECEIPT_WINDOW_MS,
};

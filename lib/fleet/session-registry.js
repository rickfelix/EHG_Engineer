/**
 * Fleet session-registry SSOT — SD-LEO-INFRA-FLEET-REGISTRY-MANIFEST-001 (FR-1).
 *
 * Joins the four fleet-identity namespaces into ONE resolvable session identity so every consumer
 * (claim-guard, worker-checkin, coordinator) can read one source instead of re-deriving identity
 * per-caller:
 *   - session_id, terminal_id, pid  — from claude_sessions
 *   - callsign                      — from the SET_IDENTITY row (the callsign authority is a
 *                                     SET_IDENTITY row, not a claude_sessions column)
 *
 * PURE CORE (data-in / verdict-out, NO DB) so the join + resolution are unit-testable without a
 * live database; the thin DB adapter passes claude_sessions rows + a session_id->callsign map in.
 *
 * COLLISION-VISIBLE by contract: resolving a namespace key that matches MORE THAN ONE distinct
 * session returns an explicit `{ resolved:false, reason:'ambiguous', ... }` — never a silent wrong
 * match. This is the exact failure the Method-3 marker-file fallback caused (two sessions collapsing
 * to one identity) before SD-LEO-FIX-DETERMINISTIC-FLEET-SESSION-001 removed it: the registry keeps
 * the ambiguity OBSERVABLE instead of guessing.
 */

/**
 * Join claude_sessions rows with a session_id->callsign map into the 4-namespace identity set.
 * @param {{ sessions?: Array<{session_id?:string, terminal_id?:string, pid?:number}>, callsignBySession?: Record<string,string> }} input
 * @returns {Array<{session_id:string|null, terminal_id:string|null, pid:number|null, callsign:string|null}>}
 */
export function joinSessionIdentity({ sessions = [], callsignBySession = {} } = {}) {
  return (Array.isArray(sessions) ? sessions : []).map((s) => ({
    session_id: (s && s.session_id) || null,
    terminal_id: (s && s.terminal_id) || null,
    pid: s && s.pid != null ? s.pid : null,
    callsign: (s && s.session_id && callsignBySession[s.session_id]) || null,
  }));
}

/**
 * Resolve ONE joined identity by a namespace key. Collision-visible: >1 match → explicit ambiguous;
 * zero matches → not_found; a missing key → no_key. Never returns a silently-picked wrong session.
 * @param {Array<object>} joined - output of joinSessionIdentity
 * @param {{ by?: string, value?: any }} key
 * @returns {{ resolved:boolean, identity?:object, reason?:string, count?:number, matches?:object[] }}
 */
export function resolveSessionIdentity(joined = [], { by, value } = {}) {
  if (!by || value == null || value === '') return { resolved: false, reason: 'no_key' };
  const matches = (Array.isArray(joined) ? joined : []).filter((j) => j && j[by] === value);
  if (matches.length === 0) return { resolved: false, reason: 'not_found' };
  if (matches.length > 1) return { resolved: false, reason: 'ambiguous', count: matches.length, matches };
  return { resolved: true, identity: matches[0] };
}

/**
 * Fail-soft absence probe — mirrors lib/forecasting / sms-bridge drain semantics so the DB adapter
 * degrades to an empty registry when the backing table is absent, never throwing (42P01 / PGRST205).
 * @param {{code?:string, message?:string, details?:string}|null} error
 * @returns {boolean}
 */
export function tableAbsent(error) {
  if (!error) return false;
  const code = error.code || error.details || '';
  return code === '42P01' || code === 'PGRST205' || /does not exist|relation .* not exist|not found/i.test(error.message || '');
}

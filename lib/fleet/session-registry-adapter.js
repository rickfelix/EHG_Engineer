/**
 * DB adapter feeding live claude_sessions + SET_IDENTITY callsigns into SD-A's pure
 * session-registry.js / session-manifest.js (FR-8). SD-A's libs are @wire-check-exempt --
 * this is the activation follow-up.
 */
import { joinSessionIdentity, resolveSessionIdentity, tableAbsent } from './session-registry.js';
import { computeManifestDrift, normalizeDesiredManifest } from './session-manifest.js';

/** Read live sessions + resolve the SET_IDENTITY callsign source. Fail-soft: [] on any error. */
export async function loadLiveSessionIdentity(supabase) {
  const { data: sessions, error } = await supabase
    .from('claude_sessions')
    .select('session_id, terminal_id, pid, metadata, status, released_at')
    .in('status', ['active', 'idle']);
  if (error) return { sessions: [], callsignBySession: {}, error: tableAbsent(error) ? null : error.message };

  // Callsign authority is the SET_IDENTITY row (metadata.fleet_identity.callsign), never a
  // claude_sessions.callsign column (per session-registry.js's own documented contract).
  const callsignBySession = {};
  for (const s of sessions || []) {
    const cs = s && s.metadata && s.metadata.fleet_identity && s.metadata.fleet_identity.callsign;
    if (s && s.session_id && cs) callsignBySession[s.session_id] = cs;
  }
  return { sessions: sessions || [], callsignBySession, error: null };
}

/** Live joined identity set, ready for resolveSessionIdentity(). */
export async function joinLiveSessionIdentity(supabase) {
  const { sessions, callsignBySession } = await loadLiveSessionIdentity(supabase);
  return joinSessionIdentity({ sessions, callsignBySession });
}

/** Resolve a card/session identifier (session_id OR callsign) to ONE live identity. Collision-visible. */
export async function resolveLiveSession(supabase, { by, value } = {}) {
  const joined = await joinLiveSessionIdentity(supabase);
  return resolveSessionIdentity(joined, { by, value });
}

/**
 * Live per-role counts derived from the joined identity set + a role-of-callsign resolver.
 * @param {Array<{callsign:string|null}>} joined
 * @param {(callsign:string)=>string|null} roleOf
 */
export function actualByRole(joined, roleOf) {
  const counts = {};
  for (const j of joined || []) {
    const role = j && j.callsign && typeof roleOf === 'function' ? roleOf(j.callsign) : null;
    if (role) counts[role] = (counts[role] || 0) + 1;
  }
  return counts;
}

/** Live manifest drift: desired roles vs the actual live fleet, derived from real session data (FR-8). */
export async function computeLiveManifestDrift(supabase, { desired, roleOf } = {}) {
  const joined = await joinLiveSessionIdentity(supabase);
  return computeManifestDrift({ desired: normalizeDesiredManifest(desired), actualByRole: actualByRole(joined, roleOf) });
}

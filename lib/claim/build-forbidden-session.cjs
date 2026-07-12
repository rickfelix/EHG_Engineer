/**
 * Shared predicate: is this session forbidden from holding a BUILD claim?
 * SD-FDBK-FIX-SELF-ONLY-AUTHORIZATION-001.
 *
 * Single source of truth consumed by BOTH the ESM claim-validity gate
 * (assertValidClaim CHECK 1.5, handoff-time tripwire) AND the CJS worker
 * self-claim path (worker-checkin.cjs resolveCheckin, acquisition-time guard) —
 * deliberately NOT duplicated (see SD-PAT-FIX-WRITER-CONSUMER-ASYMMETRY-001).
 *
 * non_fleet / role=adam sessions are propose-only (CONST-002) and must never
 * acquire or hold a build claim. Fail-safe: only an EXPLICIT non_fleet===true
 * or role==='adam' returns true; any other/missing metadata returns false
 * (never broadens rejection to legitimate fleet workers).
 *
 * SD-REFILL-001KNKE4: also forbid is_coordinator===true sessions. A coordinator
 * DISPATCHES work; it never self-claims a build SD. Critically, a worker window
 * can COLLIDE onto the coordinator's claude_sessions row (terminal_id/SSE-port
 * sharing → same CLAUDE_SESSION_ID); when that worker self-claims, it reads the
 * coordinator's metadata (is_coordinator=true) here and is short-circuited to
 * idle — so it can never write a worker claim onto the coordinator row and
 * corrupt coordinator identity (a state the stale-session-sweep cannot self-heal
 * because the coordinator's own heartbeat keeps the row fresh). Covers BOTH the
 * acquisition-time guard (worker-checkin) and the handoff-time tripwire.
 *
 * @param {object|null} metadata - claude_sessions.metadata
 * @returns {boolean}
 */
function isBuildForbiddenSession(metadata) {
  const md = metadata || {};
  // SD-LEO-INFRA-FIX-SESSION-REGISTER-001 (RCA 2026-07-12): every legitimate
  // non_fleet writer (adam-register.cjs, solomon-register.cjs) co-writes a
  // `role` key. A bare non_fleet:true with no role is the exact fingerprint
  // of the ad-hoc metadata-REPLACE clobber this SD investigated — log it as
  // an anomaly so it's visible, but still honor the fail-closed block (do
  // not hard-flip to ignoring it; that would trade an availability bug for
  // a possible authorization gap).
  if (md.non_fleet === true && !md.role) {
    console.warn('[isBuildForbiddenSession] ANOMALY: non_fleet:true with no role key -- likely a corrupted/mis-targeted metadata write. Still honoring fail-closed block. See SD-LEO-INFRA-FIX-SESSION-REGISTER-001.');
  }
  return md.non_fleet === true || md.role === 'adam' || md.is_coordinator === true;
}

module.exports = { isBuildForbiddenSession };

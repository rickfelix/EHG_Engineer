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
 * @param {object|null} metadata - claude_sessions.metadata
 * @returns {boolean}
 */
function isBuildForbiddenSession(metadata) {
  const md = metadata || {};
  return md.non_fleet === true || md.role === 'adam';
}

module.exports = { isBuildForbiddenSession };

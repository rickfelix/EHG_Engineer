// Claim-identity resolver — SD-LEO-INFRA-CLAIM-IDENTITY-INTEGRITY-001 (FR-1).
//
// Claim identity is the spine of fleet accounting (liveness, displacement,
// revival targeting, the fence predicate all key on claiming_session_id), so a
// claim must ALWAYS carry the acting session's env identity when one exists.
// The live defect: under 8+ concurrent sessions in the shared root, the shared
// pointer file is last-writer-wins — identity derived from it attributed one
// session's claim to a DIFFERENT live session (coordinator ask 5655cb68;
// witnessed twice more while building this fix).
//
// Precedence (explicit-never-silent):
//   1. CLAUDE_SESSION_ID env — per-process, race-free. source: 'env'.
//   2. Shared pointer (.claude/session-identity/current) ONLY when env is
//      absent — LOUD (console.warn) and audited: callers must stamp
//      identity_source on the claim so misattribution is queryable.
//      source: 'pointer_fallback'.
//   3. Neither -> { sessionId: null, source: 'none' } — the caller decides
//      whether to fail or register a fresh identity; this module never guesses.

import { readCurrentPointer } from '../session-identity-sot.js';

/**
 * @param {object} [env=process.env]
 * @param {{repoRoot?: string, warn?: (msg: string) => void}} [opts]
 * @returns {{sessionId: string|null, source: 'env'|'pointer_fallback'|'none'}}
 */
export function resolveClaimIdentity(env = process.env, opts = {}) {
  const warn = opts.warn ?? console.warn;
  const envId = typeof env?.CLAUDE_SESSION_ID === 'string' && env.CLAUDE_SESSION_ID.trim().length > 0
    ? env.CLAUDE_SESSION_ID.trim()
    : null;
  if (envId) return { sessionId: envId, source: 'env' };

  let pointerId = null;
  try {
    pointerId = readCurrentPointer(opts.repoRoot) || null;
  } catch {
    pointerId = null;
  }
  if (pointerId) {
    warn(`[claim-identity] CLAUDE_SESSION_ID absent — falling back to the SHARED pointer (${pointerId}). ` +
      'This is last-writer-wins under concurrency; the claim will be stamped identity_source=pointer_fallback.');
    return { sessionId: pointerId, source: 'pointer_fallback' };
  }
  return { sessionId: null, source: 'none' };
}

/**
 * FR-2 guard predicate: does an adopted session row CONTRADICT the caller's
 * env identity? Contradiction only — absence of env identity is not a
 * conflict (pointer/registered flows stay valid for env-less human runs).
 *
 * @param {{session_id?: string}|null} sessionRow
 * @param {{sessionId: string|null, source: string}} identity - resolveClaimIdentity() result
 * @returns {{mismatch: boolean, envId?: string, adoptedId?: string}}
 */
export function checkIdentityMismatch(sessionRow, identity) {
  if (!sessionRow?.session_id || identity.source !== 'env' || !identity.sessionId) {
    return { mismatch: false };
  }
  if (sessionRow.session_id === identity.sessionId) return { mismatch: false };
  return { mismatch: true, envId: identity.sessionId, adoptedId: sessionRow.session_id };
}

export default { resolveClaimIdentity, checkIdentityMismatch };

// Actor-identity threading for the two shared DB-client factories
// (SD-LEO-INFRA-AUDIT-ACTOR-THREADING-001). Reuses lib/claim/claim-identity.js's
// resolveClaimIdentity() -- this is NOT a new identity resolver, just a role-tag
// fallback layered on top of its 'none' case (no CLAUDE_SESSION_ID env, no shared
// pointer file), so a non-interactive run (cron, CI) still carries an attributable
// tag instead of resolving to nothing.
//
// DELIBERATELY DISCARDS resolveClaimIdentity's pointer_fallback tier (regression-agent
// finding, SD-LEO-INFRA-AUDIT-ACTOR-THREADING-001 VERIFY phase). That tier is documented
// as last-writer-wins under concurrency -- an acceptable approximation for CLAIM tracking,
// where a stale guess is corrected on the next heartbeat, but wrong for AUDIT attribution:
// a wrong-but-specific session uuid on an audit_log row reads as trustworthy and actively
// misleads an investigator, which is worse than the honest, clearly-generic session_user
// fallback (postgres/authenticator) this SD already improves on. So here, only 'env' counts
// as a real identity; pointer_fallback is treated exactly like 'none'. warn is always
// suppressed (passed as a no-op) so resolveClaimIdentity's pointer read -- which we are
// about to discard anyway -- never emits its "will be stamped identity_source=..." log line
// on every single DB-client construction across this pair's ~1000 combined importers.

import { resolveClaimIdentity } from './claim/claim-identity.js';

/**
 * @param {object} [env=process.env]
 * @param {{repoRoot?: string}} [opts]
 * @returns {{actorId: string|null, source: 'env'|'role_tag_fallback'|'none'}}
 */
export function resolveActorIdentity(env = process.env, opts = {}) {
  const claimed = resolveClaimIdentity(env, { ...opts, warn: () => {} });
  if (claimed.source === 'env' && claimed.sessionId) {
    return { actorId: claimed.sessionId, source: 'env' };
  }

  const roleTag = typeof env?.LEO_ACTOR_ROLE_TAG === 'string' && env.LEO_ACTOR_ROLE_TAG.trim().length > 0
    ? env.LEO_ACTOR_ROLE_TAG.trim()
    : null;
  if (roleTag) return { actorId: `role:${roleTag}`, source: 'role_tag_fallback' };

  return { actorId: null, source: 'none' };
}

/**
 * Merge an x-actor-session header into a supabase-js `global` options object
 * without clobbering a caller-supplied header of the same name or other
 * caller-supplied global options (e.g. a custom `fetch`).
 *
 * @param {{headers?: Record<string,string>}|undefined} globalOptions
 * @param {string|null} actorId
 * @returns {object|undefined}
 */
export function withActorHeader(globalOptions, actorId) {
  if (!actorId) return globalOptions;
  return {
    ...globalOptions,
    headers: { 'x-actor-session': actorId, ...(globalOptions?.headers || {}) },
  };
}

export default { resolveActorIdentity, withActorHeader };

/**
 * coordinator-mutation-guard.mjs — SD-LEO-INFRA-ROLE-SESSION-HANDOFF-PROTOCOL-001-B / FR-1+FR-2
 *
 * Single-writer mutation guard for coordinator-owned duties.
 * A lingering NON-canonical coordinator session must not double-act on
 * mutating coordinator duties. Call assertCanonicalCoordinator (or the
 * convenience wrapper guardMutation) at the top of any mutating coordinator
 * duty daemon before writing.
 *
 * Posture:
 *   - Fail-CLOSED only when the resolver returns a DIFFERENT, non-empty session_id.
 *   - Fail-OPEN on throw / null / no session_id — never brick the only live coordinator.
 *   - Guard is READ-ONLY (zero writes of its own).
 */

import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { getActiveCoordinatorId } = require('./coordinator/resolve.cjs');

// The on-disk session pointer the coordinator already maintains. Absolute, resolved
// from this module's location so it is stable regardless of the daemon's cwd.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SESSION_ID_FILE = path.resolve(__dirname, '../.claude/session-id.json');

/**
 * resolveOwnSessionId — best-effort resolution of THIS process's session id.
 *
 * Order: process.env.CLAUDE_SESSION_ID (set inside a live coordinator session)
 *        → .claude/session-id.json `.session_id` (read fail-safe; the on-disk pointer
 *          the coordinator already maintains, reliable when a daemon/cron runs out-of-band
 *          with an empty env var)
 *        → null (guard then fail-opens on a missing id — see assertCanonicalCoordinator).
 *
 * Finding 1 (SD-LEO-INFRA-ROLE-SESSION-HANDOFF-PROTOCOL-001-B): a bare
 * process.env.CLAUDE_SESSION_ID can be empty when a script runs out-of-band, which would
 * silently fail-open and let a rogue OLD coordinator's daemon keep mutating. The disk
 * pointer recovers the real id so the guard can correctly BLOCK the rogue.
 *
 * @param {string} [file]  Pointer file path (test injectability; defaults to SESSION_ID_FILE)
 * @returns {string|null}
 */
export function resolveOwnSessionId(file = SESSION_ID_FILE) {
  const fromEnv = process.env.CLAUDE_SESSION_ID;
  if (fromEnv) return fromEnv;
  try {
    if (!fs.existsSync(file)) return null;
    const raw = fs.readFileSync(file, 'utf8');
    const data = JSON.parse(raw);
    if (data && typeof data.session_id === 'string' && data.session_id) return data.session_id;
    return null;
  } catch {
    return null; // fail-safe: any read/parse error → null (guard fail-opens, never throws)
  }
}

/**
 * assertCanonicalCoordinator — check whether `sessionId` is the canonical coordinator.
 *
 * @param {object} supabase    Supabase client (may be null — triggers fail-open)
 * @param {string|null} sessionId  The running session's id (process.env.CLAUDE_SESSION_ID)
 * @param {object} [opts]      Options; opts._getCanonicalId injects a test resolver seam
 * @returns {Promise<{allowed: boolean, canonical_session_id: string|null, reason: string}>}
 */
export async function assertCanonicalCoordinator(supabase, sessionId, opts = {}) {
  // No session_id → cannot identify ourselves → fail-open (don't block what we can't identity-check)
  if (!sessionId) {
    return { allowed: true, canonical_session_id: null, reason: 'no_session_id_fail_open' };
  }

  // opts._getCanonicalId is a test seam: inject a stub to avoid real CJS require resolution in tests.
  const resolverFn = (opts && typeof opts._getCanonicalId === 'function')
    ? opts._getCanonicalId
    : getActiveCoordinatorId;

  let canonical;
  try {
    canonical = await resolverFn(supabase);
  } catch {
    // Resolver threw → fail-open (never brick the only live coordinator on an error)
    return { allowed: true, canonical_session_id: null, reason: 'resolver_error_fail_open' };
  }

  // Resolver returned null/falsy (transient blip, no canonical found) → fail-open
  if (!canonical) {
    return { allowed: true, canonical_session_id: null, reason: 'resolver_null_fail_open' };
  }

  // This session IS the canonical coordinator → allow
  if (canonical === sessionId) {
    return { allowed: true, canonical_session_id: canonical, reason: 'canonical' };
  }

  // A DIFFERENT, non-empty canonical session was found → block this rogue session
  return { allowed: false, canonical_session_id: canonical, reason: 'not_canonical' };
}

/**
 * guardMutation — convenience wrapper for daemon entry points.
 *
 * Calls assertCanonicalCoordinator; when the verdict is !allowed, emits a
 * structured console.warn so operators can audit rogue-session skips, then
 * returns the verdict. The daemon should early-return on !allowed.
 *
 * @param {object} supabase
 * @param {string|null} sessionId
 * @param {string} dutyLabel   Human-readable label for the duty being guarded (logged on block)
 * @param {object} [opts]
 * @returns {Promise<{allowed: boolean, canonical_session_id: string|null, reason: string}>}
 */
export async function guardMutation(supabase, sessionId, dutyLabel, opts = {}) {
  const verdict = await assertCanonicalCoordinator(supabase, sessionId, opts);
  if (!verdict.allowed) {
    console.warn(
      `[COORD_MUTATION_BLOCKED] ${dutyLabel}: ` +
      `this session ${sessionId} is not the canonical coordinator ` +
      `(${verdict.canonical_session_id}); skipping mutation`
    );
  }
  return verdict;
}

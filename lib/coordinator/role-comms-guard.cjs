'use strict';
/**
 * role-comms-guard.cjs — QF-20260719-387 (chairman-directed after live misroute d442d8ec:
 * Adam ran scripts/solomon-advisory.cjs send from the Adam session, so an Adam->Solomon
 * proposal silently applied Solomon's routing defaults and landed on the coordinator lane).
 *
 * Two FAIL-CLOSED checks shared by the adam-advisory.cjs / solomon-advisory.cjs send+request
 * chokes — a blocked send is recoverable, a misroute is not:
 *
 *  1. SENDER-ROLE GUARD (assertSenderRole): the invoking session's registered role
 *     (claude_sessions.metadata->>role, session_id from CLAUDE_SESSION_ID) must match the
 *     tool's owner role; the error names the correct tool for the caller's actual role.
 *  2. TARGET-ROLE ASSERT (assertTargetRole): after target resolution, the resolved target
 *     session's registered role is read back and must match the intended recipient class;
 *     success prints "target-role verified: <role> <session>" so every send output carries
 *     the verification. Broadcast sentinels (broadcast-*) have no live session and are
 *     reported as buffered sentinels, not role-verified.
 *
 * Role-resolution errors (DB error, session not found) hard-error with exit 4.
 * Pure decision helpers are exported separately so the policy is unit-testable without exits.
 */

const ROLE_TOOL = Object.freeze({
  solomon: 'scripts/solomon-advisory.cjs',
  adam: 'scripts/adam-advisory.cjs',
  coordinator: 'the coordinator reply lane (scripts/coordinator-reply.cjs)',
});

/** Name the correct outbound tool for a caller's registered role (workers -> /signal lane). */
function toolForRole(role) {
  return ROLE_TOOL[role] || 'scripts/worker-signal.cjs (the worker /signal lane)';
}

/**
 * Resolve a session's registered role from claude_sessions.
 * Keyed on the session_id COLUMN (not id — the two differ; see claims/dispatch gotchas).
 * Multiple rows per session_id can exist across re-registrations: newest heartbeat wins.
 *
 * Effective role = metadata.role, else 'coordinator' when metadata.is_coordinator is set:
 * the coordinator ELECTION discriminator is is_coordinator (lib/coordinator/resolve.cjs
 * electCoordinatorFromDb), and the live coordinator row verifiably carries is_coordinator
 * WITHOUT a role field (registration lapse during long inline hosting) — a strict
 * role==='coordinator' read would false-block the entire default relay lane.
 *
 * THROWS on DB error or unknown session — callers decide fail-closed handling.
 * @returns {Promise<string|null>} effective role, or null when registered without one
 */
async function resolveSessionRole(supabase, sessionId) {
  if (!sessionId) throw new Error('no session id provided');
  const { data, error } = await supabase
    .from('claude_sessions')
    .select('session_id, heartbeat_at, metadata')
    .eq('session_id', sessionId)
    .order('heartbeat_at', { ascending: false })
    .limit(1);
  if (error) throw new Error(`role lookup failed for ${sessionId}: ${error.message}`);
  if (!Array.isArray(data) || data.length === 0) throw new Error(`session ${sessionId} not found in claude_sessions`);
  const meta = data[0].metadata || {};
  if (meta.role) return meta.role;
  if (meta.is_coordinator === true || meta.is_coordinator === 'true') return 'coordinator';
  return null;
}

/** PURE sender-role decision. @returns {{ok: boolean, message?: string}} */
function checkSenderRole({ actualRole, requiredRole, toolName }) {
  if (actualRole === requiredRole) return { ok: true };
  return {
    ok: false,
    message: `${toolName} is the ${requiredRole} outbound lane, but this session's registered role is "${actualRole || 'unregistered'}". Use ${toolForRole(actualRole)} instead.`,
  };
}

/** PURE target-role decision. @returns {{ok: boolean, message?: string}} */
function checkTargetRole({ actualRole, expectedRole, target }) {
  if (actualRole === expectedRole) return { ok: true };
  return {
    ok: false,
    message: `resolved target ${target} has registered role "${actualRole || 'unregistered'}" but this send intends the ${expectedRole} lane — refusing (misroute).`,
  };
}

/** Sender-role guard at the send choke. Hard-errors (exit 4) on mismatch or resolution failure. */
async function assertSenderRole(supabase, { sessionId, requiredRole, toolName }) {
  let actualRole;
  try {
    actualRole = await resolveSessionRole(supabase, sessionId);
  } catch (e) {
    console.error(`ERROR: [ROLE_GUARD] cannot verify sender role (fail-closed): ${e.message}`);
    process.exit(4);
  }
  const verdict = checkSenderRole({ actualRole, requiredRole, toolName });
  if (!verdict.ok) {
    console.error(`ERROR: [ROLE_GUARD] ${verdict.message}`);
    process.exit(4);
  }
}

/**
 * Target-role assert after target resolution. Hard-errors (exit 4) on mismatch or resolution
 * failure; prints the verification line on success. Sentinel targets (broadcast-*) are buffered
 * rows with no live session — reported, not role-verified. A direct raw-session target (R1,
 * expectedRole=null) gets a best-effort informational print only: R1 exists precisely to address
 * arbitrary sessions, so no recipient class is enforced there.
 */
async function assertTargetRole(supabase, { target, expectedRole }) {
  if (typeof target === 'string' && target.startsWith('broadcast-')) {
    console.log(`  target-role verified: ${target} (buffered sentinel — no live session)`);
    return;
  }
  let actualRole;
  try {
    actualRole = await resolveSessionRole(supabase, target);
  } catch (e) {
    if (expectedRole === null) { console.log(`  target-role: (direct target ${target} — role unresolved: ${e.message})`); return; }
    console.error(`ERROR: [ROLE_GUARD] cannot verify target role (fail-closed): ${e.message}`);
    process.exit(4);
  }
  if (expectedRole === null) {
    console.log(`  target-role verified: ${actualRole || 'unregistered'} ${target} (direct target — no class constraint)`);
    return;
  }
  const verdict = checkTargetRole({ actualRole, expectedRole, target });
  if (!verdict.ok) {
    console.error(`ERROR: [ROLE_GUARD] ${verdict.message}`);
    process.exit(4);
  }
  console.log(`  target-role verified: ${actualRole} ${target}`);
}

module.exports = { resolveSessionRole, checkSenderRole, checkTargetRole, assertSenderRole, assertTargetRole, toolForRole };

// SD-LEO-INFRA-ROLE-SESSION-NAMING-001: stable status-line NAME for role-sessions (Adam,
// Coordinator, future Solomon). Workers get a NATO callsign from the claim-gated 8-name pool
// (worker-checkin → SET_IDENTITY → coordination-inbox writes .claude/fleet-identity-<csid>.json →
// .claude/statusline.cjs renders it). Role-sessions are non_fleet and never hold a claim, so they
// never draw a callsign and show NO name. This writes the same per-session identity file directly
// at role startup, with a stable role name — no statusline change required.
//
// ROLE-AGNOSTIC / Solomon-inheritable: add a ROLE_IDENTITY entry + one writeRoleStatusIdentity call
// in the new role's startup and it inherits naming.

const fs = require('fs');
const path = require('path');

// repo-root/.claude (mirrors coordination-inbox.cjs IDENTITY_DIR and statusline.cjs read path).
const IDENTITY_DIR = path.resolve(__dirname, '../../.claude');

// Colors MUST be in .claude/statusline.cjs's FC map: red/blue/green/yellow/purple/orange/pink/cyan.
// Role names are OUTSIDE the NATO worker callsign set, so they never collide with the worker pool.
const ROLE_IDENTITY = Object.freeze({
  adam: { callsign: 'Adam', color: 'cyan' },
  coordinator: { callsign: 'Coordinator', color: 'purple' },
  solomon: { callsign: 'Solomon', color: 'orange' },
});

// Mirrors the coordination-inbox.cjs M4 path-traversal guard.
const SESSION_ID_RE = /^[a-zA-Z0-9_-]{1,128}$/;

/** Stable identity for a role name (case-insensitive); null for an unknown role. */
function roleIdentityFor(role) {
  return ROLE_IDENTITY[String(role || '').trim().toLowerCase()] || null;
}

/**
 * Write the per-session status-line identity file for a role-session, so .claude/statusline.cjs
 * renders the role's stable name. Fail-soft: returns false (never throws) on an unknown role, an
 * invalid/missing sessionId, or any fs error — a naming failure must never block role startup.
 * @param {object} o
 * @param {string} o.sessionId  the role session's CLAUDE_SESSION_ID
 * @param {string} o.role       'adam' | 'coordinator' | 'solomon'
 * @param {string} [o.nowIso]   injectable timestamp (defaults to now)
 * @param {string} [o.dir]      identity dir (defaults to repo-root/.claude); injectable for tests
 * @returns {boolean} true iff the file was written
 */
function writeRoleStatusIdentity({ sessionId, role, nowIso, dir = IDENTITY_DIR } = {}) {
  const id = roleIdentityFor(role);
  if (!id) return false;
  if (typeof sessionId !== 'string' || !SESSION_ID_RE.test(sessionId)) return false;
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, `fleet-identity-${sessionId}.json`),
      JSON.stringify({
        color: id.color,
        callsign: id.callsign,
        display_name: id.callsign,
        role: true,
        assigned_at: nowIso || new Date().toISOString(),
      }),
    );
    return true;
  } catch {
    return false;
  }
}

module.exports = { ROLE_IDENTITY, roleIdentityFor, writeRoleStatusIdentity, IDENTITY_DIR };

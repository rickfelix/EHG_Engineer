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

// ─────────────────────────────────────────────────────────────────────────────────────────────
// SD-LEO-INFRA-ROLE-BLIND-SESSION-001 FR-1 — the ONE shared role predicate.
//
// Three defects on 2026-08-03 (stop hook, SessionStart, SET_IDENTITY) shared one missing check:
// session plumbing applied WORKER machinery without ever reading metadata.role. The fix is a
// single predicate consumed by all three sites — deliberately not three fixes, because per-site
// role logic is exactly the three-writers-one-guarded shape that produced the defect.
//
// WHY THREE-STATE AND NOT A BOOLEAN. `false` and "I could not find out" are different facts, and
// collapsing them reproduces the bug one layer down: a hook with no DB reach would read UNKNOWN as
// "not a role session" and apply worker doctrine to a role seat, which is the behaviour being
// removed. Callers must decide explicitly what to do with UNKNOWN.
//
// THE FILE FALLBACK ALREADY EXISTS. writeRoleStatusIdentity above writes `role: true` into
// .claude/fleet-identity-<sessionId>.json at role startup (see :56). That IS the hook-context
// signal — no second marker is introduced here. Adding one would create a fourth place the role
// lives, in the SD about the role not being read consistently.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** @enum {string} */
const ROLE_VERDICT = Object.freeze({ ROLE: 'role', WORKER: 'worker', UNKNOWN: 'unknown' });

/** Pure: classify a claude_sessions.metadata object. Exported so the DB shape is testable alone. */
function verdictFromMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') return ROLE_VERDICT.UNKNOWN;
  // non_fleet is authoritative on its own. The SD's Solomon amendment says the class fires on ANY
  // `role=*/non_fleet=true` seat, so a seat that declares itself non-fleet is a role seat even if
  // its role string is one this module has never heard of.
  if (metadata.non_fleet === true) return ROLE_VERDICT.ROLE;

  const raw = metadata.role;
  // An ABSENT role key is a genuine worker signal: every role seat sets it at startup. An empty
  // or non-string value is NOT — that is a malformed row, and guessing "worker" from malformed
  // data is the same collapse this predicate exists to prevent.
  if (raw === undefined || raw === null) return ROLE_VERDICT.WORKER;
  if (typeof raw !== 'string' || !raw.trim()) return ROLE_VERDICT.UNKNOWN;
  return isRoleName(raw) ? ROLE_VERDICT.ROLE : ROLE_VERDICT.WORKER;
}

/**
 * Is this role STRING a role seat — including lifecycle variants of a known role?
 *
 * FOUND BY A REAL INVOCATION, NOT BY A TEST. Running the actual hook against live sessions showed
 * a heartbeating `role=adam_retired` seat being told `[ROLE] WORKER (callsign: Adam)` — this SD's
 * own defect, surviving for a role variant the naming map does not contain. No unit test with
 * fixtures I chose would have tried that string, because I would have picked the roles I already
 * knew about.
 *
 * The PREDICATE is deliberately wider than ROLE_IDENTITY. That map exists to give a seat a
 * status-line NAME, and a retired seat may legitimately have no name; but it is still not a fleet
 * worker, and telling it to push WIP on a claim-bound branch is still wrong. Family match on
 * `<known>_<suffix>` rather than "any non-empty string" so `role: 'gardener'` stays WORKER — an
 * unrecognised role is a real answer, not a lifecycle variant.
 */
function isRoleName(raw) {
  const v = String(raw || '').trim().toLowerCase();
  if (!v) return false;
  if (ROLE_IDENTITY[v]) return true;
  return Object.keys(ROLE_IDENTITY).some((known) => v.startsWith(`${known}_`));
}

/** Pure: classify the on-disk identity file contents. */
function verdictFromIdentityFile(parsed) {
  if (!parsed || typeof parsed !== 'object') return ROLE_VERDICT.UNKNOWN;
  // Only `role === true` is affirmative. A worker's identity file simply lacks the key, which is
  // indistinguishable from a truncated write — so absence here is UNKNOWN, not WORKER. The DB is
  // the authority for "this is a worker"; the file can only ever confirm "this is a role".
  return parsed.role === true ? ROLE_VERDICT.ROLE : ROLE_VERDICT.UNKNOWN;
}

/** Read the local identity file for a session, or null. Never throws. */
function readIdentityFile(sessionId, dir = IDENTITY_DIR) {
  if (typeof sessionId !== 'string' || !SESSION_ID_RE.test(sessionId)) return null;
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, `fleet-identity-${sessionId}.json`), 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Is this session a role-session (adam | coordinator | solomon)?
 *
 * DB first (claude_sessions.metadata.role is authoritative), identity file as the fallback for
 * hook contexts with no DB reach. Returns a ROLE_VERDICT — never a bare boolean, so a caller
 * cannot accidentally treat "could not look" as "not a role".
 *
 * @param {object} o
 * @param {string} o.sessionId
 * @param {object} [o.supabase]  optional; omit in hook contexts to force the file path
 * @param {string} [o.dir]       identity dir override, for tests
 * @returns {Promise<'role'|'worker'|'unknown'>}
 */
async function roleVerdictFor({ sessionId, supabase, dir = IDENTITY_DIR } = {}) {
  if (typeof sessionId !== 'string' || !SESSION_ID_RE.test(sessionId)) return ROLE_VERDICT.UNKNOWN;

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('claude_sessions').select('metadata').eq('session_id', sessionId).maybeSingle();
      // A query ERROR is not "no role" — fall through to the file rather than answering from a
      // failed read. A missing ROW, however, is a real answer only if the file also says nothing.
      if (!error && data) {
        const v = verdictFromMetadata(data.metadata);
        if (v !== ROLE_VERDICT.UNKNOWN) return v;
      }
    } catch { /* fall through to the file */ }
  }

  const fileVerdict = verdictFromIdentityFile(readIdentityFile(sessionId, dir));
  return fileVerdict === ROLE_VERDICT.ROLE ? ROLE_VERDICT.ROLE : ROLE_VERDICT.UNKNOWN;
}

/**
 * Convenience for the three fix sites: should worker machinery apply to this session?
 *
 * UNKNOWN maps to TRUE (apply worker machinery) — deliberately fail-loud rather than fail-quiet.
 * A role seat that wrongly gets a worker banner is noise someone reports; a worker seat that
 * wrongly loses its stop-hook guard goes incognito and strands a claim. The SD is explicit that a
 * fix quieting a worker guard is worse than the noise it removes, so the ambiguous case keeps the
 * guard. Callers needing to distinguish should use roleVerdictFor directly.
 */
async function shouldApplyWorkerMachinery(opts) {
  return (await roleVerdictFor(opts)) !== ROLE_VERDICT.ROLE;
}

module.exports = {
  ROLE_IDENTITY, roleIdentityFor, writeRoleStatusIdentity, IDENTITY_DIR,
  ROLE_VERDICT, verdictFromMetadata, verdictFromIdentityFile, readIdentityFile, isRoleName,
  roleVerdictFor, shouldApplyWorkerMachinery,
};

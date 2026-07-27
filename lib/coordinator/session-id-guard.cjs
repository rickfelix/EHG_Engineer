'use strict';
/**
 * session-id-guard.cjs — QF-20260727-862 (silent signal misroute to the nil UUID)
 *
 * WITNESSED INCIDENT (2026-07-27 02:00–02:03 UTC): a claude_sessions ghost row keyed on the
 * all-zero "nil" UUID was flagged by set_coordinator_flag + set_solomon_flag. No process has ever
 * backed that row (pid, terminal_id and last_tool_at are all NULL), but it carried the FRESHEST
 * coordinator_since, so it WON the canonical `coordinator_since DESC` election and DEPOSED the live
 * coordinator — and separately outranked the real Solomon session. For the next ~2 minutes every
 * worker's getActiveCoordinatorId() returned the nil UUID and worker-signal.cjs wrote signals there.
 * Three real signals (2 critical) were lost this way. The writes SUCCEEDED, so nothing errored and
 * nothing carried a dead_letter stamp: the misroute was invisible to sender and recipient alike.
 * The row was neutralized BY HAND; nothing in code prevented it, or would prevent a recurrence.
 *
 * WHY A GUARD AND NOT A NULL-CHECK: the nil UUID defeats every existing validation because it is a
 * well-formed, non-empty, correctly-shaped UUID string — `!sessionId || typeof sessionId !== 'string'`
 * passes it straight through. It is also the WORST possible value to let through the election, because
 * '00000000-…' sorts FIRST in the `session_id ASC` tiebreak both elections use, so a nil-UUID candidate
 * beats every real session whenever `*_since` ties or is absent.
 *
 * The nil UUID is never a real session: it is what a null/absent CLAUDE_SESSION_ID degrades into when
 * it reaches a uuid-typed column. Treat it as an ABSENT identity everywhere — refuse to write a role
 * flag onto it, and refuse to elect it even if a ghost row already carries one (the DB still holds the
 * 2026-06-23 row from this incident, so the read-side guard is load-bearing, not merely defensive).
 */

/** The all-zero RFC-4122 "nil" UUID — a sentinel for "no identity", never a live session. */
const NIL_UUID = '00000000-0000-0000-0000-000000000000';

/**
 * True when `id` is the nil UUID (or a non-string/blank stand-in for an absent identity).
 * Case- and whitespace-insensitive: PostgREST and hand-written SQL both round-trip uppercase.
 * PURE — no I/O, safe to call on every resolution.
 * @param {unknown} id
 * @returns {boolean}
 */
function isNilUuid(id) {
  if (typeof id !== 'string') return false;
  return id.trim().toLowerCase() === NIL_UUID;
}

/**
 * True when `id` is usable as a role-session identity: a non-blank string that is not the nil UUID.
 * PURE. Use at identity WRITE-paths (refuse) and election READ-paths (skip the candidate).
 * @param {unknown} id
 * @returns {boolean}
 */
function isUsableSessionId(id) {
  return typeof id === 'string' && id.trim() !== '' && !isNilUuid(id);
}

module.exports = { NIL_UUID, isNilUuid, isUsableSessionId };

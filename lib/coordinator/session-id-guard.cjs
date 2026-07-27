'use strict';
/**
 * session-id-guard.cjs — QF-20260727-862 (silent signal misroute to the nil UUID)
 *
 * On 2026-07-27 an unbacked `claude_sessions` ghost row keyed on the all-zero "nil" UUID was flagged
 * as coordinator, WON the `coordinator_since DESC` election, deposed the live coordinator, and
 * silently swallowed three worker signals (2 critical). The inserts succeeded and carried no
 * dead_letter stamp, so the loss was invisible to sender and recipient alike. Full incident writeup:
 * commit message + PR for QF-20260727-862.
 *
 * The nil UUID defeats every `typeof === 'string'` check because it IS a well-formed non-empty UUID,
 * and it sorts FIRST in the `session_id ASC` election tiebreak — so it beats every real session on a
 * tie. It is never a real session: it is what a null/absent CLAUDE_SESSION_ID degrades into on a
 * uuid-typed column. Treat it as an ABSENT identity — refuse to write a role flag onto it, and refuse
 * to elect it even if a ghost row already carries one (that row is still in the DB, so the read-side
 * guard is load-bearing, not merely defensive).
 */

/** The all-zero RFC-4122 "nil" UUID — a sentinel for "no identity", never a live session. */
const NIL_UUID = '00000000-0000-0000-0000-000000000000';

/** True when `id` is the nil UUID. Case/whitespace-insensitive (SQL round-trips uppercase). PURE. */
function isNilUuid(id) {
  if (typeof id !== 'string') return false;
  return id.trim().toLowerCase() === NIL_UUID;
}

/** True when `id` is usable as a role-session identity: non-blank string, not the nil UUID. PURE. */
function isUsableSessionId(id) {
  return typeof id === 'string' && id.trim() !== '' && !isNilUuid(id);
}

module.exports = { NIL_UUID, isNilUuid, isUsableSessionId };

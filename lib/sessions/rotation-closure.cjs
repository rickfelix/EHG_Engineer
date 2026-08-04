// SD-LEO-INFRA-SESSION-TICK-DAEMONS-001 FR-1 — which prior session rows a rotation closes.
//
// THE DEFECT. /clear (and compaction resume) rotates the conversation to a NEW session_id while
// the Claude Code process survives. session-tick.cjs has exactly two exits: parent-PID death
// (:181, which DELIBERATELY survives /clear) and the 0-row PATCH self-exit once the row reaches
// status='released' (:350). Nothing flips either at rotation, so the old daemon is immortal and
// stamps BOTH heartbeat_at and process_alive_at every 30s for a conversation that can never act
// again. Verified live at LEAD: b22451df was still heartbeat-fresh with last_tool_at ~2 days stale.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS PREDICATE READS NO CLOCK, AND WHY THAT IS THE WHOLE DESIGN
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// A PARKED /loop worker and a ROTATED-OUT session are indistinguishable by activity: neither is
// using tools, neither is advancing last_tool_at, and both can sit quiet for many minutes. Any
// predicate of the form "no activity for N minutes" therefore closes both.
//
// session-tick.cjs:181-184 records what that costs, verbatim: removing PID rediscovery
// "re-breaks parked workers and trades false-life for false-death — the seam all five prior
// attempts at this defect fell down."
//
// So the trigger is the ROTATION EVENT, which is a thing that HAPPENED and is known exactly when
// it happens. A parked worker is excluded STRUCTURALLY rather than carefully: it has not rotated,
// so its session_id still matches the current one, so it is never selected. There is no threshold
// to tune and no window to get wrong.
//
// The host hook matters for the same reason. SessionStart fires on /clear and on compaction resume
// (both ROTATE the id) and does NOT fire when a ScheduleWakeup tick resumes an already-running
// session — see the header of scripts/hooks/loop-state-resume-clear.cjs, which documents that as a
// defect for loop_state. Read the other way it is the guarantee this FR needs: a SessionStart-hosted
// closure sees every rotation and never sees a parked worker waking up.

/** Statuses a row can hold and still be worth closing. Terminal rows are left alone. */
const TERMINAL_STATUSES = Object.freeze(['released', 'exited', 'killed', 'reaped']);

/**
 * Pure. Which prior rows does this rotation close?
 *
 * @param {object} o
 * @param {string} o.currentSessionId  the session id SessionStart just registered
 * @param {number|string} o.parentPid  cc_parent_pid of the surviving Claude Code process
 * @param {Array<{session_id:string, cc_parent_pid:*, status:string}>} o.rows  candidate rows
 * @returns {Array<string>} session_ids to mark released
 */
function sessionsToClose({ currentSessionId, parentPid, rows } = {}) {
  if (!currentSessionId || parentPid === undefined || parentPid === null) return [];
  if (!Array.isArray(rows)) return [];
  const pid = String(parentPid);
  return rows
    .filter((r) => r && String(r.cc_parent_pid) === pid)     // same surviving CC process
    .filter((r) => r.session_id && r.session_id !== currentSessionId)  // ROTATED OUT — the whole test
    .filter((r) => !TERMINAL_STATUSES.includes(String(r.status || '').toLowerCase()))
    .map((r) => r.session_id);
}

module.exports = { sessionsToClose, TERMINAL_STATUSES };

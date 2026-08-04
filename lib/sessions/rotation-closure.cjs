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

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// WHERE cc_parent_pid ACTUALLY LIVES, AND WHY THE WIRING READS FILES INSTEAD OF THE TABLE
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The EXEC handoff for this FR said to fetch rows WHERE cc_parent_pid = process.ppid. Both halves
// of that are wrong, and both were caught by measuring rather than by reading:
//
//   1. `cc_parent_pid` IS NOT A COLUMN on claude_sessions. Probed live: PostgREST answers
//      "column claude_sessions.cc_parent_pid does not exist". It exists ONLY on the tick marker
//      .claude/pids/tick-<sid>.json (session-tick.cjs:99) and inside event payloads. This one
//      fails LOUD, which is the only reason it did not ship silently.
//   2. `process.ppid || process.pid` is the DEGRADED FALLBACK, not the canonical derivation.
//      capture-session-id.cjs:492-495 — the process that WRITES the marker — uses
//      findClaudeCodePid() and logs outcome:'degraded' when it has to fall back to ppid. Joining
//      on ppid would therefore MISS every marker written the normal way, and would have failed
//      SILENTLY: zero rows closed, FR looks wired, defect fully intact.
//
// The obvious substitute is claude_sessions.tty, which this very hook writes as `win-<ppid>`.
// MEASURED AND REJECTED: across all 12,914 rows on this host, tty has a degenerate bucket —
// 'unknown' holds 3,582 sessions, 3,228 of them non-terminal, belonging to unrelated processes.
// Keying closure on tty would mass-release the entire host's live fleet on one hook run. That is
// the false-death outage this SD exists to avoid, reached by a different door.
//
// So the join key is the marker file, which is the artifact that ties a pid to a session
// (session-tick.cjs:579 calls it exactly that). It is also SELF-CLEANING: the daemon unlinks its
// marker on exit (session-tick.cjs:110), so a marker naming a dead pid means a HARD-KILLED daemon,
// not ordinary accumulation. That bounds the only residual false-positive — Windows pid recycling
// handing a stale marker our pid — to a window that requires both a hard kill and a recycle.

const fs = require('fs');
const path = require('path');

/** Statuses a row can hold and still be worth closing. Terminal rows are left alone. */
const TERMINAL_STATUSES = Object.freeze(['released', 'exited', 'killed', 'reaped']);

/**
 * Read .claude/pids/tick-*.json and return session_id -> cc_parent_pid.
 *
 * Pure apart from the directory read. Every per-file failure is skipped rather than thrown: a
 * half-written marker (the writer is not atomic) must not take out SessionStart.
 *
 * @param {string} pidsDir
 * @returns {Map<string, number|string>}
 */
function readTickMarkers(pidsDir) {
  const out = new Map();
  let files;
  try {
    files = fs.readdirSync(pidsDir);
  } catch {
    return out; // no marker dir yet — nothing has ticked on this host
  }
  for (const f of files) {
    if (!f.startsWith('tick-') || !f.endsWith('.json')) continue;
    try {
      const m = JSON.parse(fs.readFileSync(path.join(pidsDir, f), 'utf8'));
      // Require BOTH fields. A marker missing cc_parent_pid must never collapse into a
      // match-anything value — that is how a filter turns into a fleet-wide release.
      if (m && m.session_id && m.cc_parent_pid) out.set(String(m.session_id), m.cc_parent_pid);
    } catch { /* skip unreadable/partial marker */ }
  }
  return out;
}

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

module.exports = { sessionsToClose, readTickMarkers, TERMINAL_STATUSES };

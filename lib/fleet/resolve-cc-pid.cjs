// SD-LEO-INFRA-PID-LIVENESS-DURABLE-VENUE-001 (C2 RESOLVER) — shared SSOT for turning a
// session's terminal_id into a Claude-Code PID.
//
// MIGRATED, NOT REWRITTEN. The three-format dispatch below is the implementation that has
// been working inside scripts/stale-session-sweep.cjs; it is moved here verbatim in behavior
// so that lib/fleet/session-liveness.cjs hasPidAlive can consume the SAME resolver the sweep
// uses. The sweep now re-exports from this module, so exactly ONE implementation exists —
// the SD's REUSE-DO-NOT-REBUILD constraint (a third copy would join the two shadow liveness
// ladders already in the tree).
//
// WHY THIS MATTERS: hasPidAlive previously did `String(terminal_id).split('-')` and took the
// LAST segment. For the bare-UUID terminal_ids sessions actually write, that yields the final
// hex group (e.g. "07ab028225c9") — never a PID — so the PID leg of the liveness ladder was
// 100% inert (measured: 0 of 22 rows resolved, 10 terminal_id NULL). Format 3 below is the
// branch that makes it able to answer at all.

const fs = require('fs');
const path = require('path');
const { MARKER_DIR } = require('./cc-pid-liveness.cjs');

/**
 * Resolve the Claude-Code PID for a session, dispatching on terminal_id format.
 *
 * Format 1 "win-cc-PORT-PID" (CLI) and format 2 "win-PID" (Desktop) carry the PID inline.
 * Format 3 is a bare UUID, which carries no PID at all — UUID hex chars are not a real PID —
 * so it is resolved by scanning the SessionStart markers at .claude/session-identity/pid-*.json
 * and matching their session_id. Those markers carry a cc_pid field (verified against live
 * markers: cc_pid equals the pid in the filename, and session_id is the CC session UUID).
 *
 * @param {string} terminalId
 * @param {string} [sessionId] used for the UUID-format marker lookup
 * @param {string} [markerDir] override for tests; defaults to repo-root/.claude/session-identity
 * @returns {number|null} numeric PID, or null when no match — null means COULD NOT DETERMINE,
 *   never "dead". Callers must not convert a null into a dead verdict.
 */
function resolveCcPidFromTerminalId(terminalId, sessionId, markerDir = MARKER_DIR) {
  // A NULL terminal_id is NOT a dead end. The marker scan below keys on session_id, so a row
  // with no terminal_id at all is still resolvable whenever a marker carries its session_id.
  // MEASURED on the full live population (status active/idle/stale, heartbeat within 24h;
  // exact head-count 12 == 12 rows examined): 3 rows have terminal_id NULL, and ALL THREE have
  // a marker keyed by session_id — including the fleet coordinator. Returning null for them
  // would leave 25% of live sessions permanently could-not-determine while the answer sat on
  // disk. An earlier revision of this function bailed here; that was a real defect, caught by
  // probing the coordinator's own row.
  if (typeof terminalId === 'string' && terminalId) {
    // Format 1: win-cc-PORT-PID (CLI)
    const cliMatch = /^win-cc-\d+-(\d+)$/.exec(terminalId);
    if (cliMatch) return Number(cliMatch[1]);
    // Format 2: win-PID (Desktop)
    const dtMatch = /^win-(\d+)$/.exec(terminalId);
    if (dtMatch) return Number(dtMatch[1]);
  } else if (!sessionId) {
    // Nothing to match on at all.
    return null;
  }
  // Format 3: UUID terminal_id OR no terminal_id — scan pid-*.json markers by session_id match
  try {
    if (!fs.existsSync(markerDir)) return null;
    const files = fs.readdirSync(markerDir).filter(f => /^pid-\d+\.json$/.test(f));
    for (const file of files) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(markerDir, file), 'utf8'));
        if (data?.cc_pid && (
          data.session_id === sessionId
          || data.session_id === terminalId
        )) {
          return Number(data.cc_pid);
        }
      } catch { /* skip malformed marker */ }
    }
  } catch { /* directory missing or unreadable */ }
  return null;
}

module.exports = { resolveCcPidFromTerminalId, MARKER_DIR };

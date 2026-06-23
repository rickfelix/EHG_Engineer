// SD-REFILL-00IO6NQJ: SSOT for Claude-Code PID liveness from SessionStart markers.
//
// Extracted from scripts/fleet-dashboard.cjs so the coordinator standing-report
// (lib/coordinator/fleet-quiescence.cjs assessFleetActivity) and the fleet
// dashboard read PID-aliveness from ONE source. A parked /loop worker has a stale
// DB heartbeat but a LIVE CC process; keying liveness on the heartbeat window alone
// produced false "quiescent / 0 workers" reports while 3-4 workers were live.
//
// Liveness uses Node's process.kill(pid, 0) — NEVER `bash kill -0`, which returns a
// false-NEGATIVE on this Windows/git-bash box (reports live PIDs as dead).

const fs = require('fs');
const path = require('path');

// Repo-root/.claude/session-identity — resolved from this module's location
// (lib/fleet → ../../), matching the directory fleet-dashboard.cjs historically used
// (scripts → ../). Both resolve to the same repo-root marker dir.
const MARKER_DIR = path.resolve(__dirname, '../../.claude/session-identity');

/**
 * True iff `pid` is a running process. Treats EPERM as alive (the process exists but
 * is owned by another user). Uses process.kill(pid, 0); does not shell out.
 * @param {number} pid
 * @returns {boolean}
 */
function isProcessRunning(pid) {
  if (!pid || typeof pid !== 'number') return false;
  try { process.kill(pid, 0); return true; }
  catch (err) { return err.code === 'EPERM'; }
}

/**
 * Read the SessionStart pid-*.json markers, returning a map of
 * session_id -> { claude_session_id, pid, alive }. Unreadable markers are skipped.
 * @param {string} [markerDir] override (defaults to repo-root/.claude/session-identity)
 * @returns {Object<string, {claude_session_id: (string|null), pid: number, alive: boolean}>}
 */
function getMarkerSessionIds(markerDir = MARKER_DIR) {
  if (!fs.existsSync(markerDir)) return {};
  const map = {};
  for (const f of fs.readdirSync(markerDir).filter(f => /^pid-\d+\.json$/.test(f))) {
    try {
      const pid = Number(f.match(/^pid-(\d+)\.json$/)[1]);
      const data = JSON.parse(fs.readFileSync(path.join(markerDir, f), 'utf8'));
      if (data.session_id) map[data.session_id] = { claude_session_id: data.claude_session_id || null, pid, alive: isProcessRunning(pid) };
    } catch { /* skip unreadable markers */ }
  }
  return map;
}

/**
 * Set of alive CC PIDs (as strings) from the marker files.
 * @param {string} [markerDir]
 * @returns {Set<string>}
 */
function getAliveCcPids(markerDir = MARKER_DIR) {
  const markers = getMarkerSessionIds(markerDir);
  const alive = new Set();
  for (const info of Object.values(markers)) {
    if (info.alive) alive.add(String(info.pid));
  }
  return alive;
}

module.exports = { isProcessRunning, getMarkerSessionIds, getAliveCcPids, MARKER_DIR };

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

// SD-LEO-INFRA-PID-LIVENESS-DURABLE-VENUE-001 — MARKERS ARE PER-CHECKOUT BUT DESCRIBE THE HOST.
//
// The writer (scripts/hooks/capture-session-id.cjs:497) and this reader BOTH derive the directory
// from their own __dirname, so every checkout keeps a SEPARATE marker set while the thing being
// described — an OS process — is host-wide. MEASURED 2026-07-27: main repo 12 markers, the SD's
// worktree 1, other worktrees 0-2. Running stale-session-sweep.cjs from the worktree reported
// "PID venue OK ... Examined 9 row(s); 0 resolved to a live PID" — the venue check passed on a
// directory that EXISTS while the PID leg could resolve essentially nothing.
//
// A linked worktree's .git is a FILE pointing at the main repo, so the main worktree is reachable
// from anywhere: git-common-dir is <main>/.git, whose parent is the main working tree. Reading the
// union of {main worktree, local checkout} means a sweep invoked from a worktree still sees the
// markers real sessions actually wrote.
//
// STRICTLY UPGRADE-ONLY, which is what makes it safe to land on a nearly-complete SD: adding
// directories can only ever resolve MORE pids, never fewer, so it cannot manufacture a false
// DEATH. Same direction of change as C2 (see resolve-cc-pid.cjs), and safe under the
// one-directional liveness contract for the same reason.
function mainWorktreeMarkerDir() {
  // .git is a DIRECTORY in the main worktree and a FILE ("gitdir: <path>") in a linked one.
  let dir = path.resolve(__dirname, '../..');
  try {
    const gitPath = path.join(dir, '.git');
    if (fs.existsSync(gitPath) && fs.statSync(gitPath).isFile()) {
      const m = /gitdir:\s*(.+)/.exec(fs.readFileSync(gitPath, 'utf8'));
      if (m) {
        // <main>/.git/worktrees/<name> -> up three is the main working tree.
        const commonDir = path.resolve(dir, m[1].trim());
        const idx = commonDir.lastIndexOf(`${path.sep}.git${path.sep}worktrees${path.sep}`);
        if (idx !== -1) return path.join(commonDir.slice(0, idx), '.claude', 'session-identity');
      }
    }
  } catch { /* fall through to the local dir — never throw from a liveness read */ }
  return path.join(dir, '.claude', 'session-identity');
}

/** Every directory that may hold markers for this host, deduped, existing ones first. */
function markerDirs() {
  const dirs = [MARKER_DIR, mainWorktreeMarkerDir()];
  return [...new Set(dirs)];
}

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

module.exports = { isProcessRunning, getMarkerSessionIds, getAliveCcPids, MARKER_DIR, markerDirs, mainWorktreeMarkerDir };

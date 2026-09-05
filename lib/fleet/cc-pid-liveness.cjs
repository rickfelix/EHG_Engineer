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
 * Read the SessionStart pid-*.json markers from ONE directory, returning a map of
 * session_id -> { pid, alive }. Unreadable markers are skipped.
 * @param {string} dir
 * @returns {Object<string, {pid: number, alive: boolean}>}
 * @private
 */
function readMarkerDir(dir) {
  if (!fs.existsSync(dir)) return {};
  const map = {};
  for (const f of fs.readdirSync(dir).filter(f => /^pid-\d+\.json$/.test(f))) {
    try {
      const pid = Number(f.match(/^pid-(\d+)\.json$/)[1]);
      const data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      // SD-LEO-INFRA-SESSION-IDENTITY-MARKER-CALLERS-001 (FR-3): the marker's OWN session_id
      // field IS the CLAUDE_SESSION_ID (capture-session-id.cjs writes the SessionStart hook's
      // own session_id verbatim) -- there is no separate claude_session_id field on any real
      // marker. Do not synthesize one here; a caller needing "the CLAUDE_SESSION_ID for this
      // marker" already has it as this map's key.
      if (data.session_id) map[data.session_id] = { pid, alive: isProcessRunning(pid) };
    } catch { /* skip unreadable markers */ }
  }
  return map;
}

/**
 * Merge per-directory session_id -> {pid, alive} maps with ALIVE-BIASED OR semantics: if the
 * same session_id appears in more than one directory, alive:true wins over alive:false. A plain
 * Object.assign key-merge is UNSAFE here -- a stale marker sharing a session_id with a fresh one
 * could silently overwrite alive:true with alive:false, manufacturing a false death, which is
 * exactly the defect class this SD exists to close.
 * @param {Array<Object<string, {pid: number, alive: boolean}>>} maps
 * @returns {Object<string, {pid: number, alive: boolean}>}
 * @private
 */
function mergeAliveBiased(maps) {
  const merged = {};
  for (const map of maps) {
    for (const [sessionId, info] of Object.entries(map)) {
      const existing = merged[sessionId];
      if (!existing || (!existing.alive && info.alive)) merged[sessionId] = info;
    }
  }
  return merged;
}

/**
 * Read the SessionStart pid-*.json markers, returning a map of
 * session_id -> { pid, alive }. Unreadable markers are skipped.
 *
 * SD-LEO-INFRA-SESSION-IDENTITY-MARKER-CALLERS-001 (FR-1): defaults to the HOST-WIDE UNION
 * (markerDirsFn(), an alive-biased merge across every directory that may hold this host's
 * markers) rather than a single local directory -- markers are written per-checkout but
 * describe host-wide processes, so a caller invoked from a worktree other than the one that
 * wrote a live session's marker previously read that session as could-not-determine (and,
 * downstream, dead). An explicit markerDir argument still pins the scan to exactly that ONE
 * directory (unchanged contract -- every existing hermetic test already injects an explicit
 * dir). markerDirsFn is a second, independent injection seam for hermetically testing the
 * UNION path itself without deriving real __dirname-based paths in a test.
 * @param {string} [markerDir] explicit single-directory override; when omitted, unions markerDirsFn()
 * @param {() => string[]} [markerDirsFn] test-injection seam for the union path (defaults to markerDirs)
 * @returns {Object<string, {pid: number, alive: boolean}>}
 */
function getMarkerSessionIds(markerDir, markerDirsFn = markerDirs) {
  if (markerDir) return readMarkerDir(markerDir);
  return mergeAliveBiased(markerDirsFn().map(readMarkerDir));
}

/**
 * Set of alive CC PIDs (as strings) from the marker files. Same union/override/injection
 * contract as getMarkerSessionIds -- see its docblock.
 * @param {string} [markerDir]
 * @param {() => string[]} [markerDirsFn]
 * @returns {Set<string>}
 */
function getAliveCcPids(markerDir, markerDirsFn = markerDirs) {
  const markers = getMarkerSessionIds(markerDir, markerDirsFn);
  const alive = new Set();
  for (const info of Object.values(markers)) {
    if (info.alive) alive.add(String(info.pid));
  }
  return alive;
}

module.exports = { isProcessRunning, getMarkerSessionIds, getAliveCcPids, MARKER_DIR, markerDirs, mainWorktreeMarkerDir };

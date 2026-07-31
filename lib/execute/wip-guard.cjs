// lib/execute/wip-guard.cjs
//
// SD-MULTISESSION-EXECUTION-TEAM-COMMAND-ORCH-001-C (Phase 3 of /execute)
// Pure helpers for inspecting worker worktrees for uncommitted changes.
// Used by execute-stop.mjs and Supervisor.halt() to defer SIGKILL escalation
// when workers have in-progress work that would be lost.
//
// All functions here are pure (no DB writes, no signal sending). Caller
// orchestrates side effects (SAVE_WARNING coordination messages, deferred kill).

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Check whether a worker worktree has uncommitted changes.
 *
 * @param {string} worktreePath - Absolute path to the worker worktree
 * @returns {{ dirty: boolean, files: string[], note?: string }}
 *   - dirty: true if `git status --porcelain` returns any output
 *   - files: array of file paths reported as modified/added/deleted/untracked
 *   - note: optional explanation when worktreePath does not exist or git fails
 */
function checkWorktreeWIP(worktreePath) {
  if (!worktreePath) {
    return { dirty: false, files: [], note: 'no_worktree_path' };
  }
  if (!fs.existsSync(worktreePath)) {
    return { dirty: false, files: [], note: 'worktree_path_missing' };
  }
  // A worktree ROOT is the path git resolves --show-toplevel to. Distinguish the two cases the
  // bare `git status` below otherwise conflates:
  //   (a) NOT IN ANY REPO -> git resolves nothing. There is provably no tracked work to lose, and
  //       the pre-existing dirty=false/git_status_failed answer below is correct. Left untouched.
  //   (b) NESTED INSIDE ANOTHER REPO (an unregistered leftover .worktrees/<sd> dir is exactly this)
  //       -> git walks UP and `git status` reports the PARENT tree's dirt as if it were this
  //       worktree's. Real, observed condition; same root cause as isReapable's dirty_tree false
  //       positive (harness backlog 16c88c91).
  // Only (b) is a misread. Report dirty — the fail-safe direction both callers want (refuse a
  // steal, refuse a release) — but with NO files, since attributing the parent's changes to this
  // worktree is the misleading half.
  let topLevel = null;
  try {
    topLevel = execSync('git rev-parse --show-toplevel', {
      cwd: worktreePath, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 10000,
    }).trim();
  } catch { topLevel = null; } // case (a) — fall through to the existing behaviour
  if (topLevel) {
    const norm = (p) => {
      const r = path.resolve(p);
      return process.platform === 'win32' ? r.toLowerCase() : r;
    };
    if (norm(topLevel) !== norm(worktreePath)) {
      return { dirty: true, files: [], note: 'not_a_worktree_root' };
    }
  }

  let output;
  try {
    output = execSync('git status --porcelain', {
      cwd: worktreePath,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 10000
    });
  } catch (err) {
    return { dirty: false, files: [], note: `git_status_failed: ${err.message}` };
  }

  const lines = output
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return { dirty: false, files: [] };
  }

  // Each line is "XY <path>" — extract the path portion
  const files = lines.map((line) => {
    // Handle renames "R  old -> new"
    const renameMatch = line.match(/^[A-Z?!]{1,2}\s+.+\s->\s(.+)$/);
    if (renameMatch) return renameMatch[1];
    return line.replace(/^[A-Z?!]{1,2}\s+/, '');
  });

  return { dirty: true, files };
}

/**
 * Check WIP for multiple worker worktrees in parallel.
 * Returns aggregate info for caller to decide on SAVE_WARNING vs immediate kill.
 *
 * @param {Array<{slot: number, callsign: string, worktree_path: string}>} workers
 * @returns {{
 *   anyDirty: boolean,
 *   dirtyWorkers: Array<{slot, callsign, files}>,
 *   cleanWorkers: Array<{slot, callsign}>
 * }}
 */
function checkAllWorkersWIP(workers) {
  const dirtyWorkers = [];
  const cleanWorkers = [];

  for (const w of workers || []) {
    const result = checkWorktreeWIP(w.worktree_path);
    if (result.dirty) {
      dirtyWorkers.push({
        slot: w.slot,
        callsign: w.callsign,
        files: result.files
      });
    } else {
      cleanWorkers.push({ slot: w.slot, callsign: w.callsign, note: result.note });
    }
  }

  return {
    anyDirty: dirtyWorkers.length > 0,
    dirtyWorkers,
    cleanWorkers
  };
}

/**
 * Test whether a process ID is alive (cross-platform).
 * Uses signal 0 which checks existence without sending a real signal.
 *
 * @param {number} pid
 * @returns {boolean}
 */
function isProcessAlive(pid) {
  if (!pid || typeof pid !== 'number' || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM means process exists but we lack permission — still "alive" enough
    return err.code === 'EPERM';
  }
}

module.exports = {
  checkWorktreeWIP,
  checkAllWorkersWIP,
  isProcessAlive
};

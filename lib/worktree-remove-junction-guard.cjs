'use strict';
/**
 * worktree-removal shared-store wipe guard — QF-20260721-742 (RCA: 4 recurring
 * wipes 07-01/07-11/07-17/07-21, all a RAW `git worktree remove`/`rm -rf` that
 * bypassed the in-code pre-unlink guards in removeWorktreeViaGit() /
 * concurrent-session-worktree.cjs). Distinct vector from npm-ci-junction-guard.cjs
 * (guards `npm ci` instead). Pure + fs-injectable, same shape as that module.
 */
const path = require('path');

// Command-start-boundary matching (mirrors NPM_CI_RE) to avoid quoted-string false positives.
const WORKTREE_REMOVE_RE = /(?:^|[;&|(\n])\s*git\s+worktree\s+remove\s+(?:--force\s+)?["']?([^"'\s]+)["']?/;
const RM_RF_RE = /(?:^|[;&|(\n])\s*rm\s+-rf\s+["']?([^"'\s]+)["']?/;
const REMOVE_ITEM_RE = /(?:^|[;&|(\n])\s*Remove-Item\s+(?:-Recurse\s+-Force|-Force\s+-Recurse|-Recurse)\s+["']?([^"'\s]+)["']?/i;
const RMDIR_RE = /(?:^|[;&|(\n])\s*rmdir\s+\/s(?:\s+\/q)?\s+["']?([^"'\s]+)["']?/i;

function extractTargetPath(command) {
  const m =
    WORKTREE_REMOVE_RE.exec(command) || RM_RF_RE.exec(command) || REMOVE_ITEM_RE.exec(command) || RMDIR_RE.exec(command);
  return m ? m[1] : null;
}

function isUnderWorktreesDir(targetPath) {
  const normalized = targetPath.replace(/\\/g, '/');
  return /(^|\/)\.(worktrees|trees)(\/|$)/.test(normalized);
}

/** @returns {{ wipes: boolean, reason: string, targetPath?: string }} */
function worktreeRemoveWouldWipeSharedStore({ command, cwd, fs: fsMod = require('fs') } = {}) {
  if (typeof command !== 'string') return { wipes: false, reason: 'not_a_string' };
  const targetPath = extractTargetPath(command);
  if (!targetPath) return { wipes: false, reason: 'not_a_worktree_removal' };
  if (!isUnderWorktreesDir(targetPath)) return { wipes: false, reason: 'not_under_worktrees_dir' };

  const base = cwd || process.cwd();
  const resolved = path.isAbsolute(targetPath) ? targetPath : path.resolve(base, targetPath);

  let nmStat = null;
  try {
    nmStat = fsMod.lstatSync(path.join(resolved, 'node_modules'));
  } catch {
    /* absent -> safe */
  }
  if (nmStat && nmStat.isSymbolicLink()) {
    return { wipes: true, reason: 'node_modules_is_junction', targetPath: resolved };
  }
  return { wipes: false, reason: 'node_modules_not_a_junction' };
}

module.exports = { worktreeRemoveWouldWipeSharedStore };

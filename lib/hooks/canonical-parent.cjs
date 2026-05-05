'use strict';

// QF-20260505-canonical-hook — resolve the canonical (parent) worktree for hook delegation.
//
// Problem: settings.json hook commands use ${CLAUDE_PROJECT_DIR}, which expands
// to each session's project root. For sessions started in a git worktree
// (.worktrees/<sd-key>/), this resolves to the worktree's *own* copy of the
// hook script — frozen at the time the worktree was created. Hook fixes
// merged to main do NOT propagate to existing worktrees, so a new hook
// implementation can sit shipped-but-non-functional on every active worktree.
//
// Witnessed 2026-05-04: PR #3546 (DELIVERED layer) shipped to main, but every
// active worker worktree was created before the merge and ran the pre-fix
// hook. Result: 0 DELIVERED rows ever inserted in production, despite the
// helper code being correct and the unit tests passing.
//
// Solution: each worktree-aware hook checks `isInWorktree(__dirname)` at
// startup. If true, find the canonical (parent) worktree via
// `git rev-parse --git-common-dir` and delegate to that path's hook
// implementation. Parent worktree's check returns null and falls through to
// the local implementation — no recursion.

const path = require('path');
const { execFileSync } = require('child_process');

function gitRevParse(arg, cwd) {
  try {
    return execFileSync('git', ['rev-parse', arg], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 2000
    }).trim();
  } catch {
    return null;
  }
}

function isInWorktree(cwd) {
  const gitDir = gitRevParse('--git-dir', cwd);
  const gitCommonDir = gitRevParse('--git-common-dir', cwd);
  if (!gitDir || !gitCommonDir) return false;
  return path.resolve(cwd, gitDir) !== path.resolve(cwd, gitCommonDir);
}

function findCanonicalParent(cwd) {
  if (!isInWorktree(cwd)) return null;
  const gitCommonDir = gitRevParse('--git-common-dir', cwd);
  if (!gitCommonDir) return null;
  const absCommon = path.resolve(cwd, gitCommonDir);
  return path.dirname(absCommon);
}

module.exports = { isInWorktree, findCanonicalParent };

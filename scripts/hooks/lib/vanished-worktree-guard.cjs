'use strict';
/**
 * Vanished-Worktree-Linkage Guard (ENF-20 / QF-20260914-380)
 *
 * A worktree's `.git` FILE (the pointer into the shared repo's `.git/worktrees/<name>/` admin
 * directory) can disappear mid-session. QF-20260914-380's investigation could NOT confirm the
 * writer -- the worktree-reaper's live-session guards were found wired, its own execution source
 * was current, and its most recent run removed nothing, so "which component did this" stays
 * genuinely open. Once the `.git` file is gone, every `git` command run from inside that
 * directory silently WALKS UP to the enclosing repo's own `.git` (the shared root) instead of
 * erroring -- so a session that believes it is isolated is actually mutating the one tree the
 * whole fleet depends on. Live incident 2026-09-14: exactly this happened to a fleet worker
 * mid-session; only luck (the fallthrough window held only read-only commands) kept it from
 * mutating the shared root.
 *
 * This guard closes that SYMPTOM regardless of the still-open root cause: before a `git` command
 * is allowed to run against a directory this session believes is an isolated `.worktrees/**`
 * tree, verify that tree's own `.git` entry still exists. If it does not, BLOCK loudly rather
 * than let the command fall through.
 *
 * PURE decision logic (no fs of its own) -- the caller injects `gitLinkExists(dir)` so this stays
 * unit-testable without touching a real filesystem, matching shared-tree-guard.cjs's design.
 * Reuses that file's already-exported segment/cd/normalize helpers rather than re-parsing.
 */
const { splitSegments, parseCdSegment, tokenize, stripLeadingEnvAssignments, normalizePath, WORKTREE_PATH_RE } = require('./shared-tree-guard.cjs');
const path = require('path');

// Unlike shared-tree-guard's parseGitSegment (restricted to checkout/switch/reset), this guard
// must fire on ANY git verb -- a vanished .git link mis-resolves every git subcommand equally.
const GIT_DIR_OPTS_WITH_VALUE = new Set(['-C', '--work-tree', '--git-dir']);

/**
 * Parse a git segment for any -C/--work-tree/--git-dir directory targets. Returns null if the
 * segment (after stripping leading VAR=value assignments) is not a `git` invocation at all.
 * @param {string} segment
 * @returns {{dirs: string[]} | null}
 */
function parseGitTargets(segment) {
  let tokens = stripLeadingEnvAssignments(tokenize(segment));
  if (tokens.length === 0 || tokens[0] !== 'git') return null;
  tokens = tokens.slice(1);
  const dirs = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (!t.startsWith('-')) break; // reached the subcommand verb
    const eq = t.indexOf('=');
    if (eq !== -1) {
      if (GIT_DIR_OPTS_WITH_VALUE.has(t.slice(0, eq))) dirs.push(t.slice(eq + 1));
      continue;
    }
    if (GIT_DIR_OPTS_WITH_VALUE.has(t)) { dirs.push(tokens[i + 1]); i++; continue; }
  }
  return { dirs };
}

/**
 * Decide whether a Bash command must be blocked because it targets a `.worktrees/**` tree whose
 * `.git` linkage has vanished.
 * @param {string} cmd                              The Bash tool's command string.
 * @param {{cwd: string, gitLinkExists: (dir: string) => boolean}} ctx
 *   `gitLinkExists` is REQUIRED (injected) -- absent, this fails open (never blocks).
 * @returns {{block: boolean, reason: string, dir?: string}}
 */
function decideVanishedWorktreeLinkage(cmd, ctx) {
  const gitLinkExists = ctx && typeof ctx.gitLinkExists === 'function' ? ctx.gitLinkExists : null;
  if (!gitLinkExists) return { block: false, reason: 'no_check_injected' };

  const segments = splitSegments(cmd);
  let effectiveCwd = (ctx && ctx.cwd) || '';
  for (const seg of segments) {
    const cdTarget = parseCdSegment(seg);
    if (cdTarget) {
      // win32 explicitly: this guard evaluates real Windows paths on the fleet's dev machines.
      effectiveCwd = path.win32.isAbsolute(cdTarget) ? cdTarget : path.win32.resolve(effectiveCwd, cdTarget);
      continue;
    }

    const git = parseGitTargets(seg);
    if (!git) continue;

    const targets = git.dirs.length > 0 ? git.dirs : [effectiveCwd];
    for (const dir of targets) {
      if (!dir || !WORKTREE_PATH_RE.test(dir)) continue; // only isolated .worktrees/** trees are in scope
      if (!gitLinkExists(dir)) {
        return { block: true, reason: 'vanished_worktree_linkage', dir: normalizePath(dir) };
      }
    }
  }
  return { block: false, reason: 'no_vanished_linkage_detected' };
}

module.exports = { decideVanishedWorktreeLinkage, parseGitTargets };

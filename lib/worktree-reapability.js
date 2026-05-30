/**
 * SD-LEO-INFRA-WORKTREE-CONTENTION-CLEANUP-001 — shared worktree reapability predicate.
 *
 * SINGLE SOURCE OF TRUTH for "is this worktree safe to remove?". Consumed by every
 * worktree removal / cleanup path — the choke point `removeWorktreeViaGit`
 * (lib/worktree-manager.js), the sweep reaper (scripts/worktree-reaper.mjs),
 * concurrent-session cleanup (scripts/hooks/concurrent-session-worktree.cjs),
 * cleanup-pending-sweep (scripts/cleanup-pending-sweep.mjs) — and the orphan-quota
 * classifier (lib/worktree-quota.js), so the live-owner / dirty-tree / unpushed
 * rule is implemented EXACTLY ONCE rather than re-derived ad hoc per path.
 *
 * Root defect (witnessed twice — CronGenius pilot ~2026-05-28 and
 * SD-LEO-INFRA-LINT-METADATA-ORPHAN-001 on 2026-05-30): ad-hoc cleanup paths removed
 * worktrees that belonged to a LIVE session or held UNCOMMITTED / UNPUSHED work,
 * causing mid-EXEC data loss. A worktree is reapable ONLY when its owner is dead
 * AND its tree is clean AND fully pushed.
 *
 * This module mirrors (and is the new home of) the dirty/unpushed helpers that
 * previously lived locally inside scripts/worktree-reaper.mjs; the reaper now
 * imports them from here so there is one canonical implementation.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const REAP_REASONS = Object.freeze({
  LIVE_OWNER: 'live_owner',
  DIRTY_TREE: 'dirty_tree',
  UNPUSHED: 'unpushed',
  ORPHAN_CLEAN: 'orphan_clean',
});

/** Resolve + forward-slash + lowercase, for cross-platform path-key comparison. */
export function normalizePath(p) {
  if (!p) return '';
  try { return path.resolve(p).replace(/\\/g, '/').toLowerCase(); }
  catch { return String(p).replace(/\\/g, '/').toLowerCase(); }
}

/** Default git runner: spawnSync, never throws, returns {stdout,stderr,code}. */
export function runGit(args, cwd = process.cwd()) {
  const res = spawnSync('git', args, {
    cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  return {
    stdout: res.stdout || '',
    stderr: res.stderr || '',
    code: res.status == null ? 1 : res.status,
  };
}

/**
 * Working-tree dirty status. Returns {dirtyCount, untracked, exists}.
 * A non-existent path is reported as exists:false / dirtyCount:0 (nothing to lose).
 */
export function collectDirtyStatus(wtPath, { gitRunner = runGit } = {}) {
  if (!wtPath || !fs.existsSync(wtPath)) {
    return { dirtyCount: 0, untracked: [], exists: false };
  }
  try {
    const res = gitRunner(['status', '--porcelain', '--untracked-files=all'], wtPath);
    if (res.code !== 0) return { dirtyCount: 0, untracked: [], exists: true };
    const lines = (res.stdout || '').split('\n').filter(Boolean);
    const untracked = [];
    let dirty = 0;
    for (const l of lines) {
      dirty++;
      if (l.startsWith('?? ')) untracked.push(l.slice(3).trim());
    }
    return { dirtyCount: dirty, untracked, exists: true };
  } catch { return { dirtyCount: 0, untracked: [], exists: true }; }
}

/** Count commits on HEAD not yet pushed to the upstream (default origin/main). */
export function countUnpushedCommits(wtPath, { gitRunner = runGit, upstream = 'origin/main' } = {}) {
  if (!wtPath || !fs.existsSync(wtPath)) return 0;
  try {
    const res = gitRunner(['cherry', upstream, 'HEAD'], wtPath);
    if (res.code !== 0) return 0;
    return (res.stdout || '').split('\n').filter((l) => l.startsWith('+')).length;
  } catch { return 0; }
}

/**
 * THE shared reapability predicate. A worktree is reapable ONLY when ALL hold:
 *   1. no live owner   — caller supplies `liveOwner` from a fresh-heartbeat claim map
 *   2. clean tree      — no uncommitted/untracked changes
 *   3. nothing unpushed — no commits ahead of the pushed upstream
 *
 * Reason precedence when NOT reapable: live_owner > dirty_tree > unpushed.
 *
 * @param {string} worktreePath
 * @param {object} [opts]
 * @param {boolean}  [opts.liveOwner=false] true if a fresh-heartbeat session owns this worktree
 * @param {function} [opts.gitRunner]       injectable git runner (tests)
 * @param {string}   [opts.upstream]        upstream ref for the unpushed check
 * @returns {{reapable: boolean, reason: string}}
 */
export function isReapable(worktreePath, opts = {}) {
  const { liveOwner = false, gitRunner = runGit, upstream = 'origin/main' } = opts;
  if (liveOwner) return { reapable: false, reason: REAP_REASONS.LIVE_OWNER };
  if (collectDirtyStatus(worktreePath, { gitRunner }).dirtyCount > 0) {
    return { reapable: false, reason: REAP_REASONS.DIRTY_TREE };
  }
  if (countUnpushedCommits(worktreePath, { gitRunner, upstream }) > 0) {
    return { reapable: false, reason: REAP_REASONS.UNPUSHED };
  }
  return { reapable: true, reason: REAP_REASONS.ORPHAN_CLEAN };
}

/**
 * Structured skip-reason log line (FR-6). Emits a single machine-grep-able line
 * describing a reap/skip decision so a stuck-quota condition is never silent.
 * @param {object} logger - console-like (defaults to console.warn)
 */
export function logReapDecision({ worktree, decision, reason, ownerSession = null, heartbeatAgeS = null }, logger = console.warn) {
  logger(`[reapability] ${JSON.stringify({ worktree: normalizePath(worktree), decision, reason, owner_session: ownerSession, heartbeat_age_s: heartbeatAgeS })}`);
}

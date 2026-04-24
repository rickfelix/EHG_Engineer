/**
 * worktree-quota.js — Single source of truth for the worktree quota counter.
 *
 * SD-LEO-FIX-WORKTREE-QUOTA-COUNTER-001
 *
 * The worktree quota is enforced at two call sites:
 *   - scripts/resolve-sd-workdir.js::createWorktree (sd-start claim path)
 *   - lib/worktree-manager.js::createWorkTypeWorktree (generic worktree factory)
 *
 * Both previously counted `.worktrees/*` subdirectories via fs.readdirSync. That
 * over-counted orphan directories left behind by completed SDs whose worktree
 * was archived by scripts/modules/shipping/post-merge-worktree-cleanup.js but
 * whose directory remained on disk (e.g., when the cleanup reason was
 * "unpushed_commits"). The over-count produced false-positive
 * "Worktree limit reached (20/20)" errors and blocked legitimate claims on
 * 2026-04-24 during normal parallel-fleet operation.
 *
 * This module replaces that logic with `git worktree list --porcelain`
 * enumeration — the authoritative source of truth for what git considers a
 * worktree. Orphan directories never appear in porcelain output, so they are
 * naturally excluded. Helper directories (_archive, qf, sd, adhoc) are also
 * never registered as worktrees and therefore also naturally excluded.
 *
 * Error contract: The WORKTREE_QUOTA_EXCEEDED errorCode and exact message text
 * are preserved via `createQuotaExceededError` so existing downstream parsers
 * continue to work without change.
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const MAX_WORKTREE_COUNT = 20;

/**
 * Helper-directory names that live under `.worktrees/` but are not worktrees.
 * Preserved for documentation and any downstream caller that may still filter
 * by these names. The new counter does not need this list because helper dirs
 * are never registered worktrees, but the export stays for backward-compat.
 */
export const WORKTREE_QUOTA_HELPERS = new Set(['_archive', 'qf', 'sd', 'adhoc']);

/**
 * Normalize a filesystem path for comparison. Converts backslashes to forward
 * slashes and resolves to an absolute path. Used to compare worktree paths from
 * `git worktree list --porcelain` (which can emit mixed separators on Windows).
 */
function normalizePath(p) {
  try {
    return path.resolve(p).replace(/\\/g, '/');
  } catch {
    return String(p).replace(/\\/g, '/');
  }
}

/**
 * Parse `git worktree list --porcelain` output into an array of worktree
 * objects. Each entry may include `path`, `head`, `branch`, `detached`, and
 * `prunable` fields.
 *
 * Follows the same parser shape as scripts/cleanup-phantom-worktrees.js:23-49
 * to keep behavior consistent across the codebase.
 */
function parsePorcelain(raw) {
  const worktrees = [];
  let current = {};
  for (const line of raw.split('\n')) {
    if (line.startsWith('worktree ')) {
      if (current.path) worktrees.push(current);
      current = { path: line.slice('worktree '.length).trim() };
    } else if (line.startsWith('HEAD ')) {
      current.head = line.slice('HEAD '.length).trim();
    } else if (line.startsWith('branch ')) {
      current.branch = line.slice('branch '.length).trim();
    } else if (line === 'bare') {
      current.bare = true;
    } else if (line === 'detached') {
      current.detached = true;
    } else if (line.startsWith('prunable')) {
      current.prunable = true;
    }
  }
  if (current.path) worktrees.push(current);
  return worktrees;
}

/**
 * Return the list of git-registered worktrees for the given repo root, with
 * the main repo worktree (and any `bare` entry) filtered out.
 *
 * @param {string} repoRoot - Absolute path to the main repo root.
 * @returns {Array<{path: string, branch?: string, head?: string, bare?: boolean, detached?: boolean, prunable?: boolean}>}
 */
export function listActiveWorktrees(repoRoot) {
  let raw;
  try {
    raw = execSync('git worktree list --porcelain', {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch {
    // git CLI failure (missing git, not a repo, etc.) — return empty rather
    // than throw. The caller (sd-start) will hit a different error downstream
    // that is more diagnostic than a mysterious quota check failure.
    return [];
  }

  const all = parsePorcelain(raw);
  const normalizedRoot = normalizePath(repoRoot);
  return all.filter((wt) => {
    if (wt.bare) return false;
    const normalizedWtPath = normalizePath(wt.path);
    return normalizedWtPath !== normalizedRoot;
  });
}

/**
 * Count the git-registered worktrees for the given repo root. This is the
 * authoritative quota counter — it ignores orphan directories on disk that
 * are not registered with git. Replaces the old `fs.readdirSync`-based
 * counter at scripts/resolve-sd-workdir.js::countWorktreeDirs.
 *
 * @param {string} repoRoot - Absolute path to the main repo root.
 * @returns {number} Count of non-main worktrees.
 */
export function countActiveWorktrees(repoRoot) {
  return listActiveWorktrees(repoRoot).length;
}

/**
 * Count the filesystem directories directly under `.worktrees/`, excluding
 * helper dirs (_archive, qf, sd, adhoc). Mirrors the OLD counter logic from
 * scripts/resolve-sd-workdir.js:174-184 before this refactor. Used only to
 * detect orphans by comparing against {@link countActiveWorktrees}.
 *
 * @param {string} worktreesDir - Absolute path to the `.worktrees/` directory.
 * @returns {number}
 */
export function countFilesystemWorktreeDirs(worktreesDir) {
  if (!fs.existsSync(worktreesDir)) return 0;
  try {
    return fs.readdirSync(worktreesDir).filter((entry) => {
      if (WORKTREE_QUOTA_HELPERS.has(entry)) return false;
      try {
        return fs.statSync(path.join(worktreesDir, entry)).isDirectory();
      } catch { return false; }
    }).length;
  } catch {
    return 0;
  }
}

/**
 * Emit a structured WARN log line if the filesystem count exceeds the
 * git-registered count — a signal that orphan directories are accumulating
 * under `.worktrees/`. Non-blocking: never throws, never changes flow. The
 * log is consumable by a future filesystem-reaper SD; for now it is a
 * visibility signal only.
 *
 * @param {number} fsCount - Filesystem directory count (from countFilesystemWorktreeDirs).
 * @param {number} registeredCount - Git-registered count (from countActiveWorktrees).
 * @param {(msg: string) => void} [logger=console.warn] - Emitter. Defaults to console.warn.
 * @returns {number} The orphan count (`fsCount - registeredCount`), or 0 when non-positive.
 */
export function emitOrphanWarningIfAny(fsCount, registeredCount, logger = console.warn) {
  const orphanCount = Math.max(0, fsCount - registeredCount);
  if (orphanCount > 0) {
    logger(
      `[worktree-quota] ORPHAN_DETECTED: ${orphanCount} orphan directories ` +
      `in .worktrees/ (fs=${fsCount}, git-registered=${registeredCount}). ` +
      `Run cleanup or invoke the reaper.`
    );
  }
  return orphanCount;
}

/**
 * Factory for the quota-exceeded Error. Preserves the exact message text and
 * `errorCode` property that existing downstream parsers depend on. Both call
 * sites (scripts/resolve-sd-workdir.js and lib/worktree-manager.js) MUST use
 * this factory to guarantee contract preservation.
 *
 * @param {number} count - Current worktree count.
 * @param {number} [max=MAX_WORKTREE_COUNT] - The quota limit.
 * @returns {Error} Error with `.errorCode = 'WORKTREE_QUOTA_EXCEEDED'`.
 */
export function createQuotaExceededError(count, max = MAX_WORKTREE_COUNT) {
  const err = new Error(
    `Worktree limit reached (${count}/${max}). ` +
    'Run cleanup or remove stale worktrees before creating new ones.'
  );
  err.errorCode = 'WORKTREE_QUOTA_EXCEEDED';
  return err;
}

/**
 * Check quota and throw if exceeded, using the preserved error contract.
 * Convenience wrapper for the two call sites. Also emits the orphan warning
 * as a side effect before the quota check, so operators see the signal even
 * when the quota does not actually fire.
 *
 * @param {string} repoRoot - Absolute path to the main repo root.
 * @param {string} worktreesDir - Absolute path to the `.worktrees/` directory.
 * @param {{max?: number, logger?: (msg: string) => void}} [options]
 * @returns {{count: number, orphanCount: number}} When quota is NOT exceeded.
 * @throws {Error} With errorCode `WORKTREE_QUOTA_EXCEEDED` when at/over limit.
 */
export function enforceWorktreeQuota(repoRoot, worktreesDir, options = {}) {
  const { max = MAX_WORKTREE_COUNT, logger = console.warn } = options;
  const count = countActiveWorktrees(repoRoot);
  const fsCount = countFilesystemWorktreeDirs(worktreesDir);
  const orphanCount = emitOrphanWarningIfAny(fsCount, count, logger);
  if (count >= max) {
    throw createQuotaExceededError(count, max);
  }
  return { count, orphanCount };
}

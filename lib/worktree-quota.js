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
// SD-LEO-INFRA-WORKTREE-CONTENTION-CLEANUP-001 (FR-4): shared reapability predicate,
// used to exclude owned/dirty/unpushed dirs from the ORPHAN_DETECTED count.
import { isReapable } from './worktree-reapability.js';

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
 * SD-LEO-INFRA-WORKTREE-CONTENTION-CLEANUP-001 (FR-4 / AC-3): classify the
 * UNREGISTERED `.worktrees/` dirs into genuinely-reapable orphans
 * (dead owner + clean tree + nothing unpushed) vs dirs that must NOT be counted
 * as orphans because they are owned by a live session OR hold uncommitted/unpushed
 * work. The raw `fsCount - registeredCount` arithmetic mis-counts the latter,
 * inflating the ORPHAN_DETECTED signal — the same "7 orphan directories" warning
 * that preceded the active-claim reaping incident. Reporting-accuracy only
 * (never deletes; the orphan warning remains warning-only).
 *
 * SD-LEO-INFRA-ORPHAN-WORKTREE-SWEEP-001 (FR-1/FR-3): additively returns the actual
 * reapable orphan PATHS (`reapableDirs`) so the sweep can RECLAIM them (not just count),
 * and accepts a `minAgeMs`/`now` recent-dir guard so a freshly-created dir mid-`git
 * worktree add` is never reaped. Defaults (`minAgeMs=0`) preserve every existing caller's
 * behavior byte-for-byte (now - mtime is never < 0, so nothing is newly excluded).
 *
 * @param {string} worktreesDir
 * @param {Array<{path:string}>|string[]} [registered=[]] - git-registered worktrees (or paths)
 * @param {{liveOwners?: Set<string>, gitRunner?: function, minAgeMs?: number, now?: number}} [opts]
 *        liveOwners: normalized paths owned by a fresh-heartbeat session.
 *        minAgeMs: exclude dirs whose mtime is newer than (now - minAgeMs) as 'too_recent'.
 *        now: clock injection for deterministic tests (defaults to Date.now()).
 * @returns {{reapable: number, reapableDirs: Array<{dir:string, full:string}>, excluded: Array<{dir:string, reason:string}>, total: number}}
 */
export function classifyOrphanDirs(worktreesDir, registered = [], opts = {}) {
  const { liveOwners = new Set(), gitRunner, minAgeMs = 0, now = Date.now() } = opts;
  const empty = { reapable: 0, reapableDirs: [], excluded: [], total: 0 };
  if (!worktreesDir || !fs.existsSync(worktreesDir)) return { ...empty };
  // SD-LEO-INFRA-ORPHAN-WORKTREE-SWEEP-001 (review HIGH): on Windows the filesystem is
  // case-INSENSITIVE, so the registered-worktree exclusion must compare case-insensitively
  // or a registered worktree whose on-disk casing differs from git's recorded casing could
  // slip through and be REAPED. cmpKey lowercases only on win32 (Linux paths stay case-sensitive).
  const ciWin = process.platform === 'win32';
  const cmpKey = (p) => { const n = normalizePath(p); return ciWin ? n.toLowerCase() : n; };
  const registeredSet = new Set(
    (registered || []).map((r) => cmpKey(typeof r === 'string' ? r : r.path))
  );
  let entries;
  try { entries = fs.readdirSync(worktreesDir); } catch { return { ...empty }; }
  const excluded = [];
  const reapableDirs = [];
  let total = 0;
  for (const entry of entries) {
    if (WORKTREE_QUOTA_HELPERS.has(entry)) continue;
    const full = path.join(worktreesDir, entry);
    try { if (!fs.statSync(full).isDirectory()) continue; } catch { continue; }
    if (registeredSet.has(cmpKey(full))) continue; // registered → not an orphan (case-insensitive on Windows)
    total++;
    const normFull = normalizePath(full);
    // SD-LEO-INFRA-ORPHAN-WORKTREE-SWEEP-001 (review HIGH): `liveOwners` may be produced with a
    // DIFFERENT normalizePath — worktree-reapability.js lowercases on ALL platforms, this module
    // does not — so compare case-insensitively too, else the live-owner guard is silently defeated
    // by path-casing drift across the module boundary and a live-claimed dir could be reaped.
    if (liveOwners.has(normFull) || liveOwners.has(normFull.toLowerCase())) { excluded.push({ dir: entry, reason: 'live_owner' }); continue; }
    // FR-3 recent-dir guard: never reap a dir created within minAgeMs (could be a
    // worktree mid-`git worktree add` not yet registered). minAgeMs=0 → no-op.
    if (minAgeMs > 0) {
      let mtimeMs = 0;
      try { mtimeMs = fs.statSync(full).mtimeMs; } catch { mtimeMs = now; }
      if (now - mtimeMs < minAgeMs) { excluded.push({ dir: entry, reason: 'too_recent' }); continue; }
    }
    // A plain leftover dir (no .git) cannot carry its OWN uncommitted/unpushed
    // state — git status from it would report the ENCLOSING repo — so it is a
    // genuine reapable orphan. Only worktree-root dirs get the dirty/unpushed predicate.
    if (!fs.existsSync(path.join(full, '.git'))) { reapableDirs.push({ dir: entry, full }); continue; }
    const verdict = isReapable(full, { liveOwner: false, gitRunner });
    if (verdict.reapable) reapableDirs.push({ dir: entry, full });
    else excluded.push({ dir: entry, reason: verdict.reason });
  }
  return { reapable: reapableDirs.length, reapableDirs, excluded, total };
}

/**
 * Emit a structured WARN log line if orphan directories are accumulating under
 * `.worktrees/`. Non-blocking: never throws, never changes flow.
 *
 * FR-4: when `options.worktreesDir` + `options.registered` are supplied, the
 * reported orphan count counts ONLY genuinely-reapable dirs (owned/dirty/unpushed
 * dirs are excluded, with a per-dir reason in the log). Without those options it
 * falls back to the legacy `fsCount - registeredCount` arithmetic (back-compat).
 *
 * @param {number} fsCount - Filesystem directory count (from countFilesystemWorktreeDirs).
 * @param {number} registeredCount - Git-registered count (from countActiveWorktrees).
 * @param {(msg: string) => void} [logger=console.warn] - Emitter. Defaults to console.warn.
 * @param {{worktreesDir?: string, registered?: Array, liveOwners?: Set<string>, gitRunner?: function}} [options]
 * @returns {number} The (adjusted) orphan count, or 0 when non-positive.
 */
export function emitOrphanWarningIfAny(fsCount, registeredCount, logger = console.warn, options = {}) {
  const { worktreesDir, registered, liveOwners, gitRunner } = options;
  let orphanCount = Math.max(0, fsCount - registeredCount);
  let excludedNote = '';
  if (worktreesDir && registered) {
    const c = classifyOrphanDirs(worktreesDir, registered, { liveOwners, gitRunner });
    orphanCount = c.reapable; // owned/dirty/unpushed dirs are NOT orphans
    if (c.excluded.length > 0) {
      excludedNote = ` (excluded ${c.excluded.length} owned/dirty/unpushed: ` +
        c.excluded.map((e) => `${e.dir}:${e.reason}`).join(', ') + ')';
    }
  }
  if (orphanCount > 0) {
    logger(
      `[worktree-quota] ORPHAN_DETECTED: ${orphanCount} orphan directories ` +
      `in .worktrees/ (fs=${fsCount}, git-registered=${registeredCount})${excludedNote}. ` +
      'Run cleanup or invoke the reaper.'
    );
  } else if (excludedNote) {
    logger(`[worktree-quota] no reapable orphans${excludedNote}.`);
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
  const { max = MAX_WORKTREE_COUNT, logger = console.warn, liveOwners, gitRunner } = options;
  // FR-4: reuse the registered list as both the quota count and classifier input.
  const registered = listActiveWorktrees(repoRoot);
  const count = registered.length;
  const fsCount = countFilesystemWorktreeDirs(worktreesDir);
  const orphanCount = emitOrphanWarningIfAny(fsCount, count, logger, { worktreesDir, registered, liveOwners, gitRunner });
  if (count >= max) {
    throw createQuotaExceededError(count, max);
  }
  return { count, orphanCount };
}

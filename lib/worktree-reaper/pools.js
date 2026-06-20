/**
 * Multi-repo worktree pool resolution — SD-LEO-INFRA-WORKTREE-REAPER-MULTIREPO-001 (FR-1/FR-2).
 *
 * The worktree reaper historically scanned ONE repo (the cwd / --repo target). The fleet now runs
 * worktrees in more than one registered application pool (EHG_Engineer AND the ehg frontend), so an
 * orphaned ehg worktree was never reaped — the ehg pool could fill to its cap unattended. These pure
 * helpers resolve which pools to reap (from the `applications` registry) and compute per-pool cap
 * status, so the reaper can iterate every registered pool with the SAME per-pool safety.
 *
 * Pure + dependency-injected (no fs/DB/git of their own) so they unit-test without a live repo.
 */

import path from 'node:path';

/** Normalize a filesystem path for cross-pool dedup: forward slashes, drop trailing slash, lowercase
 *  on Windows (case-insensitive FS). */
export function normalizePoolPath(p, platform = process.platform) {
  if (!p) return '';
  let s = String(p).replace(/\\/g, '/').replace(/\/+$/, '');
  if (platform === 'win32') s = s.toLowerCase();
  return s;
}

/**
 * Resolve the set of worktree pools to reap from the application registry.
 *
 * A pool is included when its `local_path` exists on disk AND looks like a git repo root (has a .git
 * entry — dir or file). The current repo is always included (and flagged isCurrent) even if it is not
 * in the registry, so --all-pools never silently skips the repo it was launched from. Deduped by
 * normalized path (so EHG_Engineer registered twice, or registered === current, yields one entry).
 *
 * @param {{
 *   applications?: Array<{name?:string, local_path?:string}>,
 *   currentRepoRoot: string,
 *   currentRepoName?: string,
 *   existsSync: (p:string)=>boolean,
 *   hasGit: (root:string)=>boolean,
 *   platform?: string
 * }} deps
 * @returns {Array<{name:string, root:string, isCurrent:boolean}>}
 */
export function resolveRegisteredPools(deps) {
  const {
    applications = [],
    currentRepoRoot,
    currentRepoName = 'current',
    existsSync,
    hasGit,
    platform = process.platform,
  } = deps || {};

  const byKey = new Map();
  const add = (name, root, isCurrent) => {
    if (!root) return;
    const abs = path.resolve(root);
    const key = normalizePoolPath(abs, platform);
    if (!key || byKey.has(key)) return;
    // The current repo is trusted (the reaper is running in it); registry pools must verify on disk.
    if (!isCurrent) {
      if (!existsSync(abs) || !hasGit(abs)) return;
    }
    byKey.set(key, { name: name || 'unknown', root: abs, isCurrent: Boolean(isCurrent) });
  };

  // Current repo first so it owns the dedup key if the registry also lists it.
  add(currentRepoName, currentRepoRoot, true);
  for (const app of applications) {
    if (app && app.local_path) add(app.name, app.local_path, false);
  }
  return [...byKey.values()];
}

/**
 * Per-pool capacity status. `warn` is true when utilization is at or above the threshold — the loud
 * "pool approaching cap" signal (FR-2). Total function; a non-positive cap falls back to 1 to avoid
 * div-by-zero (yielding warn=true, which fails loud rather than silent).
 *
 * @param {number} used  active worktree count in the pool
 * @param {number} cap   the pool cap (MAX_WORKTREE_COUNT)
 * @param {number} threshold  utilization fraction in (0,1] at/above which to warn
 * @returns {{ used:number, cap:number, utilization:number, percent:number, warn:boolean, atCap:boolean }}
 */
export function computePoolCapStatus(used, cap, threshold = 0.8) {
  const safeUsed = Number.isFinite(used) && used >= 0 ? used : 0;
  const safeCap = Number.isFinite(cap) && cap > 0 ? cap : 1;
  const safeThreshold = Number.isFinite(threshold) && threshold > 0 && threshold <= 1 ? threshold : 0.8;
  const utilization = safeUsed / safeCap;
  return {
    used: safeUsed,
    cap: safeCap,
    utilization,
    percent: Math.round(utilization * 100),
    warn: utilization >= safeThreshold,
    atCap: safeUsed >= safeCap,
  };
}

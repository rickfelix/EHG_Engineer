/**
 * orphan-sweep.js — SD-LEO-INFRA-ORPHAN-WORKTREE-SWEEP-001
 *
 * Durable fix for the recurring disk-full fleet blocker: reclaim ORPHANED `.worktrees/`
 * directories — dirs present on disk but NOT in `git worktree list` (e.g. a worktree dir
 * left behind when `git worktree remove` fails on a Windows permission lock). The reaper's
 * main scan enumerates git-REGISTERED worktrees only, so disk-only orphans are structurally
 * invisible to it and accumulate unbounded until the disk fills.
 *
 * This module REUSES the existing safe primitives — it adds NO new detector and NO new
 * junction-unlink logic:
 *   • selection  → lib/worktree-quota.js::classifyOrphanDirs (orphan set + isReapable guard
 *                  + the FR-3 recent-dir guard), enumerating registered via listActiveWorktrees.
 *   • reclamation → the same junction-safe path the reaper uses (removeWorktreeViaGit, which
 *                  pre-unlinks the node_modules junction, then safeRecursiveRm as fallback).
 *
 * CARDINAL SAFETY INVARIANT: NEVER raw-rm an orphan. A raw recursive delete can FOLLOW the
 * orphan's node_modules junction and gut the shared node_modules fleet-wide (ERR_MODULE_NOT_FOUND).
 * All removal goes through safeRecursiveRm, which unlinks every junction/symlink descendant
 * BEFORE fs.rmSync.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { classifyOrphanDirs, listActiveWorktrees, WORKTREE_QUOTA_HELPERS } from '../worktree-quota.js';
import { safeRecursiveRm } from '../worktree-manager.js';

// FR-3: never reap a dir created within this window (could be a worktree mid-`git worktree add`).
export const DEFAULT_ORPHAN_MIN_AGE_MS = 30 * 60 * 1000; // 30 min

/**
 * Resolve the recent-dir age threshold from env, falling back to the default. Non-finite or
 * negative env values fall back (fail-safe toward MORE conservatism, never 0/disabled by typo).
 * @param {NodeJS.ProcessEnv} [env=process.env]
 * @returns {number}
 */
export function resolveMinAgeMs(env = process.env) {
  const raw = env && env.WORKTREE_ORPHAN_MIN_AGE_MS;
  if (raw == null || raw === '') return DEFAULT_ORPHAN_MIN_AGE_MS;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_ORPHAN_MIN_AGE_MS;
}

// The typed-layout parent dirs. Worktrees live INSIDE these (.worktrees/qf/<id>,
// .worktrees/sd/<id>, .worktrees/adhoc/<id>), so an orphan under them is invisible to a
// top-level scan (classifyOrphanDirs skips these helper names at the top level). We descend
// one level into each so typed-layout leftovers (the dominant orphan case — e.g. a qf/<id>
// dir left behind when `git worktree remove` hits a Windows lock) are caught. `_archive` is
// deliberately NOT scanned: it is the reaper's preserve destination, not abandoned work.
const TYPED_SUBDIRS = ['qf', 'sd', 'adhoc'];

/**
 * PURE-over-IO: select the reapable orphan directories across BOTH the flat legacy layout
 * (.worktrees/<id>) and the typed layout (.worktrees/{qf,sd,adhoc}/<id>). Composes
 * classifyOrphanDirs per scan root (no change to its shared semantics) and merges. Returns
 * the actual paths so the caller can reclaim them.
 *
 * @param {{repoRoot: string, worktreesDir: string, now?: number, minAgeMs?: number,
 *          liveOwners?: Set<string>, gitRunner?: function, registered?: Array,
 *          listRegistered?: function}} opts
 * @returns {{reapable: number, reapableDirs: Array<{dir:string, full:string}>,
 *            excluded: Array<{dir:string, reason:string}>, total: number}}
 */
export function selectReapableOrphans(opts = {}) {
  const {
    repoRoot,
    worktreesDir,
    now = Date.now(),
    minAgeMs = DEFAULT_ORPHAN_MIN_AGE_MS,
    liveOwners = new Set(),
    gitRunner,
    listRegistered = listActiveWorktrees,
  } = opts;
  const registered = opts.registered || (repoRoot ? listRegistered(repoRoot) : []);
  const cfg = { liveOwners, gitRunner, minAgeMs, now };

  // Scan the top level (flat layout) plus each typed subdir (one level down).
  const scanRoots = [worktreesDir, ...TYPED_SUBDIRS.map((s) => path.join(worktreesDir, s))];
  const merged = { reapable: 0, reapableDirs: [], excluded: [], total: 0 };
  const seen = new Set();
  for (const rootDir of scanRoots) {
    let exists = false;
    try { exists = fs.existsSync(rootDir) && fs.statSync(rootDir).isDirectory(); } catch { exists = false; }
    if (!exists) continue;
    const r = classifyOrphanDirs(rootDir, registered, cfg);
    // Label nested entries with their typed prefix so summaries are unambiguous (qf/<id>).
    const prefix = rootDir === worktreesDir ? '' : path.basename(rootDir) + '/';
    for (const d of r.reapableDirs) {
      if (seen.has(d.full)) continue;
      seen.add(d.full);
      merged.reapableDirs.push({ dir: prefix + d.dir, full: d.full });
    }
    for (const e of r.excluded) merged.excluded.push({ dir: prefix + e.dir, reason: e.reason });
    merged.total += r.total;
  }
  merged.reapable = merged.reapableDirs.length;
  return merged;
}

/**
 * Best-effort recursive byte size of a directory, NOT following symlinks/junctions (so a
 * node_modules junction to the shared store is counted as ~0, not the whole shared tree).
 * Fail-soft: returns the bytes accumulated so far on any error.
 * @param {string} dir
 * @param {{fsImpl?: typeof fs}} [opts]
 * @returns {number}
 */
export function dirSizeBytes(dir, { fsImpl = fs } = {}) {
  let total = 0;
  let stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    let st;
    try { st = fsImpl.lstatSync(cur); } catch { continue; }
    if (st.isSymbolicLink()) continue; // never traverse a junction/symlink
    if (st.isDirectory()) {
      let entries;
      try { entries = fsImpl.readdirSync(cur); } catch { continue; }
      for (const e of entries) stack.push(path.join(cur, e));
    } else {
      total += st.size || 0;
    }
  }
  return total;
}

/**
 * Default junction-safe orphan remover. Orphans are UNREGISTERED by construction (the selection
 * excludes everything in `git worktree list`), so we go STRAIGHT to safeRecursiveRm — which
 * recursively unlinks EVERY junction/symlink descendant (not just the top-level node_modules)
 * BEFORE fs.rmSync. This is strictly safer than trying `git worktree remove --force` first,
 * whose pre-unlink only covers the top-level node_modules and could follow a NESTED junction
 * (review MEDIUM). A best-effort `git worktree prune` afterward clears any stale registration
 * for a prunable leftover. NEVER a raw fs.rmSync. Returns {ok, method, error?}.
 *
 * @param {string} full
 * @param {string} repoRoot
 * @param {{rm?: function, runGit?: function}} [deps] - injectable for tests
 * @returns {{ok: boolean, method: string, error?: string}}
 */
export function defaultRemoveOrphan(full, repoRoot, { rm = safeRecursiveRm, runGit } = {}) {
  const abs = path.resolve(full);
  try {
    if (!fs.existsSync(abs)) return { ok: true, method: 'already-gone' };
    rm(abs); // safeRecursiveRm: unlinks ALL junctions/symlinks BEFORE fs.rmSync — never raw-rm
    // Best-effort: clear a stale git registration for a prunable leftover. Never throws.
    try {
      if (runGit) runGit(['worktree', 'prune'], { cwd: repoRoot });
      else if (repoRoot) execSync('git worktree prune', { cwd: repoRoot, stdio: 'pipe' });
    } catch { /* prune is best-effort */ }
    return { ok: true, method: 'safe-recursive-rm' };
  } catch (e) {
    return { ok: false, method: 'failed', error: String(e?.message || e) };
  }
}

/**
 * Reclaim the selected orphan dirs. Dry-run by default (execute=false → removes nothing).
 * Fail-soft PER orphan: a removal error on one orphan is recorded and the loop continues.
 *
 * @param {Array<{dir:string, full:string}>} reapableDirs
 * @param {{execute?: boolean, repoRoot: string, remove?: function, sizeOf?: function,
 *          logger?: function}} [opts]
 * @returns {{reclaimed: Array<{dir, bytes, method}>, failed: Array<{dir, error}>,
 *            reclaimed_count: number, reclaimed_bytes: number, dry_run: boolean}}
 */
export function reclaimOrphans(reapableDirs = [], opts = {}) {
  const {
    execute = false,
    repoRoot,
    remove = defaultRemoveOrphan,
    sizeOf = (full) => dirSizeBytes(full),
    logger = () => {},
  } = opts;
  const reclaimed = [];
  const failed = [];
  for (const { dir, full } of reapableDirs) {
    let bytes = 0;
    try { bytes = sizeOf(full); } catch { bytes = 0; }
    if (!execute) { reclaimed.push({ dir, bytes, method: 'dry-run' }); continue; }
    try {
      const res = remove(full, repoRoot);
      if (res && res.ok) {
        reclaimed.push({ dir, bytes, method: res.method });
      } else {
        failed.push({ dir, error: (res && res.error) || 'unknown removal failure' });
        logger(`[orphan-sweep] FAILED to reclaim ${dir}: ${(res && res.error) || 'unknown'}`);
      }
    } catch (e) {
      // Fail-soft: never let one orphan abort the sweep.
      failed.push({ dir, error: String(e?.message || e) });
      logger(`[orphan-sweep] ERROR reclaiming ${dir}: ${String(e?.message || e)}`);
    }
  }
  const reclaimed_bytes = reclaimed.reduce((s, r) => s + (r.bytes || 0), 0);
  return {
    reclaimed,
    failed,
    reclaimed_count: reclaimed.length,
    reclaimed_bytes,
    dry_run: !execute,
  };
}

/**
 * Build the durable one-line summary record (stderr JSON line + best-effort audit_log).
 * @param {object} sel - selectReapableOrphans result
 * @param {object} rec - reclaimOrphans result
 * @param {{now?: number}} [opts]
 */
export function buildOrphanSummary(sel, rec, { now = Date.now() } = {}) {
  return {
    schema_version: 1,
    timestamp: new Date(now).toISOString(),
    event: 'orphan_sweep',
    scanned: sel.total,
    reapable: sel.reapable,
    excluded_count: sel.excluded.length,
    reclaimed_count: rec.reclaimed_count,
    reclaimed_bytes: rec.reclaimed_bytes,
    failed_count: rec.failed.length,
    dry_run: rec.dry_run,
  };
}

/**
 * Orchestrate one orphan sweep: select → reclaim → summarize. Top-level fail-soft so a sweep
 * error NEVER aborts the caller (the hourly reaper). The summary is emitted via `emit`.
 *
 * @param {{repoRoot: string, worktreesDir: string, execute?: boolean, minAgeMs?: number,
 *          now?: number, liveOwners?: Set<string>, gitRunner?: function, remove?: function,
 *          emit?: function, logger?: function, listRegistered?: function}} [opts]
 * @returns {{ok: boolean, summary?: object, error?: string}}
 */
export function runOrphanSweep(opts = {}) {
  const {
    repoRoot,
    worktreesDir,
    execute = false,
    minAgeMs = resolveMinAgeMs(),
    now = Date.now(),
    liveOwners,
    gitRunner,
    remove,
    emit = (rec) => { try { process.stderr.write(JSON.stringify(rec) + '\n'); } catch { /* ignore */ } },
    logger = (m) => { try { process.stderr.write(m + '\n'); } catch { /* ignore */ } },
    listRegistered,
  } = opts;
  try {
    const sel = selectReapableOrphans({ repoRoot, worktreesDir, now, minAgeMs, liveOwners, gitRunner, listRegistered });
    const rec = reclaimOrphans(sel.reapableDirs, { execute, repoRoot, remove, logger });
    const summary = buildOrphanSummary(sel, rec, { now });
    emit(summary);
    return { ok: true, summary, selection: sel, reclamation: rec };
  } catch (e) {
    // Cardinal fail-soft: a sweep failure must never break the reaper or the tick.
    const error = String(e?.message || e);
    logger(`[orphan-sweep] sweep aborted (fail-soft): ${error}`);
    return { ok: false, error };
  }
}

// Re-export the helper set for callers that want to display what is preserved.
export { WORKTREE_QUOTA_HELPERS };

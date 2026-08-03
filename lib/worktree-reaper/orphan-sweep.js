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
 *   • reclamation → SD-LEO-INFRA-ORPHAN-SWEEP-HARD-001 (FR-1): ARCHIVE-FIRST. The orphan path
 *                  MOVES the directory into `_archive` by rename and REFUSES if the rename
 *                  fails. It no longer deletes anything.
 *
 * CARDINAL SAFETY INVARIANT: NEVER raw-rm an orphan. A raw recursive delete can FOLLOW the
 * orphan's node_modules junction and gut the shared node_modules fleet-wide (ERR_MODULE_NOT_FOUND).
 * As of FR-1 this path performs NO deletion at all, which satisfies the invariant by construction:
 * rename() never dereferences a reparse point, so a junction moves as a junction and the shared
 * store is untouched. The removal-time pre-unlink in safeRecursiveRm remains intact and is still
 * the guard for the Stage-1/2 reaper paths, which DO delete (TR-2) — do not weaken it there.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { classifyOrphanDirs, listActiveWorktrees, WORKTREE_QUOTA_HELPERS } from '../worktree-quota.js';
// SD-LEO-INFRA-ORPHAN-SWEEP-HARD-001 (FR-2/FR-3): the bounded content probe, supplied to
// classifyOrphanDirs on the SWEEP path only (it is opt-in there — see the note at its call site).
import { probeContent } from './orphan-content-probe.mjs';

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
// SD-LEO-INFRA-ORPHAN-SWEEP-HARD-001 (FR-1/FR-5): the archive destination, and the name that must
// never appear in scanRoots above. FR-1 makes this directory the SOLE custodian of everything the
// sweep preserves, so the value behind that one exclusion just went up sharply — hence the
// regression test asserting _archive is never scanned. Note isReapable's container guard matches
// path.basename only, so it protects a dir NAMED _archive but not its children
// (.worktrees/_archive/SD-FOO has basename SD-FOO); the exclusion here is what actually covers them.
export const ARCHIVE_DIR_NAME = '_archive';

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
  // SD-LEO-INFRA-ORPHAN-SWEEP-HARD-001 (FR-2/FR-3): supply the bounded content probe HERE, on the
  // sweep path only. classifyOrphanDirs treats it as opt-in precisely so the worktree-quota hot
  // path — which reaches that function on every `git worktree add` and performs zero per-dir I/O
  // today — does not inherit a directory walk. Injectable for tests.
  const probe = opts.probe || ((dir) => probeContent(dir, { fsImpl: fs, pathImpl: path }));
  const cfg = { liveOwners, gitRunner, minAgeMs, now, probe };

  // Scan the top level (flat layout) plus each typed subdir (one level down).
  // FR-5: `_archive` appears in NEITHER list — not as a scan root here, and skipped as a top-level
  // entry by WORKTREE_QUOTA_HELPERS inside classifyOrphanDirs. Both layers matter, because
  // isReapable's container guard matches path.basename only: `_archive/SD-FOO` has basename
  // `SD-FOO`, so an archived tree would look like an ordinary orphan if it were ever scanned.
  const scanRoots = [worktreesDir, ...TYPED_SUBDIRS.map((s) => path.join(worktreesDir, s))];
  const merged = { reapable: 0, reapableDirs: [], excluded: [], refused: [], total: 0 };
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
    // FR-4: refusals MUST flow through to the report. Dropping them here would leave FR-3
    // technically implemented and operationally invisible — the directory would be spared, but
    // nobody would learn it needs a human decision, which is the whole reason it was spared.
    for (const x of r.refused || []) {
      merged.refused.push({ dir: prefix + x.dir, full: x.full, reason: x.reason, files: x.files, newestMtimeMs: x.newestMtimeMs });
    }
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
 * Default orphan RECLAIMER — archive-first as of FR-1; it no longer removes anything.
 * Orphans are UNREGISTERED by construction (the selection excludes everything in
 * `git worktree list`), so the directory is moved wholesale into `_archive` by a single rename.
 * A rename that fails REFUSES and leaves the source in place — see the long note in the body for
 * why there is deliberately no copy-then-delete fallback.
 * A best-effort `git worktree prune` afterward clears any stale registration
 * for a prunable leftover. NEVER a raw fs.rmSync. Returns {ok, method, error?}.
 *
 * @param {string} full
 * @param {string} repoRoot
 * @param {{rm?: function, runGit?: function}} [deps] - injectable for tests
 * @returns {{ok: boolean, method: string, error?: string}}
 */
export function defaultRemoveOrphan(full, repoRoot, { runGit, renameImpl, fsImpl = fs, now } = {}) {
  // SD-LEO-INFRA-ORPHAN-SWEEP-HARD-001 (FR-1): ARCHIVE-FIRST, RENAME-ONLY, REFUSE ON FAILURE.
  //
  // This function used to call safeRecursiveRm directly. On 2026-08-01 that hard-deleted 42,162
  // files / 601,021,494 bytes with no archived copy — content a peer had inspected and refused to
  // remove and the coordinator had declined to authorise. The whole class becomes recoverable by
  // moving instead of deleting.
  //
  // WHY RENAME-ONLY, AND WHY NO COPY FALLBACK — this is the subtle part, and getting it wrong
  // would reproduce the incident wearing a fix's paint. _archiveWorktreeDir falls back to
  // safeRecursiveCp + rm when rename throws, and safeRecursiveCp wraps its per-child lstat in a
  // catch whose body is a bare `continue` (worktree-manager.js:1438-1442) — it SILENTLY SKIPS any
  // child it cannot stat, then reports success, and the caller then deletes the source. These dirs
  // are orphans precisely BECAUSE a prior removal hit a Windows lock (3 of 4 candidates in the
  // incident failed on EPERM), so the locked-tree case is the LIKELY branch here, not an edge case.
  // Copy-then-delete on a locked tree yields a TRUNCATED archive with a success verdict. So: a
  // rename that fails REFUSES and leaves the source untouched. Nothing is ever deleted here.
  //
  // JUNCTION SAFETY: rename() / MoveFileEx is a directory-entry operation that never dereferences
  // a reparse point, so a node_modules junction moves as a junction and still points at the shared
  // store. That is an OS guarantee, not application code — no pre-unlink is needed on this path,
  // and the removal-time pre-unlink in safeRecursiveRm stays intact for the Stage-1/2 paths (TR-2).
  //
  // NO POST-MOVE VERIFICATION WALK: rename completeness is likewise an OS guarantee. Walking the
  // destination to "confirm" it would re-import the unbounded-walk hazard FR-2 exists to remove —
  // on the very trees most likely to be huge.
  const abs = path.resolve(full);
  const rename = renameImpl || ((a, b) => fsImpl.renameSync(a, b));
  try {
    if (!fsImpl.existsSync(abs)) return { ok: true, method: 'already-gone' };

    const archiveDir = path.join(path.dirname(abs), ARCHIVE_DIR_NAME);
    fsImpl.mkdirSync(archiveDir, { recursive: true });
    // Same timestamped convention as the Stage-1/2 archive path.
    const stamp = new Date(typeof now === 'number' ? now : Date.now()).toISOString().replace(/[:.]/g, '-');
    let dest = path.join(archiveDir, `${path.basename(abs)}-${stamp}`);
    // The Stage-1/2 archiver has NO collision check; millisecond stamps make it rare, not
    // impossible, and a collision there surfaces as a generic rename throw. Refuse explicitly
    // rather than letting a name clash read as a locked tree.
    if (fsImpl.existsSync(dest)) {
      return { ok: false, method: 'refused', error: `archive destination already exists: ${dest}` };
    }

    rename(abs, dest);

    // Best-effort: clear a stale git registration for a prunable leftover. Never throws.
    try {
      if (runGit) runGit(['worktree', 'prune'], { cwd: repoRoot });
      else if (repoRoot) execSync('git worktree prune', { cwd: repoRoot, stdio: 'pipe' });
    } catch { /* prune is best-effort */ }
    return { ok: true, method: 'archived', archivePath: dest };
  } catch (e) {
    // REFUSED, not failed-then-deleted. The source is still on disk and still inspectable.
    return { ok: false, method: 'refused', error: String(e?.message || e) };
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
    // SD-LEO-INFRA-ORPHAN-SWEEP-HARD-001 (FR-4): refusals are ENUMERATED, not just counted.
    // The incident summary recorded excluded_count=0 and reclaimed_count=1 — technically true and
    // operationally useless: it named no directory, so nothing in the durable record said WHAT had
    // been deleted or WHAT still needed a human. A refused dir that nobody can identify is spared
    // and then forgotten, which is how a 707MB tree sat unattributed for two days.
    refused_count: (sel.refused || []).length,
    refused: (sel.refused || []).map((r) => ({
      dir: r.dir, reason: r.reason, files: r.files, newest_mtime_ms: r.newestMtimeMs,
    })),
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

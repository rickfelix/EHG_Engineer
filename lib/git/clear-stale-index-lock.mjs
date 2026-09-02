/**
 * clear-stale-index-lock.mjs — SD-REFILL-00KUKQVS
 *
 * A RECURRING stale `.git/index.lock` in the SHARED main checkout (coordinator + Adam both
 * run there, unlike workers which have isolated worktrees) silently froze the checkout behind
 * origin/main: a crashed/concurrent git index op left a `.git/index.lock` that then blocked
 * fetch/merge/commit, so the checkout drifted (the Adam-not-in-sync incident — 125 commits
 * behind from a 25h-stale lock; a NEW 0-byte lock re-appeared within ~5min).
 *
 * This pure helper removes the lock ONLY when it is STALE:
 *   - 0-byte  → a real in-progress git op writes content into index.lock; a 0-byte lock is a
 *               crash-orphaned remnant.
 *   - OR mtime older than maxAgeMs → git index ops complete in milliseconds; a lock older than
 *               the (generous) threshold is orphaned.
 * A FRESH, non-empty lock (age < maxAgeMs) is an ACTIVE op and is NEVER removed (removing a
 * live lock would corrupt the concurrent op). Pure + injectable (fs, now) for tests; never throws.
 */
import path from 'node:path';
import realFs from 'node:fs';
import { DEFAULT_DWELL_MS } from './index-jam-detector.js';

export const DEFAULT_STALE_LOCK_MAX_AGE_MS = 120_000; // 2 min — git index ops are sub-second; this is generous

/**
 * @param {object} opts
 * @param {string} opts.repoRoot - the SHARED checkout root (where `.git` is a DIRECTORY)
 * @param {number} [opts.maxAgeMs=DEFAULT_STALE_LOCK_MAX_AGE_MS]
 * @param {object} [opts.fs] - injectable fs (statSync/unlinkSync)
 * @param {number} [opts.now] - injectable clock (ms)
 * @returns {{cleared:boolean, reason:string, ageMs?:number, size?:number, error?:string}}
 */
export function clearStaleGitIndexLock(opts = {}) {
  const { repoRoot, maxAgeMs = DEFAULT_STALE_LOCK_MAX_AGE_MS, fs = realFs, now = Date.now() } = opts;
  if (!repoRoot) return { cleared: false, reason: 'no_repo_root' };
  const lockPath = path.join(repoRoot, '.git', 'index.lock');

  let stat;
  try {
    stat = fs.statSync(lockPath);
  } catch {
    return { cleared: false, reason: 'absent' }; // no lock → nothing to do (the common case)
  }

  const ageMs = now - stat.mtimeMs;
  const isZeroByte = stat.size === 0;

  // FRESH + non-empty = an active git op. NEVER touch it.
  if (!isZeroByte && ageMs < maxAgeMs) {
    return { cleared: false, reason: 'fresh_active', ageMs, size: stat.size };
  }

  try {
    fs.unlinkSync(lockPath);
    return { cleared: true, reason: isZeroByte ? 'zero_byte' : 'stale_mtime', ageMs, size: stat.size };
  } catch (e) {
    return { cleared: false, reason: 'unlink_failed', error: (e && e.message) || String(e) };
  }
}

/**
 * QF-20260902-780: an UNATTENDED (scheduled, no human eyeballing it first) variant of the
 * clear above. Unlike clearStaleGitIndexLock — which clears a 0-byte lock immediately at ANY
 * age, and a non-zero lock past a plain mtime-age threshold — this function:
 *   - NEVER clears a non-zero lock, at any age (a genuinely live git op may legitimately hold
 *     one; the interactive STEP 1.5 stays the only path that ever touches those, by a human's
 *     deliberate choice to run it);
 *   - only clears a 0-byte lock once it has persisted past `dwellMs` (default
 *     lib/git/index-jam-detector.js's DEFAULT_DWELL_MS, the same measured 90s floor the jam
 *     detector uses — reused, not reinvented), guarding against the race of clearing a lock
 *     that was JUST created by a live op an instant before this check ran.
 * @param {object} opts
 * @param {string} opts.repoRoot
 * @param {number} [opts.dwellMs=DEFAULT_DWELL_MS]
 * @param {object} [opts.fs]
 * @param {number} [opts.now]
 * @returns {{cleared:boolean, reason:string, ageMs?:number}}
 */
export function clearStaleZeroByteIndexLockAfterDwell(opts = {}) {
  const { repoRoot, dwellMs = DEFAULT_DWELL_MS, fs = realFs, now = Date.now() } = opts;
  if (!repoRoot) return { cleared: false, reason: 'no_repo_root' };
  const lockPath = path.join(repoRoot, '.git', 'index.lock');

  let stat;
  try {
    stat = fs.statSync(lockPath);
  } catch {
    return { cleared: false, reason: 'absent' };
  }

  if (stat.size !== 0) return { cleared: false, reason: 'non_zero_never_touched', size: stat.size };

  const ageMs = now - stat.mtimeMs;
  if (ageMs < dwellMs) return { cleared: false, reason: 'zero_byte_within_dwell', ageMs };

  try {
    fs.unlinkSync(lockPath);
    return { cleared: true, reason: 'zero_byte_past_dwell', ageMs };
  } catch (e) {
    return { cleared: false, reason: 'unlink_failed', error: (e && e.message) || String(e) };
  }
}

/**
 * lib/coordinator/trigger-rank-pass.mjs — SD-LEO-INFRA-GUARANTEE-CLAIMABLE-SD-RANKED-001-C (FR-1/FR-4)
 *
 * Shared fire-and-forget trigger for an event-driven belt-wide rank pass, invoked at 3
 * transition points (SD creation, needs_coordinator_review clearance, predecessor
 * completion) so a freshly-claimable SD is never invisible to a parked worker for up to
 * the 15-min coordinator-backlog-rank.mjs cron window.
 *
 * Debounced via a filesystem lockfile (mirrors lib/npm-install-lock.js's Windows-safe
 * 'wx'-flag atomic-create + stale-age pattern — NOT in-memory, since the 3 call sites run
 * in 3 separate OS processes). Spawns the EXISTING coordinator-backlog-rank.mjs verbatim
 * (reuses its ranking algorithm, never reimplements it) with RANK_EVENT_TRIGGER=1 scoped
 * ONLY to the spawned child's env — this bypasses the coordinator-vs-coordinator mutation
 * guard for this one invocation (a full re-rank is idempotent/deterministic, unlike the
 * stateful duties that guard protects). Never set on process.env directly: an interactive
 * coordinator session inheriting this var would skip its OWN single-writer guard.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RANKER_SCRIPT = path.resolve(__dirname, '../../scripts/coordinator-backlog-rank.mjs');
const DEFAULT_LOCK_PATH = path.resolve(__dirname, '../../node_modules/.rank-pass-trigger.lock');
export const DEBOUNCE_MS = 30 * 1000;

function isProcessRunning(pid) {
  if (!pid || typeof pid !== 'number') return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM'; // exists but no permission -> still running
  }
}

/**
 * acquireDebounceLock — true if this call may proceed (no fresh lock held by a live process).
 * Mirrors lib/npm-install-lock.js's acquireLock() stale/dead-holder handling.
 * @param {string} [lockPath] test-injectable lock file path (defaults to the real shared lock)
 * @returns {boolean}
 */
export function acquireDebounceLock(lockPath = DEFAULT_LOCK_PATH) {
  if (fs.existsSync(lockPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
      const age = Date.now() - data.timestamp;
      if (age > DEBOUNCE_MS) {
        fs.unlinkSync(lockPath); // stale — fall through to re-acquire
      } else if (data.pid && !isProcessRunning(data.pid)) {
        fs.unlinkSync(lockPath); // dead holder — fall through to re-acquire
      } else {
        return false; // fresh lock, live holder — debounced
      }
    } catch {
      try { fs.unlinkSync(lockPath); } catch { /* best-effort cleanup of a corrupt lock */ }
    }
  }

  const dir = path.dirname(lockPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  try {
    fs.writeFileSync(lockPath, JSON.stringify({ pid: process.pid, timestamp: Date.now() }), { flag: 'wx' });
    return true;
  } catch (err) {
    // EEXIST: another process won the race between our check and write — debounced.
    // Any other error: don't let lock machinery block the actual trigger.
    return err.code !== 'EEXIST';
  }
}

/**
 * triggerRankPass — fire-and-forget event-driven rank pass. Never throws; a failure here
 * must never block SD creation, review clearance, or SD completion.
 *
 * @param {object} [opts]
 * @param {string} [opts.reason] human-readable trigger source, for logging
 * @param {string} [opts.sdKey] the SD that triggered this pass, for logging
 * @param {Function} [opts.spawnFn] test-injection seam (defaults to node:child_process.spawn)
 * @param {string} [opts.lockPath] test-injection seam for the debounce lock file path
 * @returns {{triggered: boolean, reason: string}}
 */
export function triggerRankPass(opts = {}) {
  const { reason = 'event', sdKey, spawnFn = spawn, lockPath = DEFAULT_LOCK_PATH } = opts;

  try {
    if (!acquireDebounceLock(lockPath)) {
      return { triggered: false, reason: 'debounced' };
    }
  } catch (lockErr) {
    // Lock machinery itself must never block the trigger — fail OPEN (proceed to spawn).
    console.warn(`   [rank-pass-trigger] debounce lock check failed (non-blocking): ${lockErr.message}`);
  }

  try {
    const child = spawnFn('node', [RANKER_SCRIPT], {
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, RANK_EVENT_TRIGGER: '1' },
    });
    child.on('error', (err) => {
      console.warn(`   [rank-pass-trigger] spawn failed for ${reason}${sdKey ? ` (${sdKey})` : ''} (non-blocking): ${err.message}`);
    });
    if (typeof child.unref === 'function') child.unref();
    return { triggered: true, reason };
  } catch (spawnErr) {
    console.warn(`   [rank-pass-trigger] spawn threw for ${reason}${sdKey ? ` (${sdKey})` : ''} (non-blocking): ${spawnErr.message}`);
    return { triggered: false, reason: 'spawn_error' };
  }
}

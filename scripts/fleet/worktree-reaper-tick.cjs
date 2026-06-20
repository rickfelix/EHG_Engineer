/**
 * Worktree reaper tick — invoked on a slower cadence inside stale-session-sweep.
 *
 * SD-LEO-INFRA-FORMALIZED-WORKTREE-REAPER-001
 *
 * The session sweep runs every 5 minutes; we want the reaper on a ~1-hour
 * cadence so enumeration + DB queries don't slow down the hot path. A simple
 * counter at `.claude/worktree-reaper-state.json` is incremented on every
 * invocation; the reaper is spawned only when `counter % cadence === 0`.
 *
 * Safety contract:
 *   • Never throws. Any error is logged and swallowed — the sweep must
 *     complete its claim-cleanup work even when the reaper pipeline is broken.
 *   • Feature-flagged by `WORKTREE_REAPER_ENABLED`. Defaults to true; set to
 *     'false' (or '0') to disable the integration without reverting code.
 *   • Dry-run by default. The reaper only mutates when explicitly enabled via
 *     `WORKTREE_REAPER_EXECUTE` (set to 'stage1' or 'stage2').
 *   • State file write is atomic (write tmp, rename).
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const DEFAULT_CADENCE = 12; // every 12th sweep ≈ 1 hour at 5-min intervals
const STATE_RELATIVE = path.join('.claude', 'worktree-reaper-state.json');
const STATE_SCHEMA_VERSION = 1;

// SD-MAN-INFRA-COORDINATOR-WORKTREE-POOL-001 (FR-002): pool-utilization watchdog.
// Mirrors lib/worktree-quota.js::MAX_WORKTREE_COUNT (kept in sync; the .cjs tick
// cannot `require` the ESM quota module, so the cap is duplicated as a constant).
const MAX_WORKTREE_COUNT = 20;
const DEFAULT_POOL_THRESHOLD = 0.8;

function readState(statePath) {
  // SD-FDBK-INFRA-WORKTREE-REAPER-RELIABILITY-001: last_pid/last_spawn_at are additive
  // (schema stays v1); old state files without them default to null.
  if (!fs.existsSync(statePath)) return { schema_version: STATE_SCHEMA_VERSION, sweep_counter: 0, last_run_at: null, last_result: null, last_pid: null, last_spawn_at: null };
  try {
    const raw = fs.readFileSync(statePath, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      schema_version: parsed.schema_version || STATE_SCHEMA_VERSION,
      sweep_counter: Number.isFinite(parsed.sweep_counter) ? parsed.sweep_counter : 0,
      last_run_at: parsed.last_run_at || null,
      last_result: parsed.last_result || null,
      last_pid: Number.isInteger(parsed.last_pid) ? parsed.last_pid : null,
      last_spawn_at: parsed.last_spawn_at || null,
    };
  } catch {
    return { schema_version: STATE_SCHEMA_VERSION, sweep_counter: 0, last_run_at: null, last_result: null, last_pid: null, last_spawn_at: null };
  }
}

/**
 * Liveness probe via signal-0. Returns true if the pid is a running process
 * (ours → clean return; alive-but-not-ours → EPERM). A missing process throws
 * ESRCH → false. Used by the single-flight guard so a new tick never stacks a
 * second reaper on top of one that is still running.
 */
function isPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return !!(e && e.code === 'EPERM');
  }
}

function writeState(statePath, state) {
  try {
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    const tmp = statePath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
    fs.renameSync(tmp, statePath);
  } catch {
    // Best-effort. If we can't persist, the counter resets on next tick.
  }
}

function isEnabled() {
  const v = (process.env.WORKTREE_REAPER_ENABLED || '').trim().toLowerCase();
  if (v === 'false' || v === '0' || v === 'off' || v === 'no') return false;
  return true;
}

function resolveExecuteMode() {
  const v = (process.env.WORKTREE_REAPER_EXECUTE || '').trim().toLowerCase();
  if (v === 'stage1' || v === 'execute') return { execute: true, stage2: false };
  if (v === 'stage2' || v === 'all') return { execute: true, stage2: true };
  return { execute: false, stage2: false };
}

// ── Pool-utilization watchdog (SD-MAN-INFRA-COORDINATOR-WORKTREE-POOL-001) ──

/**
 * Resolve the watchdog threshold from WORKTREE_POOL_THRESHOLD (a fraction in
 * (0,1]); falls back to DEFAULT_POOL_THRESHOLD on absent/invalid input.
 */
function resolvePoolThreshold() {
  const raw = (process.env.WORKTREE_POOL_THRESHOLD || '').trim();
  if (!raw) return DEFAULT_POOL_THRESHOLD;
  const n = parseFloat(raw);
  if (Number.isFinite(n) && n > 0 && n <= 1) return n;
  return DEFAULT_POOL_THRESHOLD;
}

/**
 * Count git-registered worktrees (excluding the main checkout) for repoRoot.
 * Duplicates lib/worktree-quota.js::countActiveWorktrees because this CJS tick
 * cannot import the ESM module. Returns null on any git failure (watchdog then
 * no-ops rather than acting on a bad count).
 */
function countActiveWorktrees(repoRoot, runner = spawnSync) {
  let res;
  try {
    res = runner('git', ['worktree', 'list', '--porcelain'], {
      cwd: repoRoot, encoding: 'utf8', windowsHide: true,
    });
  } catch { return null; }
  if (!res || res.status !== 0 || typeof res.stdout !== 'string') return null;
  const normRoot = path.resolve(repoRoot).replace(/\\/g, '/');
  let count = 0;
  let current = null;
  let bare = false;
  const flush = () => {
    if (current) {
      const p = path.resolve(current).replace(/\\/g, '/');
      if (!bare && p !== normRoot) count++;
    }
    current = null; bare = false;
  };
  for (const line of res.stdout.split('\n')) {
    if (line.startsWith('worktree ')) { flush(); current = line.slice('worktree '.length).trim(); }
    else if (line === 'bare') { bare = true; }
  }
  flush();
  return count;
}

/**
 * Pure watchdog decision: given used/cap/threshold, decide whether Stage-0
 * reclaim should fire. Returns { triggered, used, cap, utilization, percent,
 * threshold }. Stays pure (no I/O) so it is trivially unit-testable.
 */
function poolWatchdogDecision({ used, cap = MAX_WORKTREE_COUNT, threshold = DEFAULT_POOL_THRESHOLD }) {
  const safeCap = cap > 0 ? cap : MAX_WORKTREE_COUNT;
  const utilization = (Number.isFinite(used) ? used : 0) / safeCap;
  return {
    triggered: Number.isFinite(used) && utilization >= threshold,
    used, cap: safeCap, utilization, percent: Math.round(utilization * 100), threshold,
  };
}

/**
 * SD-LEO-INFRA-WIRE-ALL-POOLS-001: should the hourly tick reap EVERY registered pool?
 * Default ON; opt out only with a falsey WORKTREE_REAPER_ALL_POOLS token (false/0/off/no),
 * mirroring the WORKTREE_POOL_WATCHDOG convention. Pure (env injected) for unit testing.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean}
 */
function isAllPoolsEnabled(env = process.env) {
  return !['false', '0', 'off', 'no'].includes(
    String(env.WORKTREE_REAPER_ALL_POOLS || '').trim().toLowerCase(),
  );
}

/**
 * Build the argv for the reaper spawn. Pure (no I/O) so the flag wiring is unit-testable.
 * With `allPools` true the reaper fans out a per-pool --repo child running the unchanged
 * single-repo reaper (active-claim-protected, preserve-before-delete, dry-run-default all
 * inherited; buildPassthroughFlags excludes --all-pools/--repo so no child re-fans-out).
 * Without it, only the current repo is reaped — the pre-2026-06-20 behavior. The current
 * repo stays covered either way (it is one of the pools resolveRegisteredPools returns).
 * The watchdog appends --stage0/--execute to this base array afterward.
 * @param {{ reaperScript:string, execute?:boolean, stage2?:boolean, allPools?:boolean }} o
 * @returns {string[]}
 */
function buildReaperArgs({ reaperScript, execute, stage2, allPools }) {
  const args = [reaperScript];
  if (execute) args.push('--execute');
  if (stage2) args.push('--stage2', '--yes');
  if (allPools) args.push('--all-pools');
  return args;
}

/**
 * Tick the counter and invoke the reaper when due.
 * Returns the post-invocation state for caller visibility.
 *
 * @param {object} [opts]
 * @param {string} [opts.repoRoot] - override repo root (default: cwd)
 * @param {number} [opts.cadence]  - override cadence (default: 12)
 * @param {(msg: string) => void} [opts.logger] - log sink (default: console.log)
 * @param {boolean} [opts.force]   - run now regardless of counter (tests)
 * @returns {object} { invoked, counter, cadence, result, enabled }
 */
function tick(opts = {}) {
  const repoRoot = opts.repoRoot || process.cwd();
  const cadence = Number.isFinite(opts.cadence) && opts.cadence > 0 ? opts.cadence : DEFAULT_CADENCE;
  const logger = opts.logger || ((m) => console.log(m));
  const statePath = path.join(repoRoot, STATE_RELATIVE);

  if (!isEnabled()) {
    return { invoked: false, counter: null, cadence, result: 'disabled', enabled: false };
  }

  const state = readState(statePath);
  state.sweep_counter = (state.sweep_counter || 0) + 1;

  const due = opts.force === true || state.sweep_counter % cadence === 0;
  if (!due) {
    writeState(statePath, state);
    return { invoked: false, counter: state.sweep_counter, cadence, result: 'skipped_not_due', enabled: true };
  }

  const { execute, stage2 } = resolveExecuteMode();
  const reaperScript = path.join(repoRoot, 'scripts', 'worktree-reaper.mjs');
  if (!fs.existsSync(reaperScript)) {
    state.last_run_at = new Date().toISOString();
    state.last_result = 'script_missing';
    writeState(statePath, state);
    return { invoked: false, counter: state.sweep_counter, cadence, result: 'script_missing', enabled: true };
  }

  // Single-flight guard: if the previous reaper is still running, do not stack a
  // second one. A new sweep tick fires hourly; a slow stage2 reap could still be
  // mid-run, and overlapping reapers race on the same worktrees.
  if (isPidAlive(state.last_pid)) {
    logger(`WORKTREE REAPER TICK: sweep=${state.sweep_counter} — prior reaper (pid=${state.last_pid}) still running; skipping launch`);
    state.last_run_at = new Date().toISOString();
    state.last_result = 'skipped_in_flight';
    writeState(statePath, state);
    return { invoked: false, counter: state.sweep_counter, cadence, result: 'skipped_in_flight', pid: state.last_pid, enabled: true };
  }

  const args = buildReaperArgs({ reaperScript, execute, stage2, allPools: isAllPoolsEnabled() });

  // SD-MAN-INFRA-COORDINATOR-WORKTREE-POOL-001 (FR-002): pool-utilization watchdog.
  // When the pool is at/above threshold, proactively run Stage-0 (terminal-SD
  // reclaim) so the fleet never silently stalls at the 20/20 cap. Stage-0 is
  // age-agnostic but still claim-guarded + activeSdSet-guarded inside the reaper,
  // and idempotent (a second tick over the same state reclaims nothing new).
  // Disable with WORKTREE_POOL_WATCHDOG=off. Forcing --execute here is intentional:
  // a watchdog that only dry-runs cannot relieve the cap.
  const watchdogEnabled = !['false', '0', 'off', 'no'].includes(
    (process.env.WORKTREE_POOL_WATCHDOG || '').trim().toLowerCase(),
  );
  let watchdog = null;
  if (watchdogEnabled) {
    const used = countActiveWorktrees(repoRoot);
    watchdog = poolWatchdogDecision({ used, cap: MAX_WORKTREE_COUNT, threshold: resolvePoolThreshold() });
    if (watchdog.triggered) {
      if (!args.includes('--stage0')) args.push('--stage0');
      if (!args.includes('--execute')) args.push('--execute');
      logger(`WORKTREE POOL WATCHDOG: ${watchdog.used}/${watchdog.cap} (${watchdog.percent}%) ≥ ${Math.round(watchdog.threshold * 100)}% → Stage-0 reclaim armed`);
    }
  }

  logger(`WORKTREE REAPER TICK: sweep=${state.sweep_counter} cadence=${cadence} execute=${execute || (watchdog && watchdog.triggered)} stage2=${stage2}${watchdog && watchdog.triggered ? ' stage0=true' : ''}`);

  // SD-FDBK-INFRA-WORKTREE-REAPER-RELIABILITY-001: run the reaper OUT-OF-BAND.
  // Previously this blocked the sweep on a synchronous spawnSync (timeout 5 min).
  // The sweep is launched by the coordinator with a ~2-min process budget, so a slow
  // stage2 reap blocked the sweep past its budget and the WHOLE sweep was SIGTERM'd
  // (exit 143). A detached + unref'd child lets the sweep return immediately while the
  // reaper runs independently; its stdout/stderr go to a log file instead of the
  // sweep's stdio. The reaper self-recovers on later ticks, so a killed/slow reap is safe.
  let result = 'unknown';
  let pid = null;
  try {
    const logPath = path.join(repoRoot, '.claude', 'worktree-reaper-last.log');
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    const logFd = fs.openSync(logPath, 'a');
    try {
      fs.writeSync(logFd, `\n=== reaper spawned ${new Date().toISOString()} sweep=${state.sweep_counter} execute=${execute} stage2=${stage2} ===\n`);
      const child = spawn(process.execPath, args, {
        cwd: repoRoot,
        detached: true,
        windowsHide: true,
        stdio: ['ignore', logFd, logFd],
      });
      child.unref();
      pid = child.pid || null;
      result = 'spawned';
      logger(`  reaper spawned out-of-band (pid=${pid}) — output -> ${logPath}`);
    } finally {
      fs.closeSync(logFd); // child has its own duped fd; closing the parent copy is safe
    }
  } catch (e) {
    // Never throw — the sweep's claim-cleanup must complete regardless.
    result = 'spawn_error:' + (e && e.code ? e.code : 'unknown');
    logger(`  reaper spawn failed: ${e && e.message ? e.message : String(e)}`);
  }

  state.last_run_at = new Date().toISOString();
  state.last_result = result;
  if (result === 'spawned') {
    state.last_pid = pid;
    state.last_spawn_at = new Date().toISOString();
  } else {
    state.last_pid = null;
  }
  writeState(statePath, state);

  return { invoked: result === 'spawned', counter: state.sweep_counter, cadence, result, pid, enabled: true, watchdog };
}

module.exports = {
  tick,
  readState,
  writeState,
  isEnabled,
  isPidAlive,
  resolveExecuteMode,
  resolvePoolThreshold,
  countActiveWorktrees,
  poolWatchdogDecision,
  isAllPoolsEnabled,
  buildReaperArgs,
  DEFAULT_CADENCE,
  DEFAULT_POOL_THRESHOLD,
  MAX_WORKTREE_COUNT,
  STATE_RELATIVE,
};

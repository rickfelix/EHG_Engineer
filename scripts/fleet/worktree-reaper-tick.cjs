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
const { spawn } = require('node:child_process');

const DEFAULT_CADENCE = 12; // every 12th sweep ≈ 1 hour at 5-min intervals
const STATE_RELATIVE = path.join('.claude', 'worktree-reaper-state.json');
const STATE_SCHEMA_VERSION = 1;

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

  const args = [reaperScript];
  if (execute) args.push('--execute');
  if (stage2) args.push('--stage2', '--yes');

  logger(`WORKTREE REAPER TICK: sweep=${state.sweep_counter} cadence=${cadence} execute=${execute} stage2=${stage2}`);

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

  return { invoked: result === 'spawned', counter: state.sweep_counter, cadence, result, pid, enabled: true };
}

module.exports = {
  tick,
  readState,
  writeState,
  isEnabled,
  isPidAlive,
  resolveExecuteMode,
  DEFAULT_CADENCE,
  STATE_RELATIVE,
};

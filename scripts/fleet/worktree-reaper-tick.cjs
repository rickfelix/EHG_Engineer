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
const { spawnSync } = require('node:child_process');

const DEFAULT_CADENCE = 12; // every 12th sweep ≈ 1 hour at 5-min intervals
const STATE_RELATIVE = path.join('.claude', 'worktree-reaper-state.json');
const STATE_SCHEMA_VERSION = 1;

function readState(statePath) {
  if (!fs.existsSync(statePath)) return { schema_version: STATE_SCHEMA_VERSION, sweep_counter: 0, last_run_at: null, last_result: null };
  try {
    const raw = fs.readFileSync(statePath, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      schema_version: parsed.schema_version || STATE_SCHEMA_VERSION,
      sweep_counter: Number.isFinite(parsed.sweep_counter) ? parsed.sweep_counter : 0,
      last_run_at: parsed.last_run_at || null,
      last_result: parsed.last_result || null,
    };
  } catch {
    return { schema_version: STATE_SCHEMA_VERSION, sweep_counter: 0, last_run_at: null, last_result: null };
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

  const args = [reaperScript];
  if (execute) args.push('--execute');
  if (stage2) args.push('--stage2', '--yes');

  logger(`WORKTREE REAPER TICK: sweep=${state.sweep_counter} cadence=${cadence} execute=${execute} stage2=${stage2}`);

  let result = 'unknown';
  try {
    const res = spawnSync(process.execPath, args, {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
      windowsHide: true,
      timeout: 5 * 60 * 1000,
    });
    if (res.error) {
      result = 'spawn_error:' + (res.error.code || 'unknown');
    } else if (res.status === 0) {
      result = 'pass';
    } else if (res.status === 2) {
      result = 'cwd_guard_triggered';
    } else {
      result = `exit_${res.status}`;
    }
    // Emit one summary line; full output goes to the sweep's stderr/stdout.
    const stdout = (res.stdout || '').split('\n').filter(Boolean);
    const summaryLine = stdout.find((l) => l.startsWith('Stage 1') || l.includes('WORKTREE REAPER')) || '';
    if (summaryLine) logger(`  ${summaryLine.trim()}`);
  } catch (e) {
    result = 'exception';
    logger(`  reaper threw: ${e && e.message ? e.message : String(e)}`);
  }

  state.last_run_at = new Date().toISOString();
  state.last_result = result;
  writeState(statePath, state);

  return { invoked: true, counter: state.sweep_counter, cadence, result, enabled: true };
}

module.exports = {
  tick,
  readState,
  writeState,
  isEnabled,
  resolveExecuteMode,
  DEFAULT_CADENCE,
  STATE_RELATIVE,
};

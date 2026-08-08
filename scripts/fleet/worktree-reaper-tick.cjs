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
// Module-level, NOT the lazy require inside resolveReaperSourceRoot: the reaper child spawn in
// tick() needs it too, and a function-scoped binding would be a ReferenceError on exactly the
// branch that launches the destructive process — a crash that only appears when the reaper runs.
const { scrubGitEnv, makeScrubbedGitRunner } = require('../../lib/fleet/source-tree-refresh.cjs');

// SD-LEO-INFRA-SPAWN-ROOT-CURRENCY-INVARIANT-001 FR-3: resolved from this module's own
// location, so the reaper's root is a property of the installed code rather than of
// whatever directory the caller happened to be standing in.
const CANONICAL_REPO_ROOT = path.resolve(__dirname, '..', '..');

const DEFAULT_CADENCE = 12; // every 12th sweep ≈ 1 hour at 5-min intervals
const STATE_RELATIVE = path.join('.claude', 'worktree-reaper-state.json');
const STATE_SCHEMA_VERSION = 1;

// SD-MAN-INFRA-COORDINATOR-WORKTREE-POOL-001 (FR-002): pool-utilization watchdog.
// Mirrors lib/worktree-quota.js::MAX_WORKTREE_COUNT (kept in sync; the .cjs tick
// cannot `require` the ESM quota module, so the cap is duplicated as a constant).
const MAX_WORKTREE_COUNT = 28;
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
      // QF-20260726-794: additive like last_pid (schema stays v1). This whitelist is what
      // makes the field durable — a key absent here is silently dropped on every read, so
      // the streak could never accumulate. Missing in an old state file reads as 0 via `|| 0`.
      consecutive_refusals: Number.isFinite(parsed.consecutive_refusals) ? parsed.consecutive_refusals : 0,
      // EXEC SECURITY (medium): the refusal streak only covers ONE way the reaper stops. A
      // script_missing tick also reaps nothing, and FR-1 made that path materially MORE reachable
      // by resolving the script from the source tree instead of repoRoot — so this SD's own change
      // widened a silent-stop path. Same whitelist rule as above: omit the key here and the streak
      // is dropped on every read and can never accumulate.
      consecutive_not_invoked: Number.isFinite(parsed.consecutive_not_invoked) ? parsed.consecutive_not_invoked : 0,
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
/**
 * Resolve the tree the reaper's CODE comes from — SD-LEO-INFRA-SCHEDULED-WORKTREE-REAPER-001 FR-1.
 *
 * THE SPLIT THIS INTRODUCES, which is the whole fix: repoRoot supplies the POOL (the worktrees
 * being reaped), while this supplies the CODE (worktree-reaper.mjs and its guards). Those were the
 * same tree, and that is why reaping starved: the shared root goes behind within minutes of any
 * peer merge because QFs are worked on main, the currency check correctly refuses to execute
 * possibly-stale destructive code, and the refusal then persists for as long as nobody pulls —
 * an UNBOUNDED starvation window. A dedicated tree that refreshes itself ends the window without
 * touching the shared root, so the refusal stops being the steady state instead of being relaxed.
 *
 * DEGRADATION IS DELIBERATE AND NON-REGRESSIVE: a git failure here returns null and the caller
 * falls back to repoRoot — i.e. exactly today's behaviour, guard fully intact. It is logged
 * loudly because a silent fallback would look identical to a working refresh (this SD exists
 * because a workflow was green daily while doing nothing).
 *
 * A MIS-SITED TREE IS NOT CAUGHT... except that it must be, here, for a specific reason: this
 * function's contract is "return a usable source root or null". resolveSourceTreeDir throws on a
 * .worktrees/ location because paths there are EXEMPT from the currency check, so such a tree
 * would be silently unguarded. That throw is surfaced in the log and degrades to repoRoot rather
 * than crashing the sweep — the sweep must never die on the reaper — but it degrades to the
 * GUARDED path, never to an unguarded one.
 */
function resolveReaperSourceRoot({ repoRoot, logger, env = process.env, runner, exists }) {
  const {
    ensureSourceTreeWorktree, REAPER_SOURCE_DIRNAME, REAPER_SOURCE_BRANCH,
  } = require('../../lib/fleet/source-tree-refresh.cjs');
  // R5-4: built by the SHARED factory, not by a hand-applied scrub. The scrub used to be inlined
  // here and at spawn-control's equivalent, and could be unwired at BOTH with the suite green.
  const gitRunner = runner || makeScrubbedGitRunner(repoRoot, { spawnSync });
  try {
    const res = ensureSourceTreeWorktree({
      repoRoot,
      dirname: REAPER_SOURCE_DIRNAME,
      branch: REAPER_SOURCE_BRANCH,
      envOverride: 'FLEET_REAPER_SOURCE_DIR',
      label: 'reaper-source',
      exists: exists || fs.existsSync,
      runner: gitRunner,
      env,
    });
    if (res.refreshed === false) {
      logger(`  reaper source tree refresh FAILED (${res.dir}) — the currency check below decides; not silently proceeding`);
    }
    return res.dir;
  } catch (err) {
    logger(`  reaper source tree UNAVAILABLE (${err && err.message ? err.message : err}) — falling back to the shared root, which is today's behaviour and may refuse`);
    return null;
  }
}

function tick(opts = {}) {
  // SD-LEO-INFRA-SPAWN-ROOT-CURRENCY-INVARIANT-001 FR-3: the fallback was process.cwd(),
  // which meant the reaper's ROOT — and therefore, via reaperScript below, the reaper's
  // own CODE — came from whatever directory the caller happened to be standing in. The
  // only production caller (scripts/stale-session-sweep.cjs) passes no repoRoot, and the
  // sweep routinely runs from a worktree. That is how the reap-protected marker shipped
  // inert: its fix sits 50 commits back, so a root behind it executes a worktree-reaper.mjs
  // in which the protection is physically absent.
  // opts.repoRoot is PRESERVED — 12 tests inject it, and it is the seam that lets the
  // refuse-to-reap test below run against a temp dir instead of the real repo.
  const repoRoot = opts.repoRoot || CANONICAL_REPO_ROOT;
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
  // FR-1: CODE comes from the self-refreshing source tree; the POOL stays repoRoot (the spawn
  // below keeps cwd: repoRoot). Null means the source tree was unavailable — fall back to
  // repoRoot, which is exactly today's behaviour with the currency guard fully intact.
  const sourceRoot = resolveReaperSourceRoot({
    repoRoot, logger, env: opts.currencyEnv || process.env,
    runner: opts.sourceRunner, exists: opts.sourceExists,
  }) || repoRoot;
  const reaperScript = path.join(sourceRoot, 'scripts', 'worktree-reaper.mjs');
  if (!fs.existsSync(reaperScript)) {
    state.last_run_at = new Date().toISOString();
    state.last_result = 'script_missing';
    // A missing script reaps NOTHING, forever, in total silence — and FR-1 widened this path by
    // resolving the script from the source tree. Counted so it can alarm; NOT counted for
    // 'skipped_not_due', which is the cadence working as designed and would alarm every tick.
    state.consecutive_not_invoked = (state.consecutive_not_invoked || 0) + 1;
    writeState(statePath, state);
    return {
      invoked: false, counter: state.sweep_counter, cadence, result: 'script_missing', enabled: true,
      consecutiveNotInvoked: state.consecutive_not_invoked,
    };
  }

  // SD-LEO-INFRA-SPAWN-ROOT-CURRENCY-INVARIANT-001 FR-3 — REFUSE TO REAP FROM A STALE TREE.
  //
  // reaperScript above is resolved OUT OF repoRoot, so the reaper's code identity is that
  // tree's HEAD. Reaping is destructive and unrecoverable: a deleted worktree cannot be
  // restored by a later error message, so failing loud AFTER the fact is not available to
  // us. The only safe direction is to refuse before executing. This is precisely how the
  // reap-protected marker came to be inert — the guard existed on origin/main and was
  // physically absent from the file being run.
  //
  // Deliberately placed AFTER the enabled/cadence/script-exists checks so those keep
  // reporting their own reasons, and so a disabled or not-due tick never touches git.
  try {
    const { enforceTreeCurrency } = require('../../lib/fleet/tree-currency.cjs');
    enforceTreeCurrency({
      // FR-1: guard the tree the SCRIPT came from, not the pool. These were the same directory,
      // and that identity is what made the refusal permanent. reaperScript above now resolves out
      // of sourceRoot, so this must check sourceRoot — checking repoRoot would guard a tree that
      // no longer determines the code being executed, which is a guard pointed at the wrong thing.
      dir: sourceRoot,
      logger: { warn: (m) => logger(m) },
      label: 'worktree-reaper source tree',
      // The reaper REFUSES; it never heals. It runs unattended against a shared root, so a
      // fast-forward here could collide with a peer worktree's in-flight state. Skipping a
      // reap costs nothing — the next tick retries — while a bad mutation on the shared
      // root is exactly the hazard the auto-pull prohibition exists to prevent.
      allowSelfHeal: false,
      ...(opts.currencyRunner ? { runner: opts.currencyRunner } : {}),
      ...(opts.currencyEnv ? { env: opts.currencyEnv } : {}),
    });
    // NI-R1 (EXEC SECURITY, MEASURED): the reset used to happen HERE, above the single-flight
    // check at :380 — so a tick that passed currency and then did NOT run still erased the refusal
    // streak. Traced over a real state file with the pattern [stale x5, inflight]: refusals went
    // 1,2,3,4,5,0,1,2,3,4,5,0,... and NEVER reached the threshold of 6 across 48 due ticks, so
    // reaper_starvation_alert never fired at all; the not-invoked alarm first fired at due-tick 36
    // instead of 6 (~36h instead of ~6h). A wedged pid on a chronically-behind tree is precisely
    // the combination this SD exists to catch. The streak now ends where the OTHER counter's does
    // — on an actual spawn — so both counters mean "since the reaper last really ran".
    // (Deliberately NO state write here: a field written and never read is indistinguishable from
    // a guard, and this one would be dropped by readState's whitelist anyway.)
  } catch (err) {
    // QF-20260726-794 — REFUSE TO REAP, BUT STILL REPORT.
    //
    // Two correct rules that were never checked against each other: the reaper must not
    // mutate a shared root (allowSelfHeal:false, load-bearing), and QFs are worked ON main
    // so the root is dirty ~continuously. The reaper therefore refuses on ANY behind>0, and
    // the root goes behind within minutes of a peer merge — so it refuses essentially every
    // tick. Nothing alerted, because each individual refusal is a correct, well-logged
    // decision; the cost was only ever visible in the ACCUMULATED count.
    //
    // The reason nobody watched that count is mechanical, not cultural: the pool watchdog
    // that reports utilization lives DOWNSTREAM of this early return, so a refusing tick
    // never reached it. The census is non-destructive and therefore safe to run on a stale
    // tree — unlike reaping, which is why the refusal itself stays exactly as it was.
    state.consecutive_refusals = (state.consecutive_refusals || 0) + 1;
    const used = countActiveWorktrees(repoRoot);
    const pool = poolWatchdogDecision({ used, cap: MAX_WORKTREE_COUNT, threshold: resolvePoolThreshold() });
    const poolLabel = pool.used == null ? 'unknown (git failed)' : `${pool.used}/${pool.cap} (${pool.percent}%)`;
    logger(`WORKTREE REAPER TICK: sweep=${state.sweep_counter} — REFUSING TO REAP: ${err && err.message ? err.message : 'currency check failed'}`);
    logger(`WORKTREE REAPER BACKLOG: pool ${poolLabel} — UNREAPED for ${state.consecutive_refusals} consecutive tick(s)${pool.triggered ? ` — AT/OVER ${Math.round(pool.threshold * 100)}% THRESHOLD and reclaim is BLOCKED` : ''}`);
    state.last_run_at = new Date().toISOString();
    state.last_result = 'refused_stale_tree';
    writeState(statePath, state);
    return {
      invoked: false, counter: state.sweep_counter, cadence, result: 'refused_stale_tree', enabled: true,
      consecutiveRefusals: state.consecutive_refusals, pool,
    };
  }

  // Single-flight guard: if the previous reaper is still running, do not stack a
  // second one. A new sweep tick fires hourly; a slow stage2 reap could still be
  // mid-run, and overlapping reapers race on the same worktrees.
  if (isPidAlive(state.last_pid)) {
    logger(`WORKTREE REAPER TICK: sweep=${state.sweep_counter} — prior reaper (pid=${state.last_pid}) still running; skipping launch`);
    state.last_run_at = new Date().toISOString();
    state.last_result = 'skipped_in_flight';
    // A single in-flight skip is healthy. A PERSISTENT one is a wedged reaper holding its pid
    // forever, which reaps nothing and says nothing — so it accumulates on the same counter.
    state.consecutive_not_invoked = (state.consecutive_not_invoked || 0) + 1;
    writeState(statePath, state);
    return {
      invoked: false, counter: state.sweep_counter, cadence, result: 'skipped_in_flight',
      pid: state.last_pid, enabled: true, consecutiveNotInvoked: state.consecutive_not_invoked,
    };
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
        // SCRUB-2 (EXEC SECURITY): the GUARD's runners were scrubbed but THIS — the process that
        // actually deletes worktrees — inherited process.env untouched. Every git command the
        // reaper runs would honour GIT_CONFIG_* injection, and core.fsmonitor is a command git
        // runs. Hardening the check while leaving the executor open is the wrong half.
        env: scrubGitEnv(process.env),
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
    // THE RESET, and it is load-bearing in both directions: without it the counter only ever
    // climbs and the alarm, once tripped, fires forever regardless of recovery. A spawn_error
    // deliberately does NOT reset — that is another way to reap nothing.
    state.consecutive_not_invoked = 0;
    // NI-R1: the refusal streak resets HERE too, not at the currency check. Both counters now
    // mean the same thing — "since the reaper last actually ran" — so neither can be silently
    // rewound by a tick that passed a check and then did nothing.
    state.consecutive_refusals = 0;
    state.last_pid = pid;
    state.last_spawn_at = new Date().toISOString();
  } else {
    // spawn_error / unknown: the reaper did not run. Same silent-stop class as script_missing.
    state.consecutive_not_invoked = (state.consecutive_not_invoked || 0) + 1;
    state.last_pid = null;
  }
  writeState(statePath, state);

  return {
    invoked: result === 'spawned', counter: state.sweep_counter, cadence, result, pid, enabled: true, watchdog,
    consecutiveNotInvoked: state.consecutive_not_invoked,
  };
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

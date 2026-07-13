#!/usr/bin/env node
/**
 * EVA scheduler watcher — one-shot supervisor that revives a dead EvaMasterScheduler.
 *
 * SD: SD-LEO-INFRA-REVIVE-EVA-SCHEDULER-SERVICE-001
 *
 * The EvaMasterScheduler daemon (lib/eva/eva-master-scheduler.js) is a long-lived
 * foreground poller launched by `node scripts/eva-scheduler.js start`. It guards
 * itself only with an in-process flag — there is NO cross-process supervisor, so if
 * the daemon dies the singleton heartbeat row (eva_scheduler_heartbeat id=1) freezes:
 * last_poll_at stops advancing while status stays 'running' (a lie). This watcher is
 * the missing supervisor: one pass per invocation (canonical cron: `--once`), it
 * detects staleness from the heartbeat AGE and re-launches the daemon — exactly once
 * across any number of concurrent watchers.
 *
 * Single-instance guarantee (the hard requirement):
 *   MF1 — Atomic single-winner claim via compare-and-swap on instance_id. After the
 *         age-gate flags the heartbeat stale, the revive is gated by
 *         `UPDATE ... SET instance_id=<token> WHERE id=1 AND instance_id=<observed>`:
 *         PostgreSQL row-locks serialize concurrent watchers; the first swaps the
 *         observed instance to its token, so every later watcher's CAS predicate no
 *         longer matches and affects 0 rows. Exactly one watcher spawns. On a FRESH
 *         deployment (empty table) the claim instead INSERTs the singleton — the PK
 *         rejects the loser, preserving the single-winner property. The CAS deliberately
 *         does NOT write last_poll_at, so a failed spawn/confirm leaves the row stale and
 *         the very next tick retries immediately (no 5-minute false-"alive" mask).
 *   MF2 — Confirm takeover. After spawning, poll the heartbeat until instance_id becomes
 *         a value that is NEITHER our supervisor token NOR the pre-claim (observed)
 *         instance — the daemon stamps a fresh scheduler-<hex> on start. Excluding the
 *         observed instance means a hung-but-alive OLD daemon that merely re-stamps its
 *         original id does not falsely confirm. Confirmed → exit 0; timed-out (or the
 *         child exited early) → exit 1 (next tick retries; the claim left the row stale).
 *   MF4 — Creds guard + observable detached spawn. Assert SUPABASE creds BEFORE spawning
 *         so we never fork a credential-less crash-loop; spawn detached/unref'd with
 *         windowsHide, redirecting the daemon's stdout/stderr to logs/eva-scheduler-daemon.log
 *         (not /dev/null) and registering an 'exit' listener so an immediate startup crash
 *         is captured and reported instead of surfacing only as an opaque timeout.
 *
 * Exit codes:
 *   0 — healthy (scheduler alive, revive confirmed, claim lost to a peer, dry-run, or disabled)
 *   1 — operational issue (heartbeat read/claim DB error, spawn error, revive unconfirmed)
 *   2 — fatal misconfiguration (missing SUPABASE creds, missing supabase client config)
 *
 * Usage:
 *   node scripts/cron/eva-scheduler-watcher.mjs --once      # one pass (canonical cron)
 *   node scripts/cron/eva-scheduler-watcher.mjs --dry-run   # report intent, NO mutation
 *
 * Env:
 *   EVA_SCHEDULER_STALE_MS   staleness threshold in ms (default 300000 = 5min)
 *   EVA_SCHEDULER_ENABLED    'false' suppresses revival (matches eva-scheduler.js start)
 *   SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (required to spawn)
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { randomUUID } from 'crypto';
import { spawn as realSpawn } from 'child_process';
import { createClient } from '@supabase/supabase-js';
import { getRepoRoot } from '../../lib/repo-paths.js';
import { stampLastFired } from '../../lib/periodic-liveness/stamp-last-fired.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_STALE_MS = 300000;       // 5 minutes — ~5x the daemon's 60s poll interval
const CONFIRM_TIMEOUT_MS = 8000;       // wait up to 8s for the daemon to stamp its instance
const CONFIRM_INTERVAL_MS = 500;       // poll the heartbeat every 500ms during confirm

// QF-20260704-390: registered-verifier-never-dispatched class — this watcher's own detect+revive
// path is proven functional, but nothing durably invoked it (13 days silent). Self-stamps its own
// liveness (periodic_process_registry, self_stamped source) so the WATCHER's silent death is also
// visible, not just the scheduler's.
export const WATCHER_SELF_PROCESS_KEY = '__eva_scheduler_watcher_self__';

const USAGE = 'eva-scheduler-watcher --once|--dry-run   (revives a dead EvaMasterScheduler)';

function staleMsFromEnv(env) {
  const raw = parseInt(env.EVA_SCHEDULER_STALE_MS || '', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_STALE_MS;
}

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function parseArgs(argv) {
  const args = { once: false, dryRun: false, help: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--once') args.once = true;
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

function buildSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
  return createClient(url, key);
}

/**
 * Assert the env carries credentials the SPAWNED daemon needs. Run BEFORE any spawn
 * so a misconfigured host fails fast (exit 2) instead of forking a crash-looping daemon.
 */
export function assertSpawnCreds(env = process.env) {
  const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const missing = [];
  if (!url) missing.push('SUPABASE_URL|NEXT_PUBLIC_SUPABASE_URL');
  if (!key) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  return { ok: missing.length === 0, missing };
}

/**
 * Read the singleton heartbeat and classify liveness by AGE (not by the row's self-
 * reported status, which lies after a crash). alive = (now - last_poll_at) <= staleMs.
 */
export async function schedulerLiveness(supabase, { now = Date.now, staleMs = DEFAULT_STALE_MS } = {}) {
  const { data, error } = await supabase
    .from('eva_scheduler_heartbeat')
    .select('id, instance_id, last_poll_at, status, poll_count')
    .eq('id', 1)
    .maybeSingle();
  if (error) return { ok: false, error, alive: false, exists: false, ageMs: Infinity, row: null };
  if (!data) return { ok: true, alive: false, exists: false, ageMs: Infinity, row: null };
  const lastPoll = data.last_poll_at ? Date.parse(data.last_poll_at) : NaN;
  const ageMs = Number.isNaN(lastPoll) ? Infinity : (now() - lastPoll);
  return { ok: true, alive: ageMs <= staleMs, exists: true, ageMs, row: data };
}

/**
 * MF1 — atomic single-winner claim.
 *   • Existing (stale) row → compare-and-swap on instance_id: only the watcher whose
 *     observed instance still matches wins; the winner's swap invalidates every peer's
 *     predicate. Does NOT touch last_poll_at (leaving it stale enables immediate retry
 *     after a failed spawn — no false-"alive" window).
 *   • Missing row (fresh deploy) → INSERT the singleton; the PK rejects concurrent losers.
 * The claim never writes `status` (CHECK running|stopping|stopped; the daemon owns it and
 * sets 'running' on start — a bogus value would fail the constraint on every revive).
 */
export async function claimRevival(supabase, { token, observedInstanceId, rowExists }) {
  if (!rowExists) {
    const { data, error } = await supabase
      .from('eva_scheduler_heartbeat')
      .insert({ id: 1, instance_id: token, status: 'stopped' })
      .select();
    if (error) {
      const dup = error.code === '23505' || /duplicate key|unique/i.test(error.message || '');
      return { won: false, error: dup ? null : error, rows: [], bootstrap: true };
    }
    return { won: (data || []).length === 1, rows: data || [], bootstrap: true };
  }
  let q = supabase.from('eva_scheduler_heartbeat').update({ instance_id: token }).eq('id', 1);
  q = observedInstanceId == null ? q.is('instance_id', null) : q.eq('instance_id', observedInstanceId);
  const { data, error } = await q.select();
  if (error) return { won: false, error, rows: [] };
  return { won: (data || []).length === 1, rows: data || [] };
}

/**
 * MF2 — confirm the spawned daemon took over: instance_id becomes a value that is neither
 * our token NOR any excluded (pre-claim / zombie) instance. Early-returns if the child
 * process exited during the window (startup crash) so the failure is reported, not masked.
 */
export async function confirmRevival(supabase, {
  token,
  excludeInstances = [],
  timeoutMs = CONFIRM_TIMEOUT_MS,
  intervalMs = CONFIRM_INTERVAL_MS,
  sleep = defaultSleep,
  now = Date.now,
  getChildExit,
} = {}) {
  const exclude = new Set([token, ...excludeInstances].filter((x) => x != null));
  const deadline = now() + timeoutMs;
  let instanceId = token;
  let status = null;
  while (now() < deadline) {
    await sleep(intervalMs);
    const childExit = getChildExit ? getChildExit() : null;
    if (childExit && childExit.exited) {
      return { confirmed: false, instanceId, status, childExitCode: childExit.code };
    }
    const { data } = await supabase
      .from('eva_scheduler_heartbeat')
      .select('instance_id, status')
      .eq('id', 1)
      .maybeSingle();
    if (data) { instanceId = data.instance_id; status = data.status; }
    if (data && data.instance_id && !exclude.has(data.instance_id)) {
      return { confirmed: true, instanceId: data.instance_id, status: data.status };
    }
  }
  return { confirmed: false, instanceId, status };
}

/** Open an append handle for the daemon's stdout/stderr so startup output is diagnosable. */
function openDaemonLog(repoRoot, logger, tag) {
  try {
    const dir = path.join(repoRoot, 'logs');
    fs.mkdirSync(dir, { recursive: true });
    const fd = fs.openSync(path.join(dir, 'eva-scheduler-daemon.log'), 'a');
    return ['ignore', fd, fd];
  } catch (err) {
    logger.warn?.(`${tag} daemon log unavailable (${err.message}); stdio=ignore`);
    return 'ignore';
  }
}

export async function main(argv = process.argv, deps = {}) {
  const args = parseArgs(argv);
  if (args.help) { console.log(USAGE); return { exitCode: 0, action: 'help' }; }

  const logger = deps.logger || console;
  const now = deps.now || Date.now;
  const sleep = deps.sleep || defaultSleep;
  const spawnFn = deps.spawn || realSpawn;
  const env = deps.env || process.env;
  const staleMs = deps.staleMs || staleMsFromEnv(env);
  const tag = '[eva-scheduler-watcher]';

  // A disabled scheduler must never be revived (mirrors eva-scheduler.js start's guard).
  if (env.EVA_SCHEDULER_ENABLED === 'false') {
    logger.log?.(`${tag} EVA_SCHEDULER_ENABLED=false — revive suppressed`);
    return { exitCode: 0, action: 'disabled' };
  }

  let supabase;
  try { supabase = deps.supabase || buildSupabase(); }
  catch (err) {
    logger.error?.(`${tag} supabase client unavailable: ${err.message}`);
    return { exitCode: 2, action: 'no_supabase' };
  }

  // Self-stamp BEFORE any liveness/revive logic so a genuine invocation is always recorded, even
  // if the scheduler-liveness check itself errors below. Dry-run stays fully read-only (per its
  // own contract) — never stamps.
  if (!args.dryRun) {
    try { await (deps.stampLastFired || stampLastFired)(supabase, WATCHER_SELF_PROCESS_KEY); }
    catch (err) { logger.warn?.(`${tag} self-liveness stamp failed (non-fatal): ${err.message}`); }
    // SD-FDBK-ENH-CENTRAL-LIVENESS-STAMPER-001 (FR-3): also stamp the standing GHA-cron
    // process_key (distinct from WATCHER_SELF_PROCESS_KEY above) so the central liveness
    // watcher can see this cron loop directly.
    try { await (deps.stampLastFired || stampLastFired)(supabase, 'cron_script:eva-scheduler-watcher.mjs'); }
    catch (err) { logger.warn?.(`${tag} cron liveness stamp failed (non-fatal): ${err.message}`); }
  }

  // 1. Liveness by heartbeat age.
  const live = await schedulerLiveness(supabase, { now, staleMs });
  if (!live.ok) {
    logger.error?.(`${tag} heartbeat read failed: ${live.error?.message}`);
    return { exitCode: 1, action: 'db_error' };
  }
  if (live.alive) {
    logger.log?.(`${tag} scheduler alive (age ${Math.round(live.ageMs / 1000)}s, instance ${live.row?.instance_id}) — no action`);
    return { exitCode: 0, action: 'alive', ageMs: live.ageMs };
  }
  const observedInstanceId = live.row?.instance_id ?? null;
  logger.log?.(`${tag} scheduler STALE/ABSENT (${live.exists ? 'age ' + Math.round(live.ageMs / 1000) + 's' : 'no heartbeat row'}, threshold ${staleMs / 1000}s) — attempting revive`);

  // 2. MF4 — creds guard BEFORE any spawn.
  const creds = assertSpawnCreds(env);
  if (!creds.ok) {
    logger.error?.(`${tag} cannot revive: missing ${creds.missing.join(', ')}`);
    return { exitCode: 2, action: 'missing_creds' };
  }

  const token = deps.token || `supervisor-${randomUUID().slice(0, 8)}`;

  // Dry run is fully read-only — report intent, mutate nothing.
  if (args.dryRun) {
    logger.log?.(`${tag} DRY RUN — scheduler is ${live.exists ? 'stale' : 'absent'}; would claim + spawn eva-scheduler start (no mutation)`);
    return { exitCode: 0, action: 'dry_run', token };
  }

  // 3. MF1 — atomic single-winner claim (CAS on existing row, INSERT on fresh deploy).
  const claim = await claimRevival(supabase, { token, observedInstanceId, rowExists: live.exists });
  if (claim.error) {
    logger.error?.(`${tag} revive claim failed: ${claim.error.message}`);
    return { exitCode: 1, action: 'claim_error' };
  }
  if (!claim.won) {
    logger.log?.(`${tag} another supervisor won the revive claim — standing down`);
    return { exitCode: 0, action: 'claim_lost' };
  }
  logger.log?.(`${tag} won revive claim (token ${token}${claim.bootstrap ? ', bootstrapped singleton' : ''})`);

  // 4. MF4 — spawn the detached daemon from the MAIN repo root, with diagnosable stdio.
  const repoRoot = deps.repoRoot || getRepoRoot();
  const scriptPath = path.join(repoRoot, 'scripts', 'eva-scheduler.js');
  const stdio = deps.stdio !== undefined ? deps.stdio : openDaemonLog(repoRoot, logger, tag);
  const childExit = { exited: false, code: null };
  let child;
  try {
    child = spawnFn(process.execPath, [scriptPath, 'start'], {
      cwd: repoRoot,
      env: { ...env },
      detached: true,
      stdio,
      windowsHide: true,
    });
    child?.on?.('exit', (code) => { childExit.exited = true; childExit.code = code; logger.warn?.(`${tag} spawned daemon exited early (code ${code}) — see logs/eva-scheduler-daemon.log`); });
    child?.unref?.();
  } catch (err) {
    logger.error?.(`${tag} spawn failed: ${err.message}`);
    return { exitCode: 1, action: 'spawn_error' };
  }
  logger.log?.(`${tag} spawned eva-scheduler (pid ${child?.pid ?? 'n/a'}); confirming takeover...`);

  // 5. MF2 — confirm the daemon stamped a fresh instance_id (≠ token AND ≠ observed/zombie).
  const confirm = await confirmRevival(supabase, {
    token,
    excludeInstances: [observedInstanceId],
    sleep,
    now,
    getChildExit: () => childExit,
  });
  if (confirm.confirmed) {
    logger.log?.(`${tag} revive CONFIRMED — scheduler instance ${confirm.instanceId} status=${confirm.status}`);
    return { exitCode: 0, action: 'revived', token, instanceId: confirm.instanceId, pid: child?.pid };
  }
  const why = confirm.childExitCode != null ? `daemon exited code ${confirm.childExitCode}` : `instance still ${confirm.instanceId}`;
  logger.warn?.(`${tag} revive UNCONFIRMED within ${CONFIRM_TIMEOUT_MS / 1000}s (${why}); next tick retries`);
  return { exitCode: 1, action: 'unconfirmed', token, childExitCode: confirm.childExitCode ?? null };
}

/**
 * Windows-safe termination (SD-LEO-INFRA-REVIVE-EVA-HOST-AND-ARM-001 FR-2).
 *
 * Calling process.exit() synchronously right after a Supabase/undici query aborts on Windows
 * with a libuv assertion (UV_HANDLE_CLOSING, src/win/async.c) — a keep-alive socket +
 * threadpool-DNS teardown race during libuv shutdown. The proven cure (ref:
 * reference_process_exit_after_undici_aborts_windows; PR #4505) is to NOT exit synchronously:
 *   1. set process.exitCode (so the eventual natural exit carries the right code),
 *   2. release undici's keep-alive sockets so the event loop can drain on its own, and
 *   3. arm an UNREF'd backstop that force-exits ONLY if some lingering ref'd handle prevents
 *      natural drain. Being unref'd, the backstop never fires on the happy path (the loop has
 *      already drained and the process has exited), so it cannot re-introduce the abort; it is
 *      purely a hang-guard so the 5-minute cron task can never wedge.
 * The static-pin test asserts the dangerous synchronous `main().then(=> process.exit())` form
 * is gone and that the only process.exit lives inside this unref'd backstop.
 */
export async function gracefulExit(exitCode, { backstopMs = 4000 } = {}) {
  process.exitCode = exitCode;
  try {
    const undici = await import('undici');
    await undici.getGlobalDispatcher?.()?.close?.();
  } catch { /* undici absent or not the active dispatcher — natural drain still applies */ }
  setTimeout(() => process.exit(exitCode), backstopMs).unref(); // unref'd hang-guard only
}

// Canonical "run directly?" check (mirrors scripts/check-git-state.js:218). The `&&`
// short-circuits when argv[1] is undefined (node -e / REPL / import), so importing this
// module — e.g. for an ad-hoc liveness probe — never auto-runs main() against the DB.
const isMain = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  main().then(({ exitCode }) => gracefulExit(exitCode))
        .catch((err) => { console.error('eva-scheduler-watcher fatal:', err.message); return gracefulExit(2); });
}

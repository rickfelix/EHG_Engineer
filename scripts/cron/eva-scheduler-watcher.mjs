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
 *   MF1 — Atomic single-winner claim. The revive is gated by a CONDITIONAL update of
 *         the singleton heartbeat row: only the watcher whose UPDATE ... WHERE id=1 AND
 *         (last_poll_at IS NULL OR last_poll_at < now()-STALE) matches a row proceeds.
 *         PostgreSQL row-locks serialize concurrent updaters; the first sets
 *         last_poll_at=now() (fresh), so every later watcher's predicate no longer
 *         matches and returns 0 rows. Exactly one watcher spawns. No pg pooler/advisory
 *         lock required — the conditional singleton UPDATE is itself the atomic gate.
 *   MF2 — Confirm takeover. After spawning, poll the heartbeat until instance_id moves
 *         away from our supervisor token (the daemon stamps its own scheduler-<hex> on
 *         start). Confirmed → exit 0; timed-out → exit 1 (next tick retries — the claim
 *         set last_poll_at=now so we wait one STALE window before re-revival).
 *   MF4 — Creds guard + detached spawn. Assert SUPABASE creds BEFORE spawning so we
 *         never fork a credential-less crash-loop; spawn detached/unref'd with
 *         windowsHide so the daemon outlives this one-shot process cross-platform.
 *
 * Exit codes:
 *   0 — healthy (scheduler alive, revive confirmed, claim lost to a peer, dry-run, or disabled)
 *   1 — operational issue (heartbeat read/claim DB error, spawn error, revive unconfirmed)
 *   2 — fatal misconfiguration (missing SUPABASE creds, missing supabase client config)
 *
 * Usage:
 *   node scripts/cron/eva-scheduler-watcher.mjs --once      # one pass (canonical cron)
 *   node scripts/cron/eva-scheduler-watcher.mjs --dry-run   # detect + claim, skip spawn
 *
 * Env:
 *   EVA_SCHEDULER_STALE_MS   staleness threshold in ms (default 300000 = 5min)
 *   EVA_SCHEDULER_ENABLED    'false' suppresses revival (matches eva-scheduler.js start)
 *   SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (required to spawn)
 */
import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import { spawn as realSpawn } from 'child_process';
import { createClient } from '@supabase/supabase-js';
import { getRepoRoot } from '../../lib/repo-paths.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_STALE_MS = 300000;       // 5 minutes — ~5x the daemon's 60s poll interval
const CONFIRM_TIMEOUT_MS = 8000;       // wait up to 8s for the daemon to stamp its instance
const CONFIRM_INTERVAL_MS = 500;       // poll the heartbeat every 500ms during confirm

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
 * MF1 — atomic single-winner claim. Conditional UPDATE of the singleton row that only
 * matches when the heartbeat is stale (or has never polled). Returns won=true ONLY for
 * the single watcher whose update affected the row; concurrent watchers get won=false
 * because the winner's last_poll_at=now() invalidates their staleness predicate.
 */
export async function claimRevival(supabase, { token, nowIso, staleThresholdIso }) {
  const { data, error } = await supabase
    .from('eva_scheduler_heartbeat')
    .update({ instance_id: token, status: 'reviving', last_poll_at: nowIso })
    .eq('id', 1)
    .or(`last_poll_at.is.null,last_poll_at.lt.${staleThresholdIso}`)
    .select();
  if (error) return { won: false, error, rows: [] };
  return { won: (data || []).length === 1, rows: data || [] };
}

/**
 * MF2 — confirm the spawned daemon took over by watching instance_id move off our token.
 */
export async function confirmRevival(supabase, {
  token,
  timeoutMs = CONFIRM_TIMEOUT_MS,
  intervalMs = CONFIRM_INTERVAL_MS,
  sleep = defaultSleep,
  now = Date.now,
} = {}) {
  const deadline = now() + timeoutMs;
  let instanceId = token;
  let status = null;
  while (now() < deadline) {
    await sleep(intervalMs);
    const { data } = await supabase
      .from('eva_scheduler_heartbeat')
      .select('instance_id, status')
      .eq('id', 1)
      .maybeSingle();
    if (data) { instanceId = data.instance_id; status = data.status; }
    if (data && data.instance_id && data.instance_id !== token) {
      return { confirmed: true, instanceId: data.instance_id, status: data.status };
    }
  }
  return { confirmed: false, instanceId, status };
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
  logger.log?.(`${tag} scheduler STALE/ABSENT (${live.exists ? 'age ' + Math.round(live.ageMs / 1000) + 's' : 'no heartbeat row'}, threshold ${staleMs / 1000}s) — attempting revive`);

  // 2. MF4 — creds guard BEFORE any spawn.
  const creds = assertSpawnCreds(env);
  if (!creds.ok) {
    logger.error?.(`${tag} cannot revive: missing ${creds.missing.join(', ')}`);
    return { exitCode: 2, action: 'missing_creds' };
  }

  // 3. MF1 — atomic single-winner claim.
  const token = deps.token || `supervisor-${randomUUID().slice(0, 8)}`;
  const nowIso = new Date(now()).toISOString();
  const staleThresholdIso = new Date(now() - staleMs).toISOString();
  const claim = await claimRevival(supabase, { token, nowIso, staleThresholdIso });
  if (claim.error) {
    logger.error?.(`${tag} revive claim failed: ${claim.error.message}`);
    return { exitCode: 1, action: 'claim_error' };
  }
  if (!claim.won) {
    logger.log?.(`${tag} another supervisor won the revive claim — standing down`);
    return { exitCode: 0, action: 'claim_lost' };
  }
  logger.log?.(`${tag} won revive claim (token ${token})`);

  if (args.dryRun) {
    logger.log?.(`${tag} DRY RUN — would spawn eva-scheduler start; skipping spawn`);
    return { exitCode: 0, action: 'dry_run', token };
  }

  // 4. MF4 — spawn the detached daemon from the MAIN repo root (worktree-safe).
  const repoRoot = deps.repoRoot || getRepoRoot();
  const scriptPath = path.join(repoRoot, 'scripts', 'eva-scheduler.js');
  let child;
  try {
    child = spawnFn(process.execPath, [scriptPath, 'start'], {
      cwd: repoRoot,
      env: { ...env },
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child?.unref?.();
  } catch (err) {
    logger.error?.(`${tag} spawn failed: ${err.message}`);
    return { exitCode: 1, action: 'spawn_error' };
  }
  logger.log?.(`${tag} spawned eva-scheduler (pid ${child?.pid ?? 'n/a'}); confirming takeover...`);

  // 5. MF2 — confirm the daemon stamped its own instance_id over our token.
  const confirm = await confirmRevival(supabase, { token, sleep, now });
  if (confirm.confirmed) {
    logger.log?.(`${tag} revive CONFIRMED — scheduler instance ${confirm.instanceId} status=${confirm.status}`);
    return { exitCode: 0, action: 'revived', token, instanceId: confirm.instanceId, pid: child?.pid };
  }
  logger.warn?.(`${tag} revive UNCONFIRMED within ${CONFIRM_TIMEOUT_MS / 1000}s (instance still ${confirm.instanceId}); next tick retries`);
  return { exitCode: 1, action: 'unconfirmed', token };
}

const isMain = (() => {
  try {
    const here = new URL(import.meta.url).pathname;
    const argv = process.argv[1] ? process.argv[1].replace(/\\/g, '/') : '';
    return here.endsWith(argv) || argv.endsWith(here);
  } catch { return false; }
})();

if (isMain) {
  main().then(({ exitCode }) => process.exit(exitCode))
        .catch((err) => { console.error('eva-scheduler-watcher fatal:', err.message); process.exit(2); });
}

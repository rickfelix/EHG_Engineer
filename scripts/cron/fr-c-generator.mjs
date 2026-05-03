#!/usr/bin/env node
/**
 * Cron entrypoint for the FR-C′ remediation SD generator.
 *
 * SD: SD-LEO-INFRA-STAGE-QUALITY-ANALYZER-FR-C-001 (FR-2)
 *
 * Idempotency: claims a TTL row in cron_run_locks via the
 * try_claim_cron_lock(name, owner, ttl_seconds) RPC before any read of
 * venture_quality_findings; releases via release_cron_lock(name, owner) in
 * finally. A second concurrent tick observes the row as held by another owner,
 * writes audit_log event='lock_held', and exits 0 (graceful no-op).
 *
 * The RPC primitive replaced session-scoped pg_advisory_lock — Supabase RPC
 * pools connections, so an advisory lock taken inside one call is released
 * when the connection returns to the pool, defeating the cross-tick guard.
 * See database/migrations/20260503_cron_run_locks.sql.
 *
 * Failure isolation: any generator exception is caught at the entrypoint
 * boundary; the lock is released; failure surfaces via audit_log
 * event='generator_failed' with error message; cron exit code propagates so
 * external monitoring can alert.
 *
 * Modes:
 *   default — run one batch then exit (canonical GitHub Actions invocation)
 *   --daemon — loop with sleep FR_C_POLL_INTERVAL_SEC between iterations
 *   --dry-run — validate setup + acquire/release lock without invoking generator
 *
 * Env:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY      — required
 *   FR_C_POLL_INTERVAL_SEC                       — default 3600; <60 rejected
 *   FR_C_RATE_LIMIT_PER_VENTURE_PER_DAY          — default 20
 */
import 'dotenv/config';
import path from 'path';
import { randomUUID } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { generateRemediationSdsBatch, writeAuditLog } from '../../lib/eva/quality-findings/sd-generator.js';

const LOCK_NAME = 'fr_c_generator';
const DEFAULT_INTERVAL_SEC = 3600;
const MIN_INTERVAL_SEC = 60;
// TTL covers two cron periods so a crashed tick (e.g. SIGKILL after timeout)
// self-heals before the next scheduled run instead of jamming the lock.
const LOCK_TTL_FLOOR_SEC = 600;

function parseArgs(argv) {
  const args = { daemon: false, dryRun: false };
  for (const a of argv.slice(2)) {
    if (a === '--daemon') args.daemon = true;
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--help') args.help = true;
  }
  return args;
}

function readPollIntervalFromEnv() {
  const raw = process.env.FR_C_POLL_INTERVAL_SEC;
  if (raw === undefined || raw === null || raw === '') return DEFAULT_INTERVAL_SEC;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`FR_C_POLL_INTERVAL_SEC=${JSON.stringify(raw)} is not an integer`);
  }
  if (parsed < MIN_INTERVAL_SEC) {
    throw new Error(`FR_C_POLL_INTERVAL_SEC=${parsed} below minimum ${MIN_INTERVAL_SEC}s`);
  }
  return parsed;
}

function buildSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
  return createClient(url, key);
}

function computeLockTtlSec(intervalSec) {
  // 2x interval gives the next tick a clean slate even if the current one
  // wedges; floor at LOCK_TTL_FLOOR_SEC for short FR_C_POLL_INTERVAL_SEC values.
  return Math.max(LOCK_TTL_FLOOR_SEC, intervalSec * 2);
}

/**
 * Atomically claim the cron lock row. Returns true if this caller owns it.
 *
 * @param {Object} supabase
 * @param {string} owner - UUID minted at process start
 * @param {number} ttlSec
 * @returns {Promise<boolean>}
 */
async function tryClaimLock(supabase, owner, ttlSec) {
  const { data, error } = await supabase.rpc('try_claim_cron_lock', {
    p_name: LOCK_NAME,
    p_owner: owner,
    p_ttl_seconds: ttlSec,
  });
  if (error) throw new Error(`try_claim_cron_lock RPC failed: ${error.message}`);
  return data === true;
}

async function releaseLock(supabase, owner) {
  try {
    const { error } = await supabase.rpc('release_cron_lock', {
      p_name: LOCK_NAME,
      p_owner: owner,
    });
    if (error) {
      process.stderr.write(`[fr-c-generator] release_cron_lock failed: ${error.message}\n`);
    }
  } catch (err) {
    process.stderr.write(`[fr-c-generator] release_cron_lock threw: ${err.message}\n`);
  }
}

async function runOneBatch({ supabase, dryRun }) {
  if (dryRun) {
    process.stdout.write('[fr-c-generator] --dry-run: skipping generator invocation\n');
    return { ventures: [], totalCreated: 0, totalAppended: 0, totalSkippedRateLimited: 0, totalErrors: 0, perVenture: {} };
  }
  return await generateRemediationSdsBatch({ supabase });
}

async function runOnce({ args, supabase, owner, ttlSec }) {
  const acquired = await tryClaimLock(supabase, owner, ttlSec);
  if (!acquired) {
    process.stdout.write('[fr-c-generator] cron lock held by another tick; no-op exit\n');
    await writeAuditLog(supabase, 'lock_held', {
      lock_name: LOCK_NAME,
      owner,
    }, { entityType: 'fr_c_generator_run', entityId: LOCK_NAME, severity: 'info' });
    return { exitCode: 0, summary: { lockHeld: true } };
  }

  try {
    const startedAt = new Date().toISOString();
    const summary = await runOneBatch({ supabase, dryRun: args.dryRun });
    const finishedAt = new Date().toISOString();
    process.stdout.write(`[fr-c-generator] batch complete startedAt=${startedAt} finishedAt=${finishedAt} summary=${JSON.stringify(summary)}\n`);
    return { exitCode: 0, summary };
  } catch (err) {
    process.stderr.write(`[fr-c-generator] generator failed: ${err.message}\n${err.stack || ''}\n`);
    await writeAuditLog(supabase, 'generator_failed', {
      error: err.message,
      stack: (err.stack || '').slice(0, 1000),
    }, { entityType: 'fr_c_generator_run', entityId: LOCK_NAME, severity: 'error' });
    return { exitCode: 1, summary: { error: err.message } };
  } finally {
    await releaseLock(supabase, owner);
  }
}

async function main(argv = process.argv) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(`fr-c-generator — auto-fill remediation SDs from venture_quality_findings.

Usage: node scripts/cron/fr-c-generator.mjs [--daemon] [--dry-run]

Flags:
  --daemon    Run continuously, sleeping FR_C_POLL_INTERVAL_SEC (default 3600s) between batches.
  --dry-run   Acquire/release lock and verify env, but skip generator invocation.

Env:
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY        required
  FR_C_POLL_INTERVAL_SEC                         default 3600 (>=60 enforced)
  FR_C_RATE_LIMIT_PER_VENTURE_PER_DAY            default 20

Lock:
  Uses cron_run_locks table + try_claim_cron_lock RPC. TTL self-heals after
  max(600s, 2*interval) so a crashed tick can't jam the lock.
`);
    return 0;
  }

  // Validate env up front (rejects invalid intervals before opening conn).
  const intervalSec = readPollIntervalFromEnv();
  const supabase = buildSupabase();
  const owner = randomUUID();
  const ttlSec = computeLockTtlSec(intervalSec);

  if (!args.daemon) {
    const { exitCode } = await runOnce({ args, supabase, owner, ttlSec });
    return exitCode;
  }
  process.stdout.write(`[fr-c-generator] daemon mode interval=${intervalSec}s ttl=${ttlSec}s owner=${owner}\n`);
  /* eslint-disable no-constant-condition */
  while (true) {
    await runOnce({ args, supabase, owner, ttlSec });
    await new Promise((r) => setTimeout(r, intervalSec * 1000));
  }
}

const isDirectInvocation = (() => {
  try {
    const entry = process.argv[1] ? path.resolve(process.argv[1]) : '';
    return entry.endsWith('fr-c-generator.mjs');
  } catch { return false; }
})();

if (isDirectInvocation) {
  main()
    .then((code) => process.exit(typeof code === 'number' ? code : 0))
    .catch((err) => {
      process.stderr.write(`[fr-c-generator] unhandled: ${err.stack || err.message}\n`);
      process.exit(2);
    });
}

export { main, parseArgs, readPollIntervalFromEnv, computeLockTtlSec, tryClaimLock, releaseLock, runOnce, LOCK_NAME };

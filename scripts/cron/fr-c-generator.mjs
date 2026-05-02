#!/usr/bin/env node
/**
 * Cron entrypoint for the FR-C′ remediation SD generator.
 *
 * SD: SD-LEO-INFRA-STAGE-QUALITY-ANALYZER-FR-C-001 (FR-2)
 *
 * Idempotency: acquires pg_advisory_lock(hashtext('fr_c_generator')) before
 * any read of venture_quality_findings; releases in finally. A second concurrent
 * tick observes the lock as held, writes audit_log event='lock_held', and
 * exits 0 (not an error — graceful no-op).
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
 *   SUPABASE_POOLER_URL                          — required (pg advisory lock)
 *   FR_C_POLL_INTERVAL_SEC                       — default 3600; <60 rejected
 *   FR_C_RATE_LIMIT_PER_VENTURE_PER_DAY          — default 20
 */
import 'dotenv/config';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import { generateRemediationSdsBatch, writeAuditLog } from '../../lib/eva/quality-findings/sd-generator.js';

const LOCK_KEY_NAME = 'fr_c_generator';
const DEFAULT_INTERVAL_SEC = 3600;
const MIN_INTERVAL_SEC = 60;

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

function buildPgClient() {
  const conn = process.env.SUPABASE_POOLER_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!conn) throw new Error('SUPABASE_POOLER_URL (or DATABASE_URL) required for pg_advisory_lock');
  return new pg.Client({ connectionString: conn });
}

/**
 * Compute the bigint advisory-lock key from a string.
 * Postgres hashtext returns int4; pg_advisory_lock(int) overload is sufficient
 * for our uniqueness needs. Computed server-side via SELECT hashtext($1)::int.
 *
 * @param {pg.Client} client
 * @returns {Promise<number>}
 */
async function resolveLockKey(client) {
  const r = await client.query('SELECT hashtext($1)::int AS k', [LOCK_KEY_NAME]);
  return r.rows[0].k;
}

/**
 * Try to acquire the advisory lock without blocking. Returns true if acquired.
 */
async function tryAcquireLock(client, key) {
  const r = await client.query('SELECT pg_try_advisory_lock($1) AS acquired', [key]);
  return r.rows[0].acquired === true;
}

async function releaseLock(client, key) {
  try {
    await client.query('SELECT pg_advisory_unlock($1)', [key]);
  } catch (err) {
    process.stderr.write(`[fr-c-generator] pg_advisory_unlock failed: ${err.message}\n`);
  }
}

async function runOneBatch({ supabase, dryRun }) {
  if (dryRun) {
    process.stdout.write('[fr-c-generator] --dry-run: skipping generator invocation\n');
    return { ventures: [], totalCreated: 0, totalAppended: 0, totalSkippedRateLimited: 0, totalErrors: 0, perVenture: {} };
  }
  return await generateRemediationSdsBatch({ supabase });
}

async function runOnce({ args, supabase, pgClient, lockKey }) {
  const acquired = await tryAcquireLock(pgClient, lockKey);
  if (!acquired) {
    process.stdout.write('[fr-c-generator] advisory lock held by another invocation; no-op exit\n');
    await writeAuditLog(supabase, 'lock_held', {
      lock_name: LOCK_KEY_NAME,
      lock_key: lockKey,
    }, { entityType: 'fr_c_generator_run', entityId: LOCK_KEY_NAME, severity: 'info' });
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
    }, { entityType: 'fr_c_generator_run', entityId: LOCK_KEY_NAME, severity: 'error' });
    return { exitCode: 1, summary: { error: err.message } };
  } finally {
    await releaseLock(pgClient, lockKey);
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
  SUPABASE_POOLER_URL                            required for pg_advisory_lock
  FR_C_POLL_INTERVAL_SEC                         default 3600 (>=60 enforced)
  FR_C_RATE_LIMIT_PER_VENTURE_PER_DAY            default 20
`);
    return 0;
  }

  // Validate env up front (rejects invalid intervals before opening DB conn).
  const intervalSec = readPollIntervalFromEnv();
  const supabase = buildSupabase();
  const pgClient = buildPgClient();
  await pgClient.connect();
  const lockKey = await resolveLockKey(pgClient);

  try {
    if (!args.daemon) {
      const { exitCode } = await runOnce({ args, supabase, pgClient, lockKey });
      return exitCode;
    }
    process.stdout.write(`[fr-c-generator] daemon mode interval=${intervalSec}s\n`);
    /* eslint-disable no-constant-condition */
    while (true) {
      await runOnce({ args, supabase, pgClient, lockKey });
      await new Promise((r) => setTimeout(r, intervalSec * 1000));
    }
  } finally {
    try { await pgClient.end(); } catch { /* noop */ }
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

export { main, parseArgs, readPollIntervalFromEnv, resolveLockKey, tryAcquireLock, releaseLock };

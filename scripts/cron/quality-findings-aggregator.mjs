#!/usr/bin/env node
/**
 * Cron entrypoint for the cross-venture quality-findings aggregator.
 *
 * SD: SD-LEO-INFRA-STAGE-QUALITY-ANALYZER-FR-F-001
 *
 * Reuses aggregateFindings + upsertPatterns from
 * lib/eva/quality-findings/aggregator.js. Adds scheduling + lookback filter +
 * per-run audit_log emission on top of that existing library. Modeled on the
 * scripts/cron/fr-c-generator.mjs pg_advisory_lock + audit pattern.
 *
 * Idempotency: pg_advisory_lock(hashtext('quality_aggregator')) prevents
 * concurrent runs. A second concurrent invocation observes the lock as held,
 * writes audit_log event_type='quality_aggregator_lock_held', and exits 0
 * (graceful no-op, NOT an error).
 *
 * Failure isolation: any aggregator exception is caught at the entrypoint
 * boundary; the lock is released; failure surfaces via audit_log
 * event_type='quality_aggregator_run' severity='error' with error message;
 * exit code 1 propagates so external monitoring can alert.
 *
 * Modes:
 *   default   — run one batch then exit (canonical cron invocation)
 *   --daemon  — loop with sleep LEO_QUALITY_AGGREGATOR_INTERVAL_SEC between iterations
 *   --dry-run — validate setup + acquire/release lock without invoking aggregator
 *
 * Env:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY        — required
 *   SUPABASE_POOLER_URL                            — required (pg advisory lock)
 *   LEO_QUALITY_AGGREGATOR_LOOKBACK_DAYS           — default 7; <1 or non-integer rejected
 *   LEO_QUALITY_AGGREGATOR_INTERVAL_SEC            — default 86400 (daemon); <60 rejected
 *   LEO_QUALITY_AGGREGATOR_MIN_VENTURE_COUNT       — default 3; passed to aggregateFindings
 */
import 'dotenv/config';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import { aggregateFindings, upsertPatterns } from '../../lib/eva/quality-findings/aggregator.js';

const LOCK_KEY_NAME = 'quality_aggregator';
const DEFAULT_LOOKBACK_DAYS = 7;
const DEFAULT_INTERVAL_SEC = 86400;
const MIN_INTERVAL_SEC = 60;
const DEFAULT_MIN_VENTURE_COUNT = 3;
const GENERATED_BY_TAG = 'quality-aggregator';

export function parseArgs(argv) {
  const args = { daemon: false, dryRun: false, help: false };
  for (const a of argv.slice(2)) {
    if (a === '--daemon') args.daemon = true;
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

export function readEnvLookbackDays() {
  const raw = process.env.LEO_QUALITY_AGGREGATOR_LOOKBACK_DAYS;
  if (raw === undefined || raw === null || raw === '') return DEFAULT_LOOKBACK_DAYS;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || String(parsed) !== String(raw).trim()) {
    throw new Error(`LEO_QUALITY_AGGREGATOR_LOOKBACK_DAYS=${JSON.stringify(raw)} is not an integer`);
  }
  if (parsed < 1) {
    throw new Error(`LEO_QUALITY_AGGREGATOR_LOOKBACK_DAYS=${parsed} below minimum 1`);
  }
  return parsed;
}

export function readEnvIntervalSec() {
  const raw = process.env.LEO_QUALITY_AGGREGATOR_INTERVAL_SEC;
  if (raw === undefined || raw === null || raw === '') return DEFAULT_INTERVAL_SEC;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`LEO_QUALITY_AGGREGATOR_INTERVAL_SEC=${JSON.stringify(raw)} is not an integer`);
  }
  if (parsed < MIN_INTERVAL_SEC) {
    throw new Error(`LEO_QUALITY_AGGREGATOR_INTERVAL_SEC=${parsed} below minimum ${MIN_INTERVAL_SEC}s`);
  }
  return parsed;
}

export function readEnvMinVentureCount() {
  const raw = process.env.LEO_QUALITY_AGGREGATOR_MIN_VENTURE_COUNT;
  if (raw === undefined || raw === null || raw === '') return DEFAULT_MIN_VENTURE_COUNT;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error(`LEO_QUALITY_AGGREGATOR_MIN_VENTURE_COUNT=${JSON.stringify(raw)} must be a positive integer`);
  }
  return parsed;
}

export function buildLookbackCutoffIso(lookbackDays, nowMs = Date.now()) {
  const cutoffMs = nowMs - lookbackDays * 24 * 60 * 60 * 1000;
  return new Date(cutoffMs).toISOString();
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

export async function resolveLockKey(client, name = LOCK_KEY_NAME) {
  const r = await client.query('SELECT hashtext($1)::int AS k', [name]);
  return r.rows[0].k;
}

export async function tryAcquireLock(client, key) {
  const r = await client.query('SELECT pg_try_advisory_lock($1) AS acquired', [key]);
  return r.rows[0].acquired === true;
}

export async function releaseLock(client, key) {
  try {
    await client.query('SELECT pg_advisory_unlock($1)', [key]);
  } catch (err) {
    process.stderr.write(`[quality-aggregator] pg_advisory_unlock failed: ${err.message}\n`);
  }
}

/**
 * Write a structured audit_log row for the aggregator. entity_id is required
 * non-null (defends against the audit_log NOT NULL incident from FR-C cron).
 */
export async function writeAggregatorAuditLog(supabase, eventType, payload, opts = {}) {
  if (!supabase) return;
  const entityId = opts.entityId || payload?.run_id || LOCK_KEY_NAME;
  try {
    await supabase.from('audit_log').insert({
      event_type: eventType,
      entity_type: 'quality_aggregator_run',
      entity_id: entityId,
      severity: opts.severity || 'info',
      metadata: { ...payload, generator: GENERATED_BY_TAG, ts: new Date().toISOString() },
      created_by: GENERATED_BY_TAG,
    });
  } catch (err) {
    process.stderr.write(`[quality-aggregator] audit_log write failed (${eventType}): ${err.message}\n`);
  }
}

export async function runOneBatch({ supabase, lookbackDays, minVentureCount, dryRun, runId }) {
  const startedAt = new Date().toISOString();
  if (dryRun) {
    process.stdout.write(`[quality-aggregator] --dry-run: skipping aggregator invocation\n`);
    return {
      run_id: runId,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      lookback_days: lookbackDays,
      ventures_scanned: 0,
      findings_read: 0,
      patterns_inserted: 0,
      patterns_updated: 0,
      errors: [],
      dry_run: true,
    };
  }

  const cutoffIso = buildLookbackCutoffIso(lookbackDays);
  const { data: findings, error } = await supabase
    .from('venture_quality_findings')
    .select('id, venture_id, finding_category, severity, check_name, created_at, status')
    .eq('status', 'open')
    .gte('created_at', cutoffIso);

  if (error) throw new Error(`venture_quality_findings read failed: ${error.message}`);

  const patterns = aggregateFindings(findings || [], { minVentureCount });
  const venturesScanned = new Set((findings || []).map((f) => f.venture_id)).size;

  const result = await upsertPatterns(supabase, patterns);

  return {
    run_id: runId,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    lookback_days: lookbackDays,
    lookback_cutoff_utc: cutoffIso,
    ventures_scanned: venturesScanned,
    findings_read: (findings || []).length,
    patterns_inserted: result.inserted,
    patterns_updated: result.updated,
    errors: result.errors,
  };
}

export async function runOnce({ args, supabase, pgClient, lockKey, lookbackDays, minVentureCount }) {
  const runId = `aggregate-${Date.now()}`;
  const acquired = await tryAcquireLock(pgClient, lockKey);
  if (!acquired) {
    process.stdout.write(`[quality-aggregator] advisory lock held by another invocation; no-op exit\n`);
    await writeAggregatorAuditLog(
      supabase,
      'quality_aggregator_lock_held',
      { lock_name: LOCK_KEY_NAME, lock_key: lockKey, run_id: runId },
      { entityId: runId, severity: 'info' }
    );
    return { exitCode: 0, summary: { lockHeld: true, run_id: runId } };
  }

  try {
    const wallClockStart = Date.now();
    const summary = await runOneBatch({ supabase, lookbackDays, minVentureCount, dryRun: args.dryRun, runId });
    summary.wall_clock_ms = Date.now() - wallClockStart;
    process.stdout.write(`[quality-aggregator] batch complete ${JSON.stringify(summary)}\n`);
    await writeAggregatorAuditLog(supabase, 'quality_aggregator_run', summary, {
      entityId: runId,
      severity: summary.errors && summary.errors.length ? 'warning' : 'info',
    });
    return { exitCode: 0, summary };
  } catch (err) {
    process.stderr.write(`[quality-aggregator] aggregator failed: ${err.message}\n${err.stack || ''}\n`);
    await writeAggregatorAuditLog(
      supabase,
      'quality_aggregator_run',
      {
        run_id: runId,
        error: err.message,
        stack: (err.stack || '').slice(0, 1000),
        lookback_days: lookbackDays,
      },
      { entityId: runId, severity: 'error' }
    );
    return { exitCode: 1, summary: { error: err.message, run_id: runId } };
  } finally {
    await releaseLock(pgClient, lockKey);
  }
}

export async function main(argv = process.argv) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(`quality-findings-aggregator — cron-driven cross-venture quality findings aggregator.

Usage: node scripts/cron/quality-findings-aggregator.mjs [--daemon] [--dry-run]

Flags:
  --daemon    Run continuously, sleeping LEO_QUALITY_AGGREGATOR_INTERVAL_SEC (default 86400s) between batches.
  --dry-run   Acquire/release lock and verify env, but skip aggregator invocation.

Env:
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY            required
  SUPABASE_POOLER_URL                                required for pg_advisory_lock
  LEO_QUALITY_AGGREGATOR_LOOKBACK_DAYS               default 7 (>=1)
  LEO_QUALITY_AGGREGATOR_INTERVAL_SEC                default 86400 (>=60, daemon mode)
  LEO_QUALITY_AGGREGATOR_MIN_VENTURE_COUNT           default 3 (>=1)
`);
    return 0;
  }

  // Validate env up front before opening connections.
  const lookbackDays = readEnvLookbackDays();
  const intervalSec = readEnvIntervalSec();
  const minVentureCount = readEnvMinVentureCount();

  const supabase = buildSupabase();
  const pgClient = buildPgClient();
  await pgClient.connect();
  const lockKey = await resolveLockKey(pgClient);

  try {
    if (!args.daemon) {
      const { exitCode } = await runOnce({ args, supabase, pgClient, lockKey, lookbackDays, minVentureCount });
      return exitCode;
    }
    process.stdout.write(`[quality-aggregator] daemon mode interval=${intervalSec}s lookback=${lookbackDays}d minVentureCount=${minVentureCount}\n`);
    /* eslint-disable no-constant-condition */
    while (true) {
      await runOnce({ args, supabase, pgClient, lockKey, lookbackDays, minVentureCount });
      await new Promise((r) => setTimeout(r, intervalSec * 1000));
    }
  } finally {
    try { await pgClient.end(); } catch { /* noop */ }
  }
}

const isDirectInvocation = (() => {
  try {
    const entry = process.argv[1] ? path.resolve(process.argv[1]) : '';
    return entry.endsWith('quality-findings-aggregator.mjs');
  } catch { return false; }
})();

if (isDirectInvocation) {
  main()
    .then((code) => process.exit(typeof code === 'number' ? code : 0))
    .catch((err) => {
      process.stderr.write(`[quality-aggregator] unhandled: ${err.stack || err.message}\n`);
      process.exit(2);
    });
}

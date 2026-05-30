#!/usr/bin/env node
/**
 * cleanup-pending-sweep.mjs
 *
 * SD-LEO-INFRA-WORKTREE-CLEANUP-WINDOWS-001 (FR-3)
 *
 * Consumer for the claude_sessions.cleanup_pending TIMESTAMPTZ column.
 * Sweeps released sessions whose worktree removal was deferred because Windows
 * file-handle locks (npm/antivirus/indexer) blocked safeRecursiveRm at the
 * canonical writer site (lib/worktree-manager.js). Retries removal on its own
 * schedule, decoupled from the canonical session-release path.
 *
 * Self-healing across Claude Code restarts and Windows file-handle release windows.
 *
 * Usage:
 *   node scripts/cleanup-pending-sweep.mjs                # one-shot sweep, default batch=25
 *   node scripts/cleanup-pending-sweep.mjs --batch 10     # smaller batch
 *   node scripts/cleanup-pending-sweep.mjs --dry-run      # report-only, no rm, no UPDATE
 *   node scripts/cleanup-pending-sweep.mjs --quiet        # suppress per-row stdout
 *
 * Module-load assertion (FR-3 / risk-agent R4 defense-in-depth):
 *   On import/run, executes `SELECT cleanup_pending FROM claude_sessions LIMIT 0`
 *   to fail fast with a clear remediation message if the migration has not been
 *   applied yet. Avoids cascading PGRST204 across the heartbeat writer fleet.
 *
 * Concurrency primitive (FR-2c / risk-agent R6):
 *   Batch claim uses Supabase JS UPDATE with .eq('cleanup_pending', expected_ts)
 *   as a CAS guard. Two reaper instances racing on the same row → exactly one
 *   wins (gets back >0 rows updated); the loser logs WORKTREE_CLEANUP_LOST_RACE
 *   and skips. No double rm. No half-NULLed column.
 *   (Native pg FOR UPDATE SKIP LOCKED would be ideal but is unavailable through
 *    the Supabase JS client; CAS-on-UPDATE provides equivalent safety here.)
 *
 * Phantom-path filter (FR-2d / risk-agent R8):
 *   Before retrying rm, fs.existsSync(worktree_path) gates the attempt. If the
 *   worktree was removed externally (manual rm, parallel reaper completed),
 *   we NULL the column atomically and emit WORKTREE_CLEANUP_PHANTOM_PATH.
 *
 * Outcome event_type taxonomy (emitted to session_lifecycle_events):
 *   WORKTREE_CLEANUP_RETRY_SUCCESS    — rm succeeded + column NULLed
 *   WORKTREE_CLEANUP_RETRY_EXHAUSTED  — 3 attempts failed; column left set
 *   WORKTREE_CLEANUP_LOST_RACE        — peer reaper claimed first
 *   WORKTREE_CLEANUP_PHANTOM_PATH     — worktree gone externally
 *   WORKTREE_CLEANUP_DB_ERROR         — Supabase op failed (transient)
 */

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import {
  safeRecursiveRmWithRetry,
} from '../lib/worktree-manager.js';
// SD-LEO-INFRA-WORKTREE-CONTENTION-CLEANUP-001 (FR-3): shared reapability guard.
import { isReapable } from '../lib/worktree-reapability.js';

const __filename = fileURLToPath(import.meta.url);

// ── CLI parsing ────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = {
    batch: 25,
    dryRun: args.includes('--dry-run'),
    quiet: args.includes('--quiet') || args.includes('-q'),
    help: args.includes('--help') || args.includes('-h'),
  };
  const batchIdx = args.findIndex((a) => a === '--batch');
  if (batchIdx !== -1 && args[batchIdx + 1]) {
    const n = parseInt(args[batchIdx + 1], 10);
    if (Number.isFinite(n) && n > 0 && n <= 100) opts.batch = n;
  }
  return opts;
}

const HELP = `
cleanup-pending-sweep — orphan-worktree reaper for cleanup_pending rows

Usage:
  node scripts/cleanup-pending-sweep.mjs [options]

Options:
  --batch <n>     Max rows per sweep (default 25, max 100)
  --dry-run       Report only — no rm, no UPDATE
  --quiet, -q     Suppress per-row stdout
  --help, -h      Show this help

Module-load assertion: fails fast if claude_sessions.cleanup_pending column missing.
Migration: database/migrations/20260510_worktree_cleanup_pending.sql
`;

// ── Supabase ───────────────────────────────────────────────────────────

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'cleanup-pending-sweep: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars'
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * FR-3 / risk-agent R4: Module-load assertion. Single round-trip; planner short-circuits
 * at parse time on missing column. Throws with a clear remediation message that points
 * the operator at the migration path.
 */
export async function assertCleanupPendingColumn(supabase) {
  // Use a tiny SELECT that touches the column. .limit(0) returns no rows but
  // forces the planner to resolve the column reference.
  const { error } = await supabase
    .from('claude_sessions')
    .select('cleanup_pending')
    .limit(0);
  if (error) {
    const isColumnMissing = error.code === 'PGRST204'
      || /cleanup_pending/i.test(error.message || '')
      || /column.*does not exist/i.test(error.message || '');
    if (isColumnMissing) {
      const msg =
        'cleanup-pending-sweep: claude_sessions.cleanup_pending column does NOT exist. ' +
        'Apply migration first: node scripts/run-sql-migration.js ' +
        'database/migrations/20260510_worktree_cleanup_pending.sql ' +
        'OR via Supabase Dashboard SQL Editor. See SD-LEO-INFRA-WORKTREE-CLEANUP-WINDOWS-001.';
      const err = new Error(msg);
      err.code = 'CLEANUP_PENDING_COLUMN_MISSING';
      throw err;
    }
    // Other errors (network, auth) — surface as-is, do not retry.
    const err = new Error(`cleanup-pending-sweep: assertion query failed: ${error.message}`);
    err.cause = error;
    throw err;
  }
}

// ── Audit emission (best-effort) ───────────────────────────────────────

async function emitEvent(supabase, eventType, sessionId, payload) {
  try {
    await supabase.from('session_lifecycle_events').insert({
      event_type: eventType,
      session_id: sessionId || null,
      reason: payload.reason || null,
      metadata: payload,
    });
  } catch { /* audit emission is best-effort */ }
}

// ── Core sweep logic ───────────────────────────────────────────────────

/**
 * Single-pass sweep: claim candidates, filter phantoms, retry rm, atomically clear column.
 * Returns a summary so the caller (CLI or sd-start preflight) can report or short-circuit.
 *
 * @param {object} supabase - injectable Supabase client
 * @param {object} [opts]
 * @param {number} [opts.batch=25]
 * @param {boolean} [opts.dryRun=false]
 * @param {(line:string)=>void} [opts.log] - per-row log sink (default console.log)
 * @returns {Promise<{ scanned:number, success:number, exhausted:number, phantom:number, lostRace:number, dbError:number, errors:string[] }>}
 */
export async function processCleanupPendingQueue(supabase, opts = {}) {
  const batch = Number.isFinite(opts.batch) && opts.batch > 0 ? opts.batch : 25;
  const dryRun = !!opts.dryRun;
  const log = typeof opts.log === 'function' ? opts.log : (() => {});

  const summary = {
    scanned: 0,
    success: 0,
    exhausted: 0,
    phantom: 0,
    lostRace: 0,
    dbError: 0,
    errors: [],
  };

  // Step 1: claim candidates ordered by oldest-first.
  const { data: rows, error: selErr } = await supabase
    .from('claude_sessions')
    .select('session_id, sd_key, worktree_path, cleanup_pending, released_at')
    .not('cleanup_pending', 'is', null)
    .order('cleanup_pending', { ascending: true })
    .limit(batch);

  if (selErr) {
    summary.dbError++;
    summary.errors.push(`select_failed: ${selErr.message}`);
    return summary;
  }
  if (!rows || rows.length === 0) return summary;

  summary.scanned = rows.length;

  for (const row of rows) {
    const tag = `[${row.session_id?.slice(0, 8)} ${row.sd_key || '?'}]`;

    // FR-2d / risk-agent R8: phantom-path filter.
    if (!row.worktree_path || !fs.existsSync(row.worktree_path)) {
      summary.phantom++;
      log(`${tag} PHANTOM_PATH: ${row.worktree_path || '(null)'} — clearing column`);
      if (!dryRun) {
        // CAS-clear: only NULL if cleanup_pending still equals what we read.
        const { data: cleared, error: updErr } = await supabase
          .from('claude_sessions')
          .update({ cleanup_pending: null })
          .eq('session_id', row.session_id)
          .eq('cleanup_pending', row.cleanup_pending)
          .select('session_id');
        if (updErr) {
          summary.dbError++;
          summary.errors.push(`phantom_clear_failed:${row.session_id}:${updErr.message}`);
          await emitEvent(supabase, 'WORKTREE_CLEANUP_DB_ERROR', row.session_id, {
            reason: 'phantom_clear_failed',
            sd_key: row.sd_key,
            worktree_path: row.worktree_path,
            db_error: updErr.message,
          });
        } else if (!cleared || cleared.length === 0) {
          summary.lostRace++;
          await emitEvent(supabase, 'WORKTREE_CLEANUP_LOST_RACE', row.session_id, {
            reason: 'phantom_path_lost_race',
            sd_key: row.sd_key,
            worktree_path: row.worktree_path,
          });
        } else {
          await emitEvent(supabase, 'WORKTREE_CLEANUP_PHANTOM_PATH', row.session_id, {
            reason: 'worktree_already_removed',
            sd_key: row.sd_key,
            worktree_path: row.worktree_path,
          });
        }
      }
      continue;
    }

    // SD-LEO-INFRA-WORKTREE-CONTENTION-CLEANUP-001 (FR-3): defense-in-depth — a
    // worktree flagged for cleanup may have been re-claimed and gained
    // uncommitted/unpushed work since the flag was set. Re-check the shared
    // reapability predicate at the moment of removal; skip (leave cleanup_pending
    // for a later sweep / the preserve-before-delete reaper) if no longer safe.
    const reap = isReapable(row.worktree_path);
    if (!reap.reapable) {
      summary.skippedUnsafe = (summary.skippedUnsafe || 0) + 1;
      log(`${tag} SKIPPED_UNSAFE: ${reap.reason} — leaving cleanup_pending for a later sweep`);
      continue;
    }

    // FR-3: retry rm via the canonical helper (FR-1 retry layer).
    if (dryRun) {
      log(`${tag} DRY_RUN: would retry rm ${row.worktree_path}`);
      continue;
    }

    const rmResult = safeRecursiveRmWithRetry(row.worktree_path);

    if (!rmResult.ok) {
      summary.exhausted++;
      log(`${tag} RETRY_EXHAUSTED: ${rmResult.attempts} attempts, last=${rmResult.lastError}`);
      await emitEvent(supabase, 'WORKTREE_CLEANUP_RETRY_EXHAUSTED', row.session_id, {
        reason: 'rm_attempts_exhausted',
        sd_key: row.sd_key,
        worktree_path: row.worktree_path,
        attempts: rmResult.attempts,
        last_error: rmResult.lastError,
      });
      // Column stays set — next sweep will retry.
      continue;
    }

    // Filesystem rm OK. Atomically NULL the column with CAS guard.
    // FR-2c / risk-agent R6: WHERE cleanup_pending = expected_ts ensures only one
    // racing reaper successfully clears the row.
    const { data: cleared, error: updErr } = await supabase
      .from('claude_sessions')
      .update({ cleanup_pending: null })
      .eq('session_id', row.session_id)
      .eq('cleanup_pending', row.cleanup_pending)
      .select('session_id');

    if (updErr) {
      summary.dbError++;
      summary.errors.push(`update_failed:${row.session_id}:${updErr.message}`);
      log(`${tag} DB_ERROR: ${updErr.message}`);
      await emitEvent(supabase, 'WORKTREE_CLEANUP_DB_ERROR', row.session_id, {
        reason: 'cas_update_failed',
        sd_key: row.sd_key,
        worktree_path: row.worktree_path,
        db_error: updErr.message,
      });
      continue;
    }

    if (!cleared || cleared.length === 0) {
      // Peer reaper won the race: filesystem already removed (or removing) +
      // our CAS guard didn't match because they cleared the column first.
      summary.lostRace++;
      log(`${tag} LOST_RACE: peer reaper cleared first`);
      await emitEvent(supabase, 'WORKTREE_CLEANUP_LOST_RACE', row.session_id, {
        reason: 'peer_reaper_won_cas',
        sd_key: row.sd_key,
        worktree_path: row.worktree_path,
        attempts: rmResult.attempts,
      });
      continue;
    }

    summary.success++;
    log(`${tag} SUCCESS: removed ${row.worktree_path} after ${rmResult.attempts} attempt(s)`);
    await emitEvent(supabase, 'WORKTREE_CLEANUP_RETRY_SUCCESS', row.session_id, {
      reason: 'reaper_retry_succeeded',
      sd_key: row.sd_key,
      worktree_path: row.worktree_path,
      attempts: rmResult.attempts,
    });
  }

  return summary;
}

// ── CLI entry ──────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs(process.argv);
  if (opts.help) {
    process.stdout.write(HELP);
    return 0;
  }

  const supabase = getSupabaseClient();
  await assertCleanupPendingColumn(supabase);

  const log = opts.quiet ? (() => {}) : (line) => console.log(line);
  const summary = await processCleanupPendingQueue(supabase, {
    batch: opts.batch,
    dryRun: opts.dryRun,
    log,
  });

  // JSON-line summary on stderr for pipelines.
  process.stderr.write(JSON.stringify({
    event: 'cleanup-pending-sweep.summary',
    timestamp: new Date().toISOString(),
    ...summary,
  }) + '\n');

  // Human summary on stdout.
  if (!opts.quiet) {
    console.log('');
    console.log(`cleanup-pending-sweep summary:`);
    console.log(`  scanned:    ${summary.scanned}`);
    console.log(`  success:    ${summary.success}`);
    console.log(`  exhausted:  ${summary.exhausted}`);
    console.log(`  phantom:    ${summary.phantom}`);
    console.log(`  lostRace:   ${summary.lostRace}`);
    console.log(`  dbError:    ${summary.dbError}`);
    if (summary.errors.length > 0) {
      console.log(`  errors:`);
      for (const e of summary.errors) console.log(`    - ${e}`);
    }
    if (opts.dryRun) console.log('  (dry-run — no changes applied)');
  }
  return summary.dbError > 0 ? 2 : 0;
}

const isCLI = (() => {
  try {
    return path.resolve(process.argv[1] || '') === path.resolve(__filename);
  } catch { return false; }
})();

if (isCLI) {
  main().then((code) => process.exit(code)).catch((err) => {
    if (err && err.code === 'CLEANUP_PENDING_COLUMN_MISSING') {
      console.error('FATAL:', err.message);
      process.exit(78); // EX_CONFIG — operator must apply migration
    }
    console.error('FATAL:', err && err.stack ? err.stack : err);
    process.exit(1);
  });
}

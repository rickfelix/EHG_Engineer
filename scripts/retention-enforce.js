#!/usr/bin/env node
/**
 * retention-enforce.js — archive-not-delete retention for unbounded audit/trace
 * tables (SD-LEO-INFRA-RETENTION-POLICY-UNBOUNDED-001).
 *
 * DRY-RUN BY DEFAULT. `--apply` executes (chairman-gated: do not arm or apply
 * without the approved windows — see the SD's FR-6).
 *
 * Per policy table:
 *   dry: count rows older than the cutoff, report.
 *   apply: loop batches — SELECT (id + row) LIMIT BATCH_SIZE → INSERT jsonb
 *          copies into retention_archive (archive-BEFORE-delete; a failed
 *          archive aborts the table's run with NO delete) → DELETE by id in
 *          chunks — until the per-run cap or no rows remain. Fail-soft per
 *          table: one table's error never aborts the others.
 *
 * Every run (incl. dry) stamps retention_runs — observability is the AGE of
 * max(ran_at), never self-reported status (`--liveness` exits 1 when stale).
 * `--arming-spec` prints the CronCreate spec for the weekly apply (harness
 * pattern: the script never self-arms).
 *
 * Also rotates logs/eva-scheduler-daemon.log when >25MB (2 generations,
 * fail-soft).
 *
 * Usage:
 *   node scripts/retention-enforce.js                  # dry-run (npm run retention:check)
 *   node scripts/retention-enforce.js --apply          # enforce (npm run retention:apply)
 *   node scripts/retention-enforce.js --liveness       # exit 1 if last run > LIVENESS_MAX_AGE_DAYS
 *   node scripts/retention-enforce.js --arming-spec    # print the CronCreate spec
 */
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { createSupabaseServiceClient } from '../lib/supabase-client.js';
import {
  RETENTION_POLICIES, SOAK_ENTRIES, effectiveHotDays, cutoffIso,
  BATCH_SIZE, DELETE_CHUNK, LIVENESS_MAX_AGE_DAYS,
} from '../lib/retention/policies.js';
import { isMainModule } from '../lib/utils/is-main-module.js';
import { stampLastFired } from '../lib/periodic-liveness/stamp-last-fired.js';

dotenv.config();

const ROTATE_LOG = 'logs/eva-scheduler-daemon.log';
const ROTATE_MAX_BYTES = 25 * 1024 * 1024;
const ROTATE_GENERATIONS = 2;

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

/** Size-based log rotation, fail-soft (FR-5). */
export function rotateDaemonLog(repoRoot = process.cwd()) {
  try {
    const p = path.resolve(repoRoot, ROTATE_LOG);
    if (!fs.existsSync(p)) return { rotated: false, reason: 'absent' };
    const size = fs.statSync(p).size;
    if (size <= ROTATE_MAX_BYTES) return { rotated: false, reason: 'under-threshold', size };
    for (let g = ROTATE_GENERATIONS - 1; g >= 1; g--) {
      const from = `${p}.${g}`;
      const to = `${p}.${g + 1}`;
      if (fs.existsSync(from)) fs.renameSync(from, to);
    }
    fs.renameSync(p, `${p}.1`);
    return { rotated: true, size };
  } catch (err) {
    console.warn(`   ⚠ log rotation failed (non-fatal): ${err.message}`);
    return { rotated: false, reason: 'error', error: err.message };
  }
}

/**
 * Enforce one policy. Returns { table, eligible, archived, deleted, error }.
 * apply=false → count only. Archive-before-delete invariant: the DELETE for a
 * batch is only issued after the archive INSERT for that batch is confirmed.
 */
export async function enforcePolicy(supabase, policy, { apply = false, runId = null, now = new Date(), env = process.env } = {}) {
  const cutoff = cutoffIso(policy, now, env);
  const result = { table: policy.table, hotDays: effectiveHotDays(policy, env), cutoff, eligible: 0, archived: 0, deleted: 0, error: null };
  try {
    const { count, error: cntErr } = await supabase
      .from(policy.table).select('*', { count: 'exact', head: true })
      .lt(policy.timestampColumn, cutoff);
    if (cntErr) throw new Error(`count failed: ${cntErr.message}`);
    result.eligible = count || 0;
    if (!apply || result.eligible === 0) return result;

    while (result.archived < policy.perRunCap) {
      const batchLimit = Math.min(BATCH_SIZE, policy.perRunCap - result.archived);
      const { data: rows, error: selErr } = await supabase
        .from(policy.table).select('*')
        .lt(policy.timestampColumn, cutoff)
        .order(policy.timestampColumn, { ascending: true })
        .limit(batchLimit);
      if (selErr) throw new Error(`select failed: ${selErr.message}`);
      if (!rows || rows.length === 0) break;

      // FR-6b (SD-FDBK-FIX-BUS-RETENTION-CLEANUP-001): id-cursor guard. If a prior run
      // archived a batch but its DELETE failed partway (e.g. transient error on one chunk),
      // a later run would re-SELECT the same still-present rows and re-INSERT duplicate
      // retention_archive copies before retrying the delete. Check which of this batch's
      // ids already have an archive row for this table and skip re-archiving those —
      // only their delete is retried.
      // QF-20260719-097: the dedup .in() must be CHUNKED like the delete below — a full
      // BATCH_SIZE (1000) of UUIDs in one query string blows the PostgREST URL limit and
      // 400s ('Bad Request'), failing every table with >~a few hundred eligible rows
      // (live: the 07-19 cron red on 5 tables; ≤106-row tables passed).
      const candidateIds = rows.map((r) => String(r.id));
      const archivedIdSet = new Set();
      for (const idCh of chunk(candidateIds, DELETE_CHUNK)) {
        const { data: alreadyArchived, error: archCheckErr } = await supabase
          .from('retention_archive')
          .select('source_id')
          .eq('source_table', policy.table)
          .in('source_id', idCh);
        if (archCheckErr) throw new Error(`archive-dedup check failed: ${archCheckErr.message}`);
        for (const a of (alreadyArchived || [])) archivedIdSet.add(a.source_id);
      }
      const toArchive = rows.filter((r) => !archivedIdSet.has(String(r.id)));

      // 1) ARCHIVE — must succeed before any delete (TR-1). Skips ids already archived by
      // a prior run whose delete failed (see id-cursor guard above).
      if (toArchive.length > 0) {
        const archiveRows = toArchive.map((r) => ({
          source_table: policy.table,
          source_id: r.id != null ? String(r.id) : null,
          row_data: r,
          row_timestamp: r[policy.timestampColumn] || null,
          archived_by: 'retention-enforce',
          run_id: runId,
        }));
        const { error: insErr, count: insCount } = await supabase
          .from('retention_archive')
          .insert(archiveRows, { count: 'exact' });
        if (insErr) throw new Error(`archive insert failed (NO rows deleted this batch): ${insErr.message}`);
        if ((insCount ?? archiveRows.length) !== archiveRows.length) {
          throw new Error(`archive insert count mismatch (${insCount} != ${archiveRows.length}) — aborting before delete`);
        }
        result.archived += toArchive.length;
      }

      // 2) DELETE the archived ids (chunked — URL-length safe). Includes both
      // freshly-archived ids and already-archived-pending-delete ids from a prior run.
      const ids = rows.map((r) => r.id);
      for (const ch of chunk(ids, DELETE_CHUNK)) {
        const { error: delErr } = await supabase.from(policy.table).delete().in('id', ch);
        if (delErr) throw new Error(`delete failed after archive (rows ARE archived; rerun converges): ${delErr.message}`);
        result.deleted += ch.length;
      }

      if (rows.length < batchLimit) break; // backlog drained
    }
    return result;
  } catch (err) {
    result.error = err.message;
    return result;
  }
}

export async function runEnforcement({ apply = false } = {}) {
  const supabase = createSupabaseServiceClient();
  const started = Date.now();
  const runId = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : undefined;
  const mode = apply ? 'apply' : 'dry_run';
  console.log(`\n— retention-enforce (${mode}) —`);

  const perTable = [];
  let anyError = false;
  for (const policy of RETENTION_POLICIES) {
    const r = await enforcePolicy(supabase, policy, { apply, runId });
    perTable.push(r);
    anyError = anyError || Boolean(r.error);
    const tail = r.error ? `ERROR: ${r.error}` : apply ? `archived ${r.archived}, deleted ${r.deleted}` : 'dry';
    console.log(`  ${r.table.padEnd(26)} >${r.hotDays}d: ${String(r.eligible).padStart(7)} eligible | ${tail}`);
  }

  for (const s of SOAK_ENTRIES) {
    const eligible = new Date() >= new Date(s.eligibleAfter);
    console.log(`  ${s.table.padEnd(26)} SOAK (report-only): ${eligible ? 'ELIGIBLE for' : 'not yet eligible until ' + s.eligibleAfter + ' for'} ${s.action}`);
  }

  const rotation = rotateDaemonLog();
  if (rotation.rotated) console.log(`  rotated ${ROTATE_LOG} (${rotation.size} bytes)`);

  // Age-keyed liveness stamp — written for EVERY run including dry.
  const { error: stampErr } = await supabase.from('retention_runs').insert({
    mode,
    caps: { batch: BATCH_SIZE, deleteChunk: DELETE_CHUNK, perRunCaps: Object.fromEntries(RETENTION_POLICIES.map((p) => [p.table, p.perRunCap])) },
    per_table: perTable,
    duration_ms: Date.now() - started,
    ran_by: process.env.CLAUDE_SESSION_ID || 'cli',
  });
  if (stampErr) {
    console.warn(`  ⚠ retention_runs stamp failed: ${stampErr.message}`);
    anyError = true;
  } else {
    console.log('  ✓ retention_runs stamp written');
  }

  try {
    await stampLastFired(supabase, 'standard_loop:retention');
  } catch (err) {
    console.warn(`  ⚠ stampLastFired failed (non-fatal): ${err.message}`);
  }

  return anyError ? 1 : 0;
}

export async function checkLiveness() {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from('retention_runs').select('ran_at').order('ran_at', { ascending: false }).limit(1);
  if (error) { console.error(`liveness: query failed: ${error.message}`); return 1; }
  if (!data || data.length === 0) { console.error('liveness: NO retention runs recorded — job never ran'); return 1; }
  const ageDays = (Date.now() - new Date(data[0].ran_at).getTime()) / 86_400_000;
  const stale = ageDays > LIVENESS_MAX_AGE_DAYS;
  console.log(`liveness: last run ${ageDays.toFixed(1)}d ago (max ${LIVENESS_MAX_AGE_DAYS}d) — ${stale ? 'STALE' : 'fresh'}`);
  return stale ? 1 : 0;
}

export function printArmingSpec() {
  console.log(JSON.stringify({
    tool: 'CronCreate',
    name: 'retention-enforce-weekly',
    schedule: 'weekly (e.g. Sunday 03:00 local)',
    prompt: 'Run `npm run retention:apply` in EHG_Engineer and report the per-table archived/deleted counts; if the command exits non-zero or `npm run retention:check -- --liveness` reports STALE, surface to the coordinator.',
    note: 'Arm only after the chairman approves windows + first apply (SD-LEO-INFRA-RETENTION-POLICY-UNBOUNDED-001 FR-6). The script never self-arms.',
  }, null, 2));
}

if (isMainModule(import.meta.url)) {
  const argv = process.argv.slice(2);
  if (argv.includes('--arming-spec')) {
    printArmingSpec();
  } else if (argv.includes('--liveness')) {
    checkLiveness().then((code) => { process.exitCode = code; });
  } else {
    runEnforcement({ apply: argv.includes('--apply') }).then((code) => { process.exitCode = code; });
  }
}

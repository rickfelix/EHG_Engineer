#!/usr/bin/env node
/**
 * DR restore rehearsal — proves the two in-DB backup mechanisms actually restore.
 *
 * SD-LEO-INFRA-RESILIENCE-REVIEW-SPECIAL-001 (FR-4). npm run dr:rehearse
 *
 * Drill A — retention_archive round trip:
 *   sample <=500 archived rows for ONE table (workflow_trace_log — the largest
 *   archived corpus), re-insert each row_data JSONB into a scratch table built
 *   from the LIVE table's column shape (jsonb_populate_record), read back via
 *   to_jsonb and assert field-level fidelity.
 *
 * Drill B — quarantine-table copy:
 *   copy a sample from management_reviews_quarantine_20260610 into scratch and
 *   assert row identity via per-row md5(row::text).
 *
 * Safety contract (asserted, not promised):
 *   - every statement passes through the audited executor; a whitelist
 *     classifier rejects anything that is not a pure read or a write scoped to
 *     the scratch schema BEFORE it reaches the database (see
 *     restore-rehearsal-core.mjs classifyStatement).
 *   - the scratch schema dr_rehearsal_<yyyymmdd_hhmm> is DROPped in a finally
 *     block even when a drill fails.
 *
 * Exit codes: 0 PASS, 1 FAIL, 2 operational error (could not run).
 */

import fs from 'fs';
import path from 'path';
import { createDatabaseClient } from '../../lib/supabase-connection.js';
import { armCliTeardown } from '../../lib/cli-graceful-exit.js';
import {
  scratchSchemaName,
  isValidScratchSchema,
  clampSampleSize,
  makeAuditedExecutor,
  compareRestoredRows,
  md5ListsMatch,
  buildReport,
} from './restore-rehearsal-core.mjs';

// Fixed targets — deliberately constants, never user input (identifier safety).
const DRILL_A_ARCHIVED_TABLE = 'workflow_trace_log';
const DRILL_B_QUARANTINE_TABLE = 'management_reviews_quarantine_20260610';
const SAFE_IDENT = /^[a-z0-9_]+$/;

function parseArgs(argv) {
  const args = { sample: 500, out: '' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--sample' && argv[i + 1]) args.sample = argv[++i];
    else if (argv[i] === '--out' && argv[i + 1]) args.out = argv[++i];
  }
  args.sample = clampSampleSize(args.sample);
  return args;
}

/** Live column shape (name + rendered type) of a public table. Read-only. */
async function liveColumnShape(execute, tableName) {
  const { rows } = await execute(
    `SELECT a.attname AS col, format_type(a.atttypid, a.atttypmod) AS coltype
       FROM pg_attribute a
      WHERE a.attrelid = ('public.' || $1)::regclass
        AND a.attnum > 0 AND NOT a.attisdropped
      ORDER BY a.attnum`,
    [tableName],
    `column-shape:${tableName}`
  );
  if (!rows.length) throw new Error(`No columns found for public.${tableName}`);
  return rows; // [{col, coltype}]
}

async function drillA(execute, scratch, sampleSize) {
  const t = DRILL_A_ARCHIVED_TABLE;
  if (!SAFE_IDENT.test(t)) throw new Error(`unsafe identifier: ${t}`);

  // 1. Live column shape → scratch table (all columns nullable on purpose: we
  //    are testing payload fidelity, not constraint re-creation).
  const shape = await liveColumnShape(execute, t);
  const colDefs = shape.map((c) => `"${c.col}" ${c.coltype}`).join(', ');
  const scratchTable = `${scratch}."restored_${t}"`;
  await execute(`CREATE TABLE ${scratchTable} (${colDefs})`, [], `create-restore-target:${t}`);

  // 2. Sample archived rows (deterministic order).
  const { rows: archived } = await execute(
    `SELECT id, source_id, row_data
       FROM public.retention_archive
      WHERE source_table = $1
      ORDER BY archived_at, id
      LIMIT $2`,
    [t, sampleSize],
    'sample-retention-archive'
  );
  if (!archived.length) {
    return { name: 'retention_archive round trip', archivedTable: t, sampled: 0, status: 'FAIL', reason: 'no archived rows found' };
  }
  const payloads = archived.map((r) => r.row_data);

  // 3. Re-insert: the documented restore path is "re-insert row_data".
  await execute(
    `INSERT INTO ${scratchTable}
       SELECT (jsonb_populate_record(NULL::${scratchTable}, e)).*
         FROM jsonb_array_elements($1::jsonb) AS e`,
    [JSON.stringify(payloads)],
    'restore-insert'
  );

  // 4. Read back and compare field-by-field.
  const { rows: restoredRows } = await execute(
    `SELECT to_jsonb(t) AS j FROM ${scratchTable} t`,
    [],
    'read-back-restored'
  );
  const restored = restoredRows.map((r) => r.j);
  const cmp = compareRestoredRows({
    originals: payloads,
    restored,
    columns: shape.map((c) => c.col),
    idField: 'id',
  });

  const pass = cmp.mismatches.length === 0 && cmp.missingRestored.length === 0 && cmp.rowsCompared === payloads.length;
  return {
    name: 'retention_archive round trip (re-insert row_data)',
    archivedTable: t,
    sampled: payloads.length,
    restored: restored.length,
    rowsCompared: cmp.rowsCompared,
    fieldChecks: cmp.fieldChecks,
    mismatches: cmp.mismatches.slice(0, 10),
    mismatchCount: cmp.mismatches.length,
    missingRestored: cmp.missingRestored.slice(0, 10),
    schemaDriftKeys: cmp.droppedKeys,
    status: pass ? 'PASS' : 'FAIL',
  };
}

async function drillB(execute, scratch, sampleSize) {
  const t = DRILL_B_QUARANTINE_TABLE;
  if (!SAFE_IDENT.test(t)) throw new Error(`unsafe identifier: ${t}`);
  const scratchTable = `${scratch}."restored_quarantine"`;

  // 1. Scratch copy with the exact live shape (LIKE keeps column order/types,
  //    which row::text rendering depends on).
  await execute(`CREATE TABLE ${scratchTable} (LIKE public.${t})`, [], 'create-quarantine-copy');

  // 2. Copy deterministic sample.
  await execute(
    `INSERT INTO ${scratchTable}
       SELECT * FROM (SELECT * FROM public.${t} ORDER BY id LIMIT $1) s`,
    [sampleSize],
    'copy-quarantine-sample'
  );

  // 3. Row-identity: per-row md5(row::text) on the same deterministic sample.
  const { rows: src } = await execute(
    `SELECT md5(s::text) AS h
       FROM (SELECT * FROM public.${t} ORDER BY id LIMIT $1) s`,
    [sampleSize],
    'md5-source-sample'
  );
  const { rows: dst } = await execute(
    `SELECT md5(t::text) AS h FROM ${scratchTable} t`,
    [],
    'md5-scratch-copy'
  );

  const cmp = md5ListsMatch(src.map((r) => r.h), dst.map((r) => r.h));
  return {
    name: 'quarantine-table copy (md5 row identity)',
    quarantineTable: t,
    sampled: cmp.sourceCount,
    copied: cmp.scratchCount,
    md5Match: cmp.match,
    onlySource: cmp.onlySource,
    onlyScratch: cmp.onlyScratch,
    status: cmp.match && cmp.sourceCount > 0 ? 'PASS' : 'FAIL',
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const scratch = scratchSchemaName();
  if (!isValidScratchSchema(scratch)) throw new Error(`generated scratch schema failed validation: ${scratch}`);

  const startedAt = new Date().toISOString();
  const auditLog = [];
  let client;
  let a = null;
  let b = null;
  let schemaDropped = false;
  let fatal = null;

  try {
    client = await createDatabaseClient('engineer', { verify: false });
  } catch (e) {
    console.error('[dr:rehearse] could not connect:', e.message);
    await armCliTeardown(2);
    return;
  }

  const execute = makeAuditedExecutor(client, scratch, auditLog);

  try {
    await execute(`CREATE SCHEMA "${scratch}"`, [], 'create-scratch-schema');

    try {
      a = await drillA(execute, `"${scratch}"`, args.sample);
    } catch (e) {
      a = { name: 'retention_archive round trip', status: 'FAIL', error: e.message };
    }
    try {
      b = await drillB(execute, `"${scratch}"`, args.sample);
    } catch (e) {
      b = { name: 'quarantine-table copy', status: 'FAIL', error: e.message };
    }
  } catch (e) {
    fatal = e.message;
  } finally {
    // Cleanup MUST run even on failure — the scratch schema never outlives the run.
    try {
      await execute(`DROP SCHEMA IF EXISTS "${scratch}" CASCADE`, [], 'drop-scratch-schema');
      schemaDropped = true;
    } catch (e) {
      console.error(`[dr:rehearse] CLEANUP FAILED — manual action: DROP SCHEMA IF EXISTS "${scratch}" CASCADE (${e.message})`);
    }
    try { await client.end(); } catch { /* already closed */ }
  }

  const report = buildReport({
    scratchSchema: scratch,
    startedAt,
    finishedAt: new Date().toISOString(),
    drillA: a,
    drillB: b,
    auditLog,
    schemaDropped,
    error: fatal,
  });

  const json = JSON.stringify(report, null, 2);
  if (args.out) {
    fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
    fs.writeFileSync(args.out, json);
    console.log(`[dr:rehearse] report written to ${args.out}`);
  }
  console.log(json);
  console.log(
    `[dr:rehearse] ${report.overall} — drillA=${report.drills.A.status} drillB=${report.drills.B.status} ` +
      `stmts=${report.statementAudit.total} (reads=${report.statementAudit.reads}, scratchWrites=${report.statementAudit.scratchWrites}, forbidden=${report.statementAudit.forbidden}) ` +
      `scratchDropped=${report.cleanup.schemaDropped}`
  );

  await armCliTeardown(report.overall === 'PASS' ? 0 : 1);
}

main().catch(async (e) => {
  console.error('[dr:rehearse] fatal:', e);
  await armCliTeardown(2);
});

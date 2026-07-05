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
 * Drill B — quarantine-table copy (synthetic fixture, SD-LEO-INFRA-RETARGET-RESTORE-REHEARSAL-001):
 *   build a synthetic source fixture inside the scratch schema (hard-coded
 *   23-column shape mirroring the management_reviews table — see
 *   QUARANTINE_FIXTURE_COLUMNS), copy a deterministic sample into a second
 *   scratch table, and assert row identity via per-row md5(row::text).
 *   Retargeted off the real quarantine backup table this drill previously read
 *   from directly, which is eligible for a future chairman-gated drop — this
 *   drill no longer depends on it existing.
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
const SAFE_IDENT = /^[a-z0-9_]+$/;

// Drill B synthetic fixture — hard-coded to mirror the management_reviews table's live
// 23-column shape (docs/reference/schema/engineer/tables/management_reviews.md, captured
// 2026-07-02). Deliberately NOT derived from any live/backup table: this is what makes
// Drill B independent of the real quarantine backup table's eventual chairman-gated drop.
const QUARANTINE_FIXTURE_COLUMNS = [
  { col: 'id', type: 'uuid' },
  { col: 'review_date', type: 'date' },
  { col: 'review_type', type: 'text' },
  { col: 'baseline_version_from', type: 'integer' },
  { col: 'baseline_version_to', type: 'integer' },
  { col: 'planned_capabilities', type: 'integer' },
  { col: 'actual_capabilities', type: 'integer' },
  { col: 'planned_ventures', type: 'integer' },
  { col: 'actual_ventures', type: 'integer' },
  { col: 'planned_sds', type: 'integer' },
  { col: 'actual_sds', type: 'integer' },
  { col: 'okr_snapshot', type: 'jsonb' },
  { col: 'risk_snapshot', type: 'jsonb' },
  { col: 'strategy_health', type: 'jsonb' },
  { col: 'decisions', type: 'jsonb' },
  { col: 'actions', type: 'jsonb' },
  { col: 'pipeline_snapshot', type: 'jsonb' },
  { col: 'eva_narrative', type: 'text' },
  { col: 'eva_proposals', type: 'jsonb' },
  { col: 'chairman_notes', type: 'text' },
  { col: 'chairman_approved_proposals', type: 'jsonb' },
  { col: 'overall_score', type: 'integer' },
  { col: 'created_at', type: 'timestamptz' },
];

/** Deterministic synthetic rows matching QUARANTINE_FIXTURE_COLUMNS — no live data read. */
function buildSyntheticQuarantineRows(count) {
  const reviewTypes = ['weekly', 'monthly', 'ad_hoc'];
  const rows = [];
  for (let i = 0; i < count; i++) {
    rows.push({
      id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      review_date: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`,
      review_type: reviewTypes[i % reviewTypes.length],
      baseline_version_from: i,
      baseline_version_to: i + 1,
      planned_capabilities: i * 2,
      actual_capabilities: i,
      planned_ventures: i * 3,
      actual_ventures: i,
      planned_sds: i * 5,
      actual_sds: i,
      okr_snapshot: { fixture: true, index: i },
      risk_snapshot: { fixture: true, index: i },
      strategy_health: { fixture: true, index: i },
      decisions: [],
      actions: [],
      pipeline_snapshot: { fixture: true, index: i },
      eva_narrative: `synthetic fixture row ${i}`,
      eva_proposals: [],
      chairman_notes: null,
      chairman_approved_proposals: [],
      overall_score: i % 101,
      created_at: '2026-01-01T00:00:00+00:00',
    });
  }
  return rows;
}

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

export async function drillB(execute, scratch, sampleSize) {
  const fixtureTable = `${scratch}."quarantine_fixture"`;
  const restoredTable = `${scratch}."restored_quarantine"`;

  // 1. Synthetic source fixture — hard-coded shape, no live table read.
  const colDefs = QUARANTINE_FIXTURE_COLUMNS.map((c) => `"${c.col}" ${c.type}`).join(', ');
  await execute(`CREATE TABLE ${fixtureTable} (${colDefs})`, [], 'create-quarantine-fixture');

  const syntheticRows = buildSyntheticQuarantineRows(sampleSize);
  await execute(
    `INSERT INTO ${fixtureTable}
       SELECT (jsonb_populate_record(NULL::${fixtureTable}, e)).*
         FROM jsonb_array_elements($1::jsonb) AS e`,
    [JSON.stringify(syntheticRows)],
    'insert-quarantine-fixture'
  );

  // 2. "Restore" copy — same shape, scratch-to-scratch (no public schema involved).
  await execute(`CREATE TABLE ${restoredTable} (LIKE ${fixtureTable})`, [], 'create-quarantine-copy');
  await execute(
    `INSERT INTO ${restoredTable}
       SELECT * FROM (SELECT * FROM ${fixtureTable} ORDER BY id LIMIT $1) s`,
    [sampleSize],
    'copy-quarantine-sample'
  );

  // 3. Row-identity: per-row md5(row::text) on the same deterministic sample.
  const { rows: src } = await execute(
    `SELECT md5(s::text) AS h
       FROM (SELECT * FROM ${fixtureTable} ORDER BY id LIMIT $1) s`,
    [sampleSize],
    'md5-source-sample'
  );
  const { rows: dst } = await execute(
    `SELECT md5(t::text) AS h FROM ${restoredTable} t`,
    [],
    'md5-scratch-copy'
  );

  const cmp = md5ListsMatch(src.map((r) => r.h), dst.map((r) => r.h));
  return {
    name: 'quarantine-table copy (md5 row identity, synthetic fixture)',
    fixtureSchema: 'synthetic:management_reviews-shape',
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

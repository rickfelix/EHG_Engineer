#!/usr/bin/env node
/**
 * CP-0 migration runner for SD-EVA-SUPPORT-CLI-SKILL-ORCH-001-C.
 * - Migration 1: eva_todoist_intake.sd_refs (jsonb NOT NULL DEFAULT '[]')
 * - Migration 2: eva_support_decision_log.decision_kind (text NOT NULL + CHECK) + metadata (jsonb NOT NULL DEFAULT '{}')
 *
 * Uses canonical lib/supabase-connection.js helpers (createDatabaseClient + splitPostgreSQLStatements).
 * Persists a sub_agent_execution_results row at the end.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  createDatabaseClient,
  splitPostgreSQLStatements,
} from '../lib/supabase-connection.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKTREE_ROOT = path.resolve(__dirname, '../..');

const MIG1 = path.join(
  WORKTREE_ROOT,
  'database/migrations/20260527_eva-support-sd-refs-column.sql'
);
const MIG2 = path.join(
  WORKTREE_ROOT,
  'database/migrations/20260527_eva-support-decision-log-decision-kind-metadata.sql'
);

const SD_UUID = '6696db72-d1b1-4a07-8281-3bd7eb922251';
const EVIDENCE_XREF = '64396c27';

async function snapshotPre(client) {
  const out = {};
  const intakeCount = await client.query(
    `SELECT count(*)::int AS c FROM eva_todoist_intake`
  );
  out.eva_todoist_intake_rows = intakeCount.rows[0].c;

  const intakeHasSdRefs = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name='eva_todoist_intake' AND column_name='sd_refs'`
  );
  out.eva_todoist_intake_has_sd_refs = intakeHasSdRefs.rows.length > 0;

  const logCount = await client.query(
    `SELECT count(*)::int AS c FROM eva_support_decision_log`
  );
  out.eva_support_decision_log_rows = logCount.rows[0].c;

  const logCols = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name='eva_support_decision_log'
       AND column_name IN ('decision_kind','metadata')`
  );
  out.eva_support_decision_log_existing_cols = logCols.rows.map((r) => r.column_name).sort();

  return out;
}

async function runMigration(client, filePath, label) {
  const sql = fs.readFileSync(filePath, 'utf8');
  const statements = splitPostgreSQLStatements(sql).filter(
    (s) => s.replace(/--[^\n]*/g, '').trim().length > 0
  );
  console.log(`\n=== ${label} (${path.basename(filePath)}) ===`);
  console.log(`  Statements (non-empty, comment-stripped): ${statements.length}`);

  let executed = 0;
  for (const stmt of statements) {
    const preview = stmt.trim().replace(/\s+/g, ' ').slice(0, 110);
    console.log(`  → exec: ${preview}${stmt.length > 110 ? '…' : ''}`);
    await client.query(stmt);
    executed += 1;
  }
  return executed;
}

async function verifyMigration1(client) {
  const verdict = { name: 'TS-M1', checks: [] };

  // Column shape
  const col = await client.query(
    `SELECT column_name, data_type, is_nullable, column_default
       FROM information_schema.columns
      WHERE table_name='eva_todoist_intake' AND column_name='sd_refs'`
  );
  const colRow = col.rows[0] || null;
  const colOk =
    !!colRow &&
    colRow.data_type === 'jsonb' &&
    colRow.is_nullable === 'NO' &&
    String(colRow.column_default || '').includes("'[]'::jsonb");
  verdict.checks.push({
    name: 'column shape (jsonb NOT NULL default [])',
    ok: colOk,
    detail: colRow,
  });

  // No NULLs
  const nullCount = await client.query(
    `SELECT count(*)::int AS c FROM eva_todoist_intake WHERE sd_refs IS NULL`
  );
  verdict.checks.push({
    name: 'no NULL sd_refs',
    ok: nullCount.rows[0].c === 0,
    detail: { null_count: nullCount.rows[0].c },
  });

  // All default to '[]'
  const emptyArrayCount = await client.query(
    `SELECT count(*)::int AS c FROM eva_todoist_intake WHERE sd_refs = '[]'::jsonb`
  );
  const totalRows = await client.query(
    `SELECT count(*)::int AS c FROM eva_todoist_intake`
  );
  verdict.checks.push({
    name: 'all rows default to []',
    ok: emptyArrayCount.rows[0].c === totalRows.rows[0].c,
    detail: { empty_array: emptyArrayCount.rows[0].c, total: totalRows.rows[0].c },
  });

  verdict.pass = verdict.checks.every((c) => c.ok);
  return verdict;
}

async function verifyMigration2(client) {
  const verdict = { name: 'TS-M2', checks: [] };

  // Columns shape
  const cols = await client.query(
    `SELECT column_name, data_type, is_nullable, column_default
       FROM information_schema.columns
      WHERE table_name='eva_support_decision_log'
        AND column_name IN ('decision_kind','metadata')
      ORDER BY column_name`
  );
  const byName = Object.fromEntries(cols.rows.map((r) => [r.column_name, r]));

  const dkOk =
    !!byName.decision_kind &&
    byName.decision_kind.data_type === 'text' &&
    byName.decision_kind.is_nullable === 'NO' &&
    (byName.decision_kind.column_default === null ||
      byName.decision_kind.column_default === undefined);
  verdict.checks.push({
    name: 'decision_kind text NOT NULL no default',
    ok: dkOk,
    detail: byName.decision_kind,
  });

  const mdOk =
    !!byName.metadata &&
    byName.metadata.data_type === 'jsonb' &&
    byName.metadata.is_nullable === 'NO' &&
    String(byName.metadata.column_default || '').includes("'{}'::jsonb");
  verdict.checks.push({
    name: 'metadata jsonb NOT NULL default {}',
    ok: mdOk,
    detail: byName.metadata,
  });

  // CHECK constraint present
  const cons = await client.query(
    `SELECT conname FROM pg_constraint
      WHERE conname = 'eva_support_decision_log_decision_kind_check'`
  );
  verdict.checks.push({
    name: 'CHECK constraint exists',
    ok: cons.rows.length === 1,
    detail: cons.rows,
  });

  // Read full constraint definition (informational)
  const consDef = await client.query(
    `SELECT pg_get_constraintdef(c.oid) AS def
       FROM pg_constraint c
       JOIN pg_class t ON t.oid = c.conrelid
      WHERE t.relname = 'eva_support_decision_log'
        AND c.conname = 'eva_support_decision_log_decision_kind_check'`
  );
  verdict.constraint_definition = consDef.rows[0]?.def || null;

  // Functional CHECK test inside a sub-transaction. We need a column list that
  // satisfies any NOT NULL columns currently on the table — otherwise NOT NULL
  // will fail before the CHECK can. Inspect schema first.
  const cl = await client.query(
    `SELECT column_name, is_nullable, data_type, column_default
       FROM information_schema.columns
      WHERE table_name='eva_support_decision_log'
      ORDER BY ordinal_position`
  );
  verdict.full_column_list = cl.rows;

  // Build INSERT covering NOT NULL columns without defaults (other than the
  // ones we're testing).
  const notNullCols = cl.rows.filter(
    (r) =>
      r.is_nullable === 'NO' &&
      (r.column_default === null || r.column_default === undefined)
  );
  // We always want to set decision_kind explicitly so the CHECK fires.
  const cols2 = notNullCols.map((r) => r.column_name);
  if (!cols2.includes('decision_kind')) cols2.push('decision_kind');

  // Synthesize values per data_type. NULLs are not allowed (NOT NULL), so we use safe sentinels.
  function valueFor(col, kind) {
    if (col.column_name === 'decision_kind') return `'${kind}'`;
    switch (col.data_type) {
      case 'uuid':
        return `'00000000-0000-0000-0000-000000000000'`;
      case 'text':
      case 'character varying':
        return `'__cp0_test__'`;
      case 'jsonb':
        return `'{}'::jsonb`;
      case 'json':
        return `'{}'::json`;
      case 'integer':
      case 'bigint':
      case 'smallint':
      case 'numeric':
      case 'real':
      case 'double precision':
        return `0`;
      case 'boolean':
        return `false`;
      case 'timestamp without time zone':
      case 'timestamp with time zone':
      case 'date':
        return `now()`;
      default:
        return `'__cp0_test__'`;
    }
  }

  function buildInsert(kind) {
    const rows = notNullCols.slice();
    if (!rows.find((r) => r.column_name === 'decision_kind')) {
      rows.push({ column_name: 'decision_kind', data_type: 'text' });
    }
    const colList = rows.map((r) => r.column_name).join(', ');
    const valList = rows.map((r) => valueFor(r, kind)).join(', ');
    return `INSERT INTO eva_support_decision_log (${colList}) VALUES (${valList})`;
  }

  // Test 1: invalid decision_kind must be rejected by CHECK.
  let invalidRejected = false;
  let invalidErrorMessage = null;
  await client.query('BEGIN');
  try {
    await client.query(buildInsert('invalid_kind'));
    invalidRejected = false; // unexpectedly succeeded
  } catch (e) {
    invalidRejected = true;
    invalidErrorMessage = e.message;
  } finally {
    await client.query('ROLLBACK');
  }
  verdict.checks.push({
    name: 'CHECK rejects invalid decision_kind',
    ok: invalidRejected,
    detail: { error_message: invalidErrorMessage },
  });

  // Test 2: valid decision_kind must be accepted (then rolled back, leaving 0 rows).
  let validAccepted = false;
  let validErrorMessage = null;
  await client.query('BEGIN');
  try {
    await client.query(buildInsert('sd_recommendation'));
    validAccepted = true;
  } catch (e) {
    validAccepted = false;
    validErrorMessage = e.message;
  } finally {
    await client.query('ROLLBACK');
  }
  verdict.checks.push({
    name: 'CHECK accepts sd_recommendation',
    ok: validAccepted,
    detail: { error_message: validErrorMessage },
  });

  // Confirm we left the table at the same row count (0 expected).
  const afterCount = await client.query(
    `SELECT count(*)::int AS c FROM eva_support_decision_log`
  );
  verdict.post_row_count = afterCount.rows[0].c;
  verdict.checks.push({
    name: 'no test row pollution',
    ok: afterCount.rows[0].c === 0,
    detail: { post_row_count: afterCount.rows[0].c },
  });

  verdict.pass = verdict.checks.every((c) => c.ok);
  return verdict;
}

async function persistSubAgentResult(client, payload) {
  // Check actual column shape — sub_agent_execution_results often has
  // (id, sd_id, phase, sub_agent_code, verdict, metadata, created_at, ...)
  const cols = await client.query(
    `SELECT column_name, data_type, is_nullable, column_default
       FROM information_schema.columns
      WHERE table_name='sub_agent_execution_results'
      ORDER BY ordinal_position`
  );
  payload.target_table_columns = cols.rows.map((r) => r.column_name);

  // Insert defensively — only set columns that exist.
  const colsByName = Object.fromEntries(cols.rows.map((r) => [r.column_name, r]));
  const insertCols = [];
  const insertVals = [];
  const params = [];
  function add(col, val) {
    if (!colsByName[col]) return;
    insertCols.push(col);
    params.push(val);
    insertVals.push(`$${params.length}`);
  }
  add('sd_id', SD_UUID);
  add('phase', 'EXEC');
  add('sub_agent_code', payload.verdict_overall === 'PASS' ? 'DATABASE' : 'DATABASE');
  // some schemas use 'agent' or 'sub_agent_id' — adapt:
  add('agent', 'DATABASE');
  add('agent_code', 'DATABASE');
  add('verdict', payload.verdict_overall);
  add('status', payload.verdict_overall === 'PASS' ? 'PASS' : 'FAIL');
  add('metadata', JSON.stringify(payload));
  add('summary', payload.summary || `CP-0 migrations ${payload.verdict_overall}`);
  add('confidence', payload.verdict_overall === 'PASS' ? 100 : 0);

  if (insertCols.length === 0) {
    return { wrote_row: false, reason: 'no matching columns in sub_agent_execution_results' };
  }

  const sql = `INSERT INTO sub_agent_execution_results (${insertCols.join(
    ', '
  )}) VALUES (${insertVals.join(', ')}) RETURNING id`;
  try {
    const ins = await client.query(sql, params);
    return { wrote_row: true, id: ins.rows[0].id, cols: insertCols };
  } catch (e) {
    return { wrote_row: false, error_message: e.message, attempted_cols: insertCols };
  }
}

async function main() {
  const client = await createDatabaseClient('engineer', { verify: true, verbose: true });
  try {
    const pre = await snapshotPre(client);
    console.log('\nPRE-STATE:', JSON.stringify(pre, null, 2));

    const exec1 = await runMigration(client, MIG1, 'Migration 1 — sd_refs');
    const exec2 = await runMigration(client, MIG2, 'Migration 2 — decision_kind + metadata');

    const v1 = await verifyMigration1(client);
    const v2 = await verifyMigration2(client);

    const overall = v1.pass && v2.pass ? 'PASS' : 'FAIL';

    const payload = {
      checkpoint: 'CP-0',
      sd_id: SD_UUID,
      phase: 'EXEC',
      sub_agent: 'DATABASE',
      verdict_overall: overall,
      cross_reference: { deep_review_evidence: EVIDENCE_XREF },
      summary: `CP-0: 2 migrations applied (${exec1}+${exec2} stmts). TS-M1 ${
        v1.pass ? 'PASS' : 'FAIL'
      } / TS-M2 ${v2.pass ? 'PASS' : 'FAIL'}`,
      migration_1: {
        file: path.basename(MIG1),
        statements_executed: exec1,
        verification: v1,
      },
      migration_2: {
        file: path.basename(MIG2),
        statements_executed: exec2,
        verification: v2,
      },
      pre_state: pre,
    };

    const persist = await persistSubAgentResult(client, payload);
    payload.persisted_row = persist;

    console.log('\n=== FINAL VERDICT ===');
    console.log(JSON.stringify(payload, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('FATAL', err);
  process.exit(1);
});

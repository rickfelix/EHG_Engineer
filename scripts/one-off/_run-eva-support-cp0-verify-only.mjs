#!/usr/bin/env node
/**
 * CP-0 verification-only re-run for SD-EVA-SUPPORT-CLI-SKILL-ORCH-001-C.
 * Migrations were already applied by the prior run; this script re-verifies
 * the schema state with a corrected functional CHECK test and writes the
 * sub_agent_execution_results row with the correct column shape.
 */
import { createDatabaseClient } from '../lib/supabase-connection.js';

const SD_UUID = '6696db72-d1b1-4a07-8281-3bd7eb922251';
const EVIDENCE_XREF = '64396c27';

function shortVal(col) {
  // sized varchar columns: we cap at 7 chars so character varying(8) is satisfied.
  switch (col.column_name) {
    case 'schema_version':
      return `'v1.0.0'`;
    case 'task_id':
      return `'cp0t'`;
    case 'flow':
      return `'cp0'`;
    case 'eva_reply_summary':
      return `'cp0'`;
    case 'operator_input_summary':
      return `'cp0'`;
    case 'model':
      return `'cp0'`;
    case 'sequence':
      return `0`;
    case 'tokens_in':
      return `0`;
    case 'tokens_out':
      return `0`;
    case 'timestamp':
    case 'created_at':
      return `now()`;
    case 'references':
      return `'[]'::jsonb`;
    case 'metadata':
      return `'{}'::jsonb`;
    default:
      return `'cp0'`;
  }
}

async function main() {
  const client = await createDatabaseClient('engineer', { verify: true });
  try {
    // === RE-VERIFY TS-M1 ===
    const m1Col = await client.query(
      `SELECT column_name, data_type, is_nullable, column_default
         FROM information_schema.columns
        WHERE table_name='eva_todoist_intake' AND column_name='sd_refs'`
    );
    const m1Nulls = await client.query(
      `SELECT count(*)::int AS c FROM eva_todoist_intake WHERE sd_refs IS NULL`
    );
    const m1Empty = await client.query(
      `SELECT count(*)::int AS c FROM eva_todoist_intake WHERE sd_refs = '[]'::jsonb`
    );
    const m1Total = await client.query(
      `SELECT count(*)::int AS c FROM eva_todoist_intake`
    );
    const m1 = {
      column: m1Col.rows[0],
      null_count: m1Nulls.rows[0].c,
      empty_array_count: m1Empty.rows[0].c,
      total_rows: m1Total.rows[0].c,
      pass:
        m1Col.rows[0]?.data_type === 'jsonb' &&
        m1Col.rows[0]?.is_nullable === 'NO' &&
        String(m1Col.rows[0]?.column_default || '').includes("'[]'::jsonb") &&
        m1Nulls.rows[0].c === 0 &&
        m1Empty.rows[0].c === m1Total.rows[0].c,
    };

    // === RE-VERIFY TS-M2 (corrected) ===
    const m2Cols = await client.query(
      `SELECT column_name, data_type, is_nullable, column_default
         FROM information_schema.columns
        WHERE table_name='eva_support_decision_log'
          AND column_name IN ('decision_kind','metadata')`
    );
    const m2ByName = Object.fromEntries(m2Cols.rows.map((r) => [r.column_name, r]));

    const consDef = await client.query(
      `SELECT pg_get_constraintdef(c.oid) AS def
         FROM pg_constraint c
         JOIN pg_class t ON t.oid = c.conrelid
        WHERE t.relname = 'eva_support_decision_log'
          AND c.conname = 'eva_support_decision_log_decision_kind_check'`
    );

    const allCols = await client.query(
      `SELECT column_name, is_nullable, data_type, column_default
         FROM information_schema.columns
        WHERE table_name='eva_support_decision_log'
        ORDER BY ordinal_position`
    );
    const notNullCols = allCols.rows.filter(
      (r) => r.is_nullable === 'NO' && r.column_default === null
    );
    // Always include decision_kind even if it has been backfilled.
    if (!notNullCols.find((r) => r.column_name === 'decision_kind')) {
      notNullCols.push({ column_name: 'decision_kind', data_type: 'text', is_nullable: 'NO', column_default: null });
    }

    function buildInsert(kind) {
      const colList = notNullCols.map((r) => r.column_name).join(', ');
      const valList = notNullCols
        .map((r) => (r.column_name === 'decision_kind' ? `'${kind}'` : shortVal(r)))
        .join(', ');
      return `INSERT INTO eva_support_decision_log (${colList}) VALUES (${valList})`;
    }

    // Negative test (invalid kind must be rejected by the CHECK).
    let invalidRejected = false;
    let invalidErrorMessage = null;
    let invalidErrorCode = null;
    await client.query('BEGIN');
    try {
      await client.query(buildInsert('invalid_kind'));
    } catch (e) {
      invalidRejected = true;
      invalidErrorMessage = e.message;
      invalidErrorCode = e.code; // PG error code 23514 = check_violation
    } finally {
      await client.query('ROLLBACK');
    }

    // Positive test (valid kind must succeed, then ROLLBACK).
    let validAccepted = false;
    let validErrorMessage = null;
    await client.query('BEGIN');
    try {
      await client.query(buildInsert('sd_recommendation'));
      validAccepted = true;
    } catch (e) {
      validErrorMessage = e.message;
    } finally {
      await client.query('ROLLBACK');
    }

    const postCount = await client.query(
      `SELECT count(*)::int AS c FROM eva_support_decision_log`
    );

    const m2 = {
      decision_kind_column: m2ByName.decision_kind,
      metadata_column: m2ByName.metadata,
      constraint_definition: consDef.rows[0]?.def || null,
      invalid_rejected: invalidRejected,
      invalid_error_code: invalidErrorCode,
      invalid_error_message: invalidErrorMessage,
      valid_accepted: validAccepted,
      valid_error_message: validErrorMessage,
      post_row_count: postCount.rows[0].c,
      pass:
        m2ByName.decision_kind?.data_type === 'text' &&
        m2ByName.decision_kind?.is_nullable === 'NO' &&
        m2ByName.decision_kind?.column_default === null &&
        m2ByName.metadata?.data_type === 'jsonb' &&
        m2ByName.metadata?.is_nullable === 'NO' &&
        String(m2ByName.metadata?.column_default || '').includes("'{}'::jsonb") &&
        !!consDef.rows[0]?.def &&
        invalidRejected &&
        invalidErrorCode === '23514' &&
        validAccepted &&
        postCount.rows[0].c === 0,
    };

    const overall = m1.pass && m2.pass ? 'PASS' : 'FAIL';

    // === PERSIST sub_agent_execution_results ===
    const payload = {
      checkpoint: 'CP-0',
      sd_id: SD_UUID,
      phase: 'EXEC',
      sub_agent: 'DATABASE',
      verdict_overall: overall,
      cross_reference: { deep_review_evidence: EVIDENCE_XREF },
      summary: `CP-0: 2 migrations applied. TS-M1 ${
        m1.pass ? 'PASS' : 'FAIL'
      } / TS-M2 ${m2.pass ? 'PASS' : 'FAIL'}.`,
      migration_1_verification: m1,
      migration_2_verification: m2,
    };

    const insertSql = `
      INSERT INTO sub_agent_execution_results
        (sd_id, phase, sub_agent_code, sub_agent_name, verdict, confidence, metadata, summary, source)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id`;
    const ins = await client.query(insertSql, [
      SD_UUID,
      'EXEC',
      'DATABASE',
      'Principal Database Architect',
      overall,
      overall === 'PASS' ? 100 : 0,
      JSON.stringify(payload),
      payload.summary,
      'database-agent-cp0-migration-executor',
    ]);

    payload.persisted_row_id = ins.rows[0].id;

    console.log('\n=== TS-M1 ===');
    console.log(JSON.stringify(m1, null, 2));
    console.log('\n=== TS-M2 ===');
    console.log(JSON.stringify(m2, null, 2));
    console.log('\n=== PERSISTED ROW ===');
    console.log(JSON.stringify({ id: payload.persisted_row_id, verdict: overall }, null, 2));
    console.log('\n=== OVERALL ===', overall);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('FATAL', err);
  process.exit(1);
});

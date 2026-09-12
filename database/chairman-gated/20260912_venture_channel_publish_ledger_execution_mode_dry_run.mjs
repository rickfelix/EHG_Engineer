#!/usr/bin/env node
/**
 * Dry-run proof for 20260912_venture_channel_publish_ledger_execution_mode.sql
 * (SD-LEO-INFRA-DEMAND-ENGINE-FAIL-001 FR-4).
 *
 * Runs the REAL UP file's body (ADD COLUMN x2, backfill, SET NOT NULL, ADD CONSTRAINT, its own
 * DO $verify$ block) against the live database, asserts the column+constraint exist with the
 * right shape and that the 3 pre-existing rows backfilled to 'live', proves the CHECK constraint
 * actually rejects a bad value, then runs the REAL DOWN file's body and asserts both columns are
 * gone again -- all inside ONE transaction that ALWAYS ROLLBACKs, so nothing is ever persisted.
 * Safe to re-run against production any time before the real ceremony.
 *
 * Usage: node database/chairman-gated/20260912_venture_channel_publish_ledger_execution_mode_dry_run.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createDatabaseClient } from '../../lib/supabase-connection.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UP_FILE = join(__dirname, '20260912_venture_channel_publish_ledger_execution_mode.sql');
const DOWN_FILE = join(__dirname, '20260912_venture_channel_publish_ledger_execution_mode_DOWN.sql');

const COLUMN_QUERY = `
  SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'venture_channel_publish_ledger'
     AND column_name IN ('execution_mode', 'mock_run_id')
   ORDER BY column_name
`;

const CONSTRAINT_QUERY = `
  SELECT conname FROM pg_constraint
   WHERE conrelid = 'public.venture_channel_publish_ledger'::regclass
     AND conname = 'venture_channel_publish_ledger_execution_mode_check'
`;

export async function runDryRun(client) {
  const upSql = readFileSync(UP_FILE, 'utf8');
  const downSql = readFileSync(DOWN_FILE, 'utf8');
  const log = [];

  await client.query('BEGIN');
  try {
    try {
      await client.query(upSql);
    } catch (upErr) {
      console.error('UP FAILED:', upErr.message, upErr.code, upErr.position ? `position=${upErr.position}` : '');
      throw upErr;
    }
    log.push('UP applied without error (including its own DO $verify$ NOT-NULL/CHECK-value proofs)');

    const cols = await client.query(COLUMN_QUERY);
    const executionMode = cols.rows.find((r) => r.column_name === 'execution_mode');
    const mockRunId = cols.rows.find((r) => r.column_name === 'mock_run_id');
    const executionModeOk = executionMode?.data_type === 'text' && executionMode?.is_nullable === 'NO';
    const mockRunIdOk = mockRunId?.data_type === 'uuid' && mockRunId?.is_nullable === 'YES';
    log.push(`execution_mode: TEXT NOT NULL: ${executionModeOk}`);
    log.push(`mock_run_id: UUID nullable: ${mockRunIdOk}`);

    const constraintAfterUp = await client.query(CONSTRAINT_QUERY);
    const constraintExists = constraintAfterUp.rows.length === 1;
    log.push(`CHECK constraint exists after UP: ${constraintExists}`);

    const { rows: backfilled } = await client.query(
      `SELECT execution_mode, count(*) FROM venture_channel_publish_ledger GROUP BY execution_mode`
    );
    const allLive = backfilled.length === 1 && backfilled[0].execution_mode === 'live';
    log.push(`Pre-existing rows backfilled to 'live' only: ${allLive} (${JSON.stringify(backfilled)})`);

    // Prove the constraint actually rejects a bad value -- a scoped UPDATE inside this same
    // rolled-back transaction, against one arbitrary existing row, is enough. A SAVEPOINT is
    // required: any error (even one caught here) otherwise poisons the whole outer transaction,
    // aborting every statement that follows (including the DOWN file below).
    let constraintRejects = false;
    await client.query('SAVEPOINT before_bad_value_probe');
    try {
      await client.query(
        `UPDATE venture_channel_publish_ledger SET execution_mode = 'bogus' WHERE true`
      );
    } catch (err) {
      constraintRejects = /venture_channel_publish_ledger_execution_mode_check/.test(err.message)
        || err.code === '23514';
    } finally {
      await client.query('ROLLBACK TO SAVEPOINT before_bad_value_probe');
    }
    log.push(`CHECK constraint rejects an out-of-vocabulary value: ${constraintRejects}`);

    await client.query(downSql);
    log.push('DOWN applied without error');

    const colsAfterDown = await client.query(COLUMN_QUERY);
    const columnsGone = colsAfterDown.rows.length === 0;
    log.push(`Both columns gone after DOWN: ${columnsGone}`);

    const constraintAfterDown = await client.query(CONSTRAINT_QUERY);
    const constraintGone = constraintAfterDown.rows.length === 0;
    log.push(`CHECK constraint gone after DOWN: ${constraintGone}`);

    const allPass = executionModeOk && mockRunIdOk && constraintExists && allLive
      && constraintRejects && columnsGone && constraintGone;

    return { pass: allPass, log };
  } finally {
    await client.query('ROLLBACK');
  }
}

async function main() {
  const client = await createDatabaseClient('engineer');
  try {
    const { pass, log } = await runDryRun(client);
    log.forEach((line) => console.log(`  - ${line}`));
    console.log(pass ? '\n✅ DRY RUN PASS — nothing persisted (ROLLBACK), safe to re-run.' : '\n❌ DRY RUN FAILED');
    process.exitCode = pass ? 0 : 1;
  } finally {
    await client.end();
  }
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error('DRY RUN ERRORED:', err.stack || err.message);
    process.exitCode = 1;
  });
}

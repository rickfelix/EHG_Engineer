#!/usr/bin/env node
/**
 * UP -> DOWN round-trip proof for 20260823_eva_stage_gate_attempts.sql /
 * 20260823_eva_stage_gate_attempts_DOWN.sql (SD-LEO-INFRA-MINUS-EVIDENCE-LAYER-001).
 *
 * Runs the real UP body, asserts the table/functions/trigger exist, runs the real DOWN body,
 * asserts they are gone -- all inside one transaction that always ROLLBACKs. Proves the DOWN file
 * is a genuine inverse of the UP file, not merely IF-EXISTS no-ops that would "pass" even if the
 * DOWN file's object names had drifted from the UP file's.
 *
 * Usage: node database/chairman-gated/20260823_eva_stage_gate_attempts_updown_roundtrip.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createDatabaseClient } from '../../lib/supabase-connection.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UP_FILE = join(__dirname, '20260823_eva_stage_gate_attempts.sql');
const DOWN_FILE = join(__dirname, '20260823_eva_stage_gate_attempts_DOWN.sql');

function stripOuterTransaction(sql) {
  return sql
    .replace(/^\s*BEGIN;\s*/, '')
    .replace(/\s*COMMIT;\s*(?:--[^\n]*\n?)*$/, '');
}

async function tableAndFunctionsExist(client) {
  const table = await client.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='eva_stage_gate_attempts'`
  );
  const funcs = await client.query(
    `SELECT proname FROM pg_proc WHERE proname IN ('open_eva_gate_attempt','finalize_eva_gate_attempt','eva_stage_gate_attempts_freeze')`
  );
  return { tableExists: table.rowCount > 0, funcCount: funcs.rowCount };
}

async function main() {
  const upSql = stripOuterTransaction(readFileSync(UP_FILE, 'utf8'));
  const downSql = stripOuterTransaction(readFileSync(DOWN_FILE, 'utf8'));
  const client = await createDatabaseClient('engineer', { verify: false });

  let passed = false;
  try {
    await client.query('BEGIN');

    await client.query(upSql);
    const afterUp = await tableAndFunctionsExist(client);
    if (!afterUp.tableExists || afterUp.funcCount !== 3) {
      throw new Error(`After UP: expected table + 3 functions, got tableExists=${afterUp.tableExists} funcCount=${afterUp.funcCount}`);
    }
    console.log('[OK] After UP: table + 3 functions exist.');

    await client.query(downSql);
    const afterDown = await tableAndFunctionsExist(client);
    if (afterDown.tableExists || afterDown.funcCount !== 0) {
      throw new Error(`After DOWN: expected NOTHING to exist, got tableExists=${afterDown.tableExists} funcCount=${afterDown.funcCount}`);
    }
    console.log('[OK] After DOWN: table + all 3 functions are gone.');

    passed = true;
    console.log('[PASS] UP -> DOWN round-trip is a clean, complete inverse.');
  } catch (err) {
    console.error('[FAIL]', err.message);
  } finally {
    await client.query('ROLLBACK');
    console.log('[ROLLBACK] Transaction rolled back -- no live state changed.');
    await client.end();
  }

  if (!passed) process.exitCode = 1;
}

if (isMainModule(import.meta.url)) main();

#!/usr/bin/env node
/**
 * Dry-run proof for 20260823_eva_stage_gate_attempts.sql (SD-LEO-INFRA-MINUS-EVIDENCE-LAYER-001).
 *
 * Runs the REAL UP file's body (table, indexes, trigger, functions, RLS, and the file's own
 * DO $verify$ behavioural proofs) against the real database inside a transaction that ALWAYS
 * ROLLBACKs -- never touches live state. This is the "one-time migration-verification evidence
 * artifact" TR-5 calls for, since this repo's db-tier vitest project never actually runs in CI
 * (installDbTierGate skips it; no workflow sets VITEST_DB_ALLOW_REF) -- a permanent vitest spec
 * for this proof would silently assert nothing, forever.
 *
 * The UP file's own BEGIN;/COMMIT; are stripped here and replaced with a script-controlled
 * transaction so ROLLBACK is guaranteed regardless of the file's own terminal statement --
 * Postgres does not support true nested transactions, so leaving the file's COMMIT in place while
 * also wrapping it in an outer BEGIN would commit for real.
 *
 * Usage: node database/chairman-gated/20260823_eva_stage_gate_attempts_dry_run.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createDatabaseClient } from '../../lib/supabase-connection.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UP_FILE = join(__dirname, '20260823_eva_stage_gate_attempts.sql');

function stripOuterTransaction(sql) {
  // Strip a leading BEGIN; and trailing COMMIT; (the file's own transaction wrapper) so the
  // caller's own transaction control is authoritative. Leaves everything between intact,
  // including the file's internal DO $verify$ block.
  return sql
    .replace(/^\s*BEGIN;\s*/, '')
    .replace(/\s*COMMIT;\s*(?:--[^\n]*\n?)*$/, '');
}

async function main() {
  const upSql = stripOuterTransaction(readFileSync(UP_FILE, 'utf8'));
  const client = await createDatabaseClient('engineer', { verify: false });

  let passed = false;
  try {
    await client.query('BEGIN');
    await client.query(upSql);
    // If we reach here, the file's own DO $verify$ block (existential + behavioural proofs) ran
    // without raising -- the migration's own post-conditions already checked themselves.
    passed = true;
    console.log('[PASS] UP file body + its own DO $verify$ block executed without error.');
  } catch (err) {
    console.error('[FAIL] UP file body raised an error:', err.message);
  } finally {
    await client.query('ROLLBACK');
    console.log('[ROLLBACK] Transaction rolled back -- no live state changed.');
    await client.end();
  }

  if (!passed) process.exitCode = 1;
}

if (isMainModule(import.meta.url)) main();

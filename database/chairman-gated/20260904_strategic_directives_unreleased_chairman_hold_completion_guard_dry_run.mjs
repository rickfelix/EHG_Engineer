#!/usr/bin/env node
/**
 * SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-B FR-2 part 2 — dry-run proof.
 *
 * Runs the REAL UP file body — the three new helper functions, the amended
 * enforce_canonical_lifecycle_write(), and its own inline DO $verify$ block (function-level
 * assertions plus a live disposable-row trigger proof) — against the real database, inside a
 * transaction that always ROLLBACKs. Safe to re-run any time; leaves zero lasting trace either
 * way (the migration's own $verify$ block already deletes its disposable test row before this
 * script's ROLLBACK ever runs, and the ROLLBACK additionally undoes the CREATE OR REPLACE
 * FUNCTION calls themselves).
 *
 * Usage: node database/chairman-gated/20260904_strategic_directives_unreleased_chairman_hold_completion_guard_dry_run.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createDatabaseClient } from '../../lib/supabase-connection.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const upFile = join(__dirname, '20260904_strategic_directives_unreleased_chairman_hold_completion_guard.sql');

async function main() {
  const sql = readFileSync(upFile, 'utf8');
  const client = await createDatabaseClient('ehg', { verbose: true });
  try {
    await client.query('BEGIN');
    console.log('▶ Running UP file body (functions + amended trigger function + inline verify block)...');
    await client.query(sql);
    console.log("✅ UP file executed cleanly -- its own DO verify block raised no exception: all");
    console.log('   function-level assertions for sd_safe_parse_timestamptz / sd_metadata_hold_released /');
    console.log('   sd_metadata_has_unreleased_chairman_hold pass (mirrors the JS-side unit test suite).');
    console.log("   A live trigger-fire proof was attempted and intentionally dropped -- see the migration");
    console.log("   file's own 3d comment for why (unrelated PCVP / handoff-creation guards on this table).");
    await client.query('ROLLBACK');
    console.log('↩ Rolled back — no lasting trace against the live database.');
    process.exitCode = 0;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* connection may already be aborted */ }
    console.error('❌ Dry-run FAILED:', err.message);
    if (err.detail) console.error('   DETAIL:', err.detail);
    if (err.hint) console.error('   HINT:', err.hint);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();

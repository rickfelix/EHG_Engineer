#!/usr/bin/env node
/**
 * Dry-run proof for 20260722_stage_advancement_advance_venture_stage_gate_type_ssot.sql
 * (SD-LEO-INFRA-RECONCILE-EHG-REPO-001; re-verified here for SD-LEO-INFRA-MINUS-GATE-SSOT-001 FR-2).
 *
 * Runs the migration body (CREATE OR REPLACE FUNCTION + COMMENT + its own DO $verify$
 * self-verification block, which carries 10 ASSERTs) against the real database inside a
 * transaction that ALWAYS ROLLBACKs -- never touches live state. This confirms the staged,
 * chairman-gated migration still applies cleanly and its self-verification still passes
 * against current live venture_stages/venture data, without performing the actual apply
 * (which remains a separate, explicit chairman GO decision per the migration's own
 * @chairman-gated / STATUS: STAGED / NEVER-self-apply markers).
 *
 * The migration file has no outer BEGIN/COMMIT of its own (unlike some sibling chairman-gated
 * migrations), so this script supplies the only transaction control.
 *
 * Usage: node database/chairman-gated/20260722_stage_advancement_advance_venture_stage_gate_type_ssot_dry_run.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createDatabaseClient } from '../../lib/supabase-connection.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UP_FILE = join(__dirname, '..', 'migrations', '20260722_stage_advancement_advance_venture_stage_gate_type_ssot.sql');

async function main() {
  const upSql = readFileSync(UP_FILE, 'utf8');
  const client = await createDatabaseClient('engineer', { verify: false });

  let passed = false;
  try {
    await client.query('BEGIN');
    await client.query(upSql);
    // If we reach here, the migration's own DO $verify$ block (10 ASSERTs: arrays deleted,
    // SSOT read landed, preserved behavior intact) ran without raising.
    passed = true;
    console.log('[PASS] Migration body + its own DO $verify$ block (10 ASSERTs) executed without error.');
  } catch (err) {
    console.error('[FAIL] Migration body raised an error:', err.message);
  } finally {
    await client.query('ROLLBACK');
    console.log('[ROLLBACK] Transaction rolled back -- no live state changed.');
    await client.end();
  }

  if (!passed) process.exitCode = 1;
}

if (isMainModule(import.meta.url)) main();

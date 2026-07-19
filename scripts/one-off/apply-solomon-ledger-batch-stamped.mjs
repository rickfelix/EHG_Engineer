#!/usr/bin/env node
/**
 * apply-solomon-ledger-batch-stamped.mjs — service-role apply + verify for the FR-5/TR-3
 * batch-stamp exclusion column. SD-LEO-INFRA-ROLE-MEASUREMENT-INTEGRITY-001 (W2).
 *
 * solomon_advice_outcome_ledger is a chairman-apply-gated table that is NOT in the live schema
 * snapshot, so it is applied via the direct service-role pg path (createDatabaseClient), mirroring
 * how the W3 cost_captured column landed — NOT via MCP (MCP is read-only). Runs the additive
 * migration (ADD COLUMN + backfill UPDATE for the 2026-07-12 retro batch) then verifies the column
 * exists and the expected number of rows were marked.
 *
 * Usage: node scripts/one-off/apply-solomon-ledger-batch-stamped.mjs [--dry-run]
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createDatabaseClient } from '../lib/supabase-connection.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION = path.join(__dirname, '..', '..', 'database', 'migrations', '20260719_solomon_ledger_batch_stamped.sql');

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const sql = fs.readFileSync(MIGRATION, 'utf8');
  const client = await createDatabaseClient('engineer', { verify: false });
  try {
    // Pre-state
    const pre = await client.query(
      `SELECT count(*)::int AS n FROM solomon_advice_outcome_ledger
        WHERE decision_at >= '2026-07-12T00:00:00Z' AND decision_at < '2026-07-13T00:00:00Z'`
    );
    console.log(`Pre-apply: ${pre.rows[0].n} row(s) in the 2026-07-12 retro-batch window.`);

    if (dryRun) { console.log('[dry-run] would apply:', MIGRATION); return; }

    await client.query(sql);
    console.log('✓ Applied migration:', path.basename(MIGRATION));

    // Verify column exists
    const col = await client.query(
      `SELECT data_type, column_default FROM information_schema.columns
        WHERE table_name = 'solomon_advice_outcome_ledger' AND column_name = 'batch_stamped'`
    );
    if (col.rows.length === 0) throw new Error('VERIFY FAILED: batch_stamped column not present after apply');
    console.log(`✓ Column present: batch_stamped ${col.rows[0].data_type} default ${col.rows[0].column_default}`);

    // Verify backfill result
    const marked = await client.query(`SELECT count(*)::int AS n FROM solomon_advice_outcome_ledger WHERE batch_stamped = true`);
    const window = await client.query(
      `SELECT count(*)::int AS n FROM solomon_advice_outcome_ledger
        WHERE decision_at >= '2026-07-12T00:00:00Z' AND decision_at < '2026-07-13T00:00:00Z'`
    );
    console.log(`✓ batch_stamped=true rows: ${marked.rows[0].n} (07-12 window has ${window.rows[0].n})`);
    if (marked.rows[0].n !== window.rows[0].n) {
      console.warn(`⚠ marked (${marked.rows[0].n}) != window (${window.rows[0].n}) — inspect for out-of-window batch rows.`);
    }
    // Confirm none of the marked rows are contemporaneous (sanity: no false positive)
    const contemp = await client.query(
      `SELECT count(*)::int AS n FROM solomon_advice_outcome_ledger
        WHERE batch_stamped = true
          AND decision_at IS NOT NULL AND created_at IS NOT NULL
          AND abs(extract(epoch FROM (decision_at - created_at))) <= 3600`
    );
    console.log(`✓ contemporaneous rows wrongly marked: ${contemp.rows[0].n} (expected 0)`);
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((e) => { console.error('FATAL:', e.message || e); process.exit(1); });

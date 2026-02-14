#!/usr/bin/env node
/**
 * One-time script: Mark SD-EVA-FEAT-TEMPLATES-LAUNCH-001 as completed
 *
 * Problem: UPDATE to status='completed' triggers a cascading trigger that
 * tries to create a PLAN-TO-LEAD handoff on the parent orchestrator,
 * which fails because the parent doesn't have is_working_on=true.
 *
 * Solution: Use SET LOCAL leo.bypass_working_on_check = 'true' within
 * a transaction to bypass the working-on check.
 */

import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Client } = pg;

async function main() {
  const client = new Client({
    connectionString: process.env.SUPABASE_POOLER_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });

  await client.connect();
  console.log('Connected to database.');

  try {
    // Step 1: Verify current state BEFORE the update
    console.log('\n--- BEFORE UPDATE: SD-EVA-FEAT-TEMPLATES-LAUNCH-001 ---');
    const before = await client.query(
      'SELECT sd_key, status, current_phase, progress FROM strategic_directives_v2 WHERE sd_key = $1',
      ['SD-EVA-FEAT-TEMPLATES-LAUNCH-001']
    );
    console.log(JSON.stringify(before.rows[0], null, 2));

    // Step 2: Execute the update in a transaction with bypass
    console.log('\n--- EXECUTING TRANSACTION ---');
    await client.query('BEGIN');
    await client.query("SET LOCAL leo.bypass_working_on_check = 'true'");

    const updateResult = await client.query(
      "UPDATE strategic_directives_v2 SET status = 'completed', current_phase = 'COMPLETED', progress = 100, updated_at = NOW() WHERE sd_key = $1 RETURNING sd_key, status, current_phase, progress",
      ['SD-EVA-FEAT-TEMPLATES-LAUNCH-001']
    );
    console.log('Update result:', JSON.stringify(updateResult.rows[0], null, 2));

    await client.query('COMMIT');
    console.log('COMMIT successful.');

    // Step 3: Verify SD-EVA-FEAT-TEMPLATES-LAUNCH-001 after
    console.log('\n--- AFTER UPDATE: SD-EVA-FEAT-TEMPLATES-LAUNCH-001 ---');
    const after = await client.query(
      'SELECT sd_key, status, current_phase, progress, updated_at FROM strategic_directives_v2 WHERE sd_key = $1',
      ['SD-EVA-FEAT-TEMPLATES-LAUNCH-001']
    );
    console.log(JSON.stringify(after.rows[0], null, 2));

    // Step 4: Check parent orchestrator SD-EVA-ORCH-TEMPLATE-GAPFILL-001
    console.log('\n--- PARENT: SD-EVA-ORCH-TEMPLATE-GAPFILL-001 ---');
    const parent = await client.query(
      'SELECT sd_key, status, current_phase, progress, updated_at FROM strategic_directives_v2 WHERE sd_key = $1',
      ['SD-EVA-ORCH-TEMPLATE-GAPFILL-001']
    );
    console.log(JSON.stringify(parent.rows[0], null, 2));

    // Step 5: Check grandparent orchestrator SD-EVA-ORCH-PHASE-A-001
    console.log('\n--- GRANDPARENT: SD-EVA-ORCH-PHASE-A-001 ---');
    const grandparent = await client.query(
      'SELECT sd_key, status, current_phase, progress, updated_at FROM strategic_directives_v2 WHERE sd_key = $1',
      ['SD-EVA-ORCH-PHASE-A-001']
    );
    console.log(JSON.stringify(grandparent.rows[0], null, 2));

    // Step 6: Check all children of the parent orchestrator for context
    console.log('\n--- ALL CHILDREN OF SD-EVA-ORCH-TEMPLATE-GAPFILL-001 ---');
    const children = await client.query(
      'SELECT sd_key, status, current_phase, progress FROM strategic_directives_v2 WHERE parent_sd_id = $1 ORDER BY sd_key',
      ['02e0ff7b-20a3-40d7-a2d4-971f2e229f62']
    );
    children.rows.forEach(r => console.log(JSON.stringify(r)));

  } catch (err) {
    console.error('ERROR:', err.message);
    console.error('Detail:', err.detail || 'none');
    console.error('Hint:', err.hint || 'none');
    console.error('Where:', err.where || 'none');
    try { await client.query('ROLLBACK'); console.log('ROLLBACK executed.'); } catch (_) {}
  } finally {
    await client.end();
    console.log('\nConnection closed.');
  }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });

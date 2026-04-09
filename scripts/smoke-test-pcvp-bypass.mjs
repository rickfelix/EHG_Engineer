#!/usr/bin/env node
/**
 * Smoke test: PCVP emergency bypass path (all 6 gates)
 *
 * Verifies the full PCVP bypass chain works end-to-end by completing a
 * target SD via `leo.bypass_completion_check`. Rerunnable — takes SD_KEY
 * and SD_UUID from env vars so it can be used as a regression harness
 * for any target SD.
 *
 * Usage:
 *   SD_KEY=SD-EXAMPLE-001 SD_UUID=<uuid> DISABLE_SSL_VERIFY=true \
 *     node scripts/smoke-test-pcvp-bypass.mjs
 *
 * Defaults are wired to the draft orchestrator child discovered during
 * the initial PCVP chain debugging session.
 *
 * Sets two session variables because multiple triggers gate the path:
 *   - enforce_handoff_on_phase_transition + enforce_handoff_system
 *     + auto_validate_handoff + enforce_progress_on_completion
 *     + enforce_sd_quality_on_advancement
 *     → leo.bypass_completion_check='true'
 *   - enforce_is_working_on_for_handoffs
 *     → leo.bypass_working_on_check='true'
 */

import { createDatabaseClient } from './lib/supabase-connection.js';

const SD_KEY = process.env.SD_KEY || '';
const SD_UUID = process.env.SD_UUID || '';

if (!SD_KEY || !SD_UUID) {
  console.error('ERROR: SD_KEY and SD_UUID env vars are required');
  console.error('Usage: SD_KEY=<sd-key> SD_UUID=<uuid> node scripts/smoke-test-pcvp-bypass.mjs');
  process.exit(2);
}

async function main() {
  const client = await createDatabaseClient('engineer', { verify: false });

  // Pre-state snapshot
  console.log('=== PRE-STATE ===');
  const pre = await client.query(
    `SELECT sd_key, id, status, current_phase, progress, is_working_on, sd_type
     FROM strategic_directives_v2
     WHERE sd_key = $1`,
    [SD_KEY]
  );
  if (pre.rowCount === 0) {
    console.error(`ERROR: No SD found with sd_key=${SD_KEY}`);
    await client.end();
    process.exit(2);
  }
  console.log(JSON.stringify(pre.rows[0], null, 2));

  const preHandoffs = await client.query(
    `SELECT id, handoff_type, from_phase, to_phase, status, created_by, created_at
     FROM sd_phase_handoffs
     WHERE sd_id = $1
     ORDER BY created_at DESC
     LIMIT 3`,
    [SD_UUID]
  );
  console.log(`\nExisting handoffs for this SD: ${preHandoffs.rowCount}`);
  preHandoffs.rows.forEach((r) => console.log('  ', JSON.stringify(r)));

  // Transactional bypass
  console.log('\n=== BEGIN TRANSACTION ===');
  let committed = false;
  let updateResult = null;
  let auditRows = [];
  let errorInfo = null;

  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL leo.bypass_completion_check = 'true'`);
    await client.query(`SET LOCAL leo.bypass_working_on_check = 'true'`);

    console.log('Set session variables: bypass_completion_check=true, bypass_working_on_check=true');

    const upd = await client.query(
      `UPDATE strategic_directives_v2
       SET status = 'completed',
           current_phase = 'COMPLETED',
           progress = 100,
           updated_at = NOW()
       WHERE sd_key = $1
       RETURNING sd_key, id, status, current_phase, progress, is_working_on`,
      [SD_KEY]
    );
    updateResult = upd.rows[0] || null;
    console.log(`UPDATE returned ${upd.rowCount} row(s)`);
    if (updateResult) console.log(JSON.stringify(updateResult, null, 2));

    const audit = await client.query(
      `SELECT id, sd_id, handoff_type, from_phase, to_phase, status, created_by, created_at
       FROM sd_phase_handoffs
       WHERE sd_id = $1
       ORDER BY created_at DESC
       LIMIT 3`,
      [SD_UUID]
    );
    auditRows = audit.rows;
    console.log(`\nAudit rows after UPDATE (top 3): ${audit.rowCount}`);
    auditRows.forEach((r) => console.log('  ', JSON.stringify(r)));

    await client.query('COMMIT');
    committed = true;
    console.log('\n=== COMMITTED ===');
  } catch (err) {
    errorInfo = {
      message: err.message,
      code: err.code,
      detail: err.detail,
      hint: err.hint,
      where: err.where,
      schema: err.schema,
      table: err.table,
      constraint: err.constraint,
      routine: err.routine,
    };
    console.error('\n=== TRANSACTION FAILED ===');
    console.error(JSON.stringify(errorInfo, null, 2));
    try {
      await client.query('ROLLBACK');
      console.error('ROLLBACK successful');
    } catch (rbErr) {
      console.error('ROLLBACK error:', rbErr.message);
    }
  }

  // Post-state snapshot (outside transaction)
  console.log('\n=== POST-STATE ===');
  const post = await client.query(
    `SELECT sd_key, id, status, current_phase, progress, is_working_on, updated_at
     FROM strategic_directives_v2
     WHERE sd_key = $1`,
    [SD_KEY]
  );
  console.log(JSON.stringify(post.rows[0], null, 2));

  const postHandoffs = await client.query(
    `SELECT id, handoff_type, from_phase, to_phase, status, created_by, created_at
     FROM sd_phase_handoffs
     WHERE sd_id = $1
     ORDER BY created_at DESC
     LIMIT 3`,
    [SD_UUID]
  );
  console.log(`\nFinal handoff rows for this SD: ${postHandoffs.rowCount}`);
  postHandoffs.rows.forEach((r) => console.log('  ', JSON.stringify(r)));

  await client.end();

  console.log('\n=== SUMMARY ===');
  console.log(`transaction_outcome: ${committed ? 'COMMITTED' : 'ROLLED_BACK'}`);
  if (errorInfo) console.log(`error: ${errorInfo.message}`);

  process.exit(committed ? 0 : 1);
}

main().catch((e) => {
  console.error('Unhandled error:', e);
  process.exit(3);
});

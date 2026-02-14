#!/usr/bin/env node
/**
 * One-time verification: Confirm get_progress_breakdown() was updated
 * to check leo_handoff_executions for LEAD-FINAL-APPROVAL handoffs.
 */

import dotenv from 'dotenv';
dotenv.config();
import pg from 'pg';
const { Client } = pg;

async function verify() {
  const url = new URL(process.env.SUPABASE_POOLER_URL);
  const client = new Client({
    host: url.hostname,
    port: url.port || 5432,
    database: url.pathname.slice(1),
    user: url.username,
    password: decodeURIComponent(url.password),
    ssl: url.searchParams.get('sslmode') === 'require' ? { rejectUnauthorized: false } : false
  });

  await client.connect();

  // Verify the function source contains the leo_handoff_executions check
  const result = await client.query(
    "SELECT prosrc FROM pg_proc WHERE proname = 'get_progress_breakdown'"
  );

  if (result.rows.length === 0) {
    console.log('ERROR: get_progress_breakdown function not found!');
    process.exit(1);
  }

  const src = result.rows[0].prosrc;
  const hasLeoHandoffCheck = src.includes('leo_handoff_executions');
  const hasUnionAll = src.includes('UNION ALL');
  const hasFix2026Comment = src.includes('FIX (2026-02-13)');

  console.log('=== Verification Results ===');
  console.log('Function exists: YES');
  console.log('Contains leo_handoff_executions check:', hasLeoHandoffCheck ? 'YES' : 'NO');
  console.log('Uses UNION ALL for dual-table check:', hasUnionAll ? 'YES' : 'NO');
  console.log('Contains FIX comment (2026-02-13):', hasFix2026Comment ? 'YES' : 'NO');

  if (hasLeoHandoffCheck && hasUnionAll) {
    console.log('\nMIGRATION VERIFIED SUCCESSFULLY');
    console.log('get_progress_breakdown() now checks both sd_phase_handoffs');
    console.log('AND leo_handoff_executions for LEAD-FINAL-APPROVAL handoffs.');
  } else {
    console.log('\nWARNING: Function may not have been updated correctly!');
    process.exit(1);
  }

  await client.end();
}

verify().catch(err => {
  console.error('Verification failed:', err.message);
  process.exit(1);
});

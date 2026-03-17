#!/usr/bin/env node
/**
 * Temporarily disable RLS on the 3 tables to test if that's the issue
 * THIS IS FOR DEBUGGING ONLY - NOT A PERMANENT SOLUTION
 */

import { createDatabaseClient } from './lib/supabase-connection.js';

async function toggleRLS(action) {
  const client = await createDatabaseClient('engineer', { verify: true, verbose: true });

  const tables = ['system_health', 'prd_research_audit_log', 'tech_stack_references'];

  console.log(`\n${action === 'disable' ? '⚠️  DISABLING' : '✅ RE-ENABLING'} RLS on 3 tables...\n`);

  for (const table of tables) {
    const sql = `ALTER TABLE ${table} ${action === 'disable' ? 'DISABLE' : 'ENABLE'} ROW LEVEL SECURITY;`;
    process.stdout.write(`   ${table}... `);

    try {
      await client.query(sql);
      console.log('✅');
    } catch (err) {
      console.log('❌', err.message);
    }
  }

  await client.end();
  console.log(`\n${action === 'disable' ? '⚠️  RLS DISABLED' : '✅ RLS RE-ENABLED'} - Test your inserts now\n`);
}

const action = process.argv[2] || 'disable';
if (action !== 'disable' && action !== 'enable') {
  console.error('Usage: node temporary-disable-rls.mjs [disable|enable]');
  process.exit(1);
}

toggleRLS(action).catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});

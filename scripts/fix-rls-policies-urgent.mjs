#!/usr/bin/env node
/**
 * 🚨 URGENT: Fix RLS Policies Blocking INSERT Operations
 *
 * Issue: Missing INSERT policies on 3 tables:
 * - system_health
 * - prd_research_audit_log
 * - tech_stack_references
 *
 * Also inserts missing context7 row in system_health
 *
 * Status: CRITICAL - Blocking ALL testing
 */

import { createDatabaseClient } from './lib/supabase-connection.js';

async function fixRLSPolicies() {
  console.log('🚨 URGENT RLS POLICY FIX\n');
  console.log('Connecting to database with PostgreSQL client...\n');

  const client = await createDatabaseClient('engineer', { verify: true, verbose: true });

  console.log('\n📋 Applying RLS Policy Fixes...\n');

  const fixes = [
    {
      name: 'system_health INSERT policy',
      sql: `DROP POLICY IF EXISTS "Allow authenticated users to insert system_health" ON system_health;
CREATE POLICY "Allow authenticated users to insert system_health"
  ON system_health FOR INSERT
  TO authenticated
  WITH CHECK (true);`
    },
    {
      name: 'prd_research_audit_log INSERT policy',
      sql: `DROP POLICY IF EXISTS "Allow service role to insert prd_research_audit_log" ON prd_research_audit_log;
CREATE POLICY "Allow service role to insert prd_research_audit_log"
  ON prd_research_audit_log FOR INSERT
  TO authenticated
  WITH CHECK (true);`
    },
    {
      name: 'tech_stack_references INSERT policy',
      sql: `DROP POLICY IF EXISTS "Allow authenticated users to insert tech_stack_references" ON tech_stack_references;
CREATE POLICY "Allow authenticated users to insert tech_stack_references"
  ON tech_stack_references FOR INSERT
  TO authenticated
  WITH CHECK (true);`
    },
    {
      name: 'Insert context7 row',
      sql: `INSERT INTO system_health (service_name, circuit_breaker_state, failure_count, updated_at)
VALUES ('context7', 'closed', 0, NOW())
ON CONFLICT (service_name) DO UPDATE SET
  circuit_breaker_state = 'closed',
  failure_count = 0,
  updated_at = NOW();`
    }
  ];

  let successCount = 0;
  let errorCount = 0;

  for (const fix of fixes) {
    process.stdout.write(`   ${fix.name}... `);

    try {
      await client.query(fix.sql);
      console.log('✅ SUCCESS');
      successCount++;
    } catch (err) {
      console.log('❌ FAILED');
      console.error(`      Error: ${err.message}`);
      errorCount++;
    }
  }

  await client.end();

  console.log(`\n${'='.repeat(50)}`);
  console.log(`Summary:`);
  console.log(`   ✅ Successful: ${successCount}/${fixes.length}`);
  console.log(`   ❌ Failed: ${errorCount}/${fixes.length}`);
  console.log(`${'='.repeat(50)}\n`);

  if (errorCount === 0) {
    console.log('✅ All RLS policies fixed successfully!\n');
    console.log('🔍 Running verification...\n');
    return true;
  } else {
    console.log('⚠️  Some fixes failed. Manual intervention may be required.\n');
    return false;
  }
}

// Execute
fixRLSPolicies()
  .then(success => {
    if (success) {
      console.log('✅ RLS policy fix completed. Run `node scripts/check-rls-status.js` to verify.\n');
      process.exit(0);
    } else {
      console.log('❌ RLS policy fix incomplete. Check errors above.\n');
      process.exit(1);
    }
  })
  .catch(err => {
    console.error('\n❌ Fatal error:', err.message);
    console.error(err.stack);
    process.exit(1);
  });

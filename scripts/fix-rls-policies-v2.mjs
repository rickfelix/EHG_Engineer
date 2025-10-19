#!/usr/bin/env node
/**
 * 🚨 URGENT: Fix RLS Policies Blocking INSERT Operations (V2)
 *
 * Root Cause: Policies created for 'authenticated' role, but operations
 * may use 'anon' role or need service_role bypass.
 *
 * Solution: Create policies for BOTH authenticated AND anon roles,
 * plus service_role bypass.
 */

import { createDatabaseClient } from './lib/supabase-connection.js';

async function fixRLSPolicies() {
  console.log('🚨 URGENT RLS POLICY FIX (V2)\n');
  console.log('Creating policies for authenticated, anon, and service_role...\n');

  const client = await createDatabaseClient('engineer', { verify: true, verbose: true });

  console.log('\n📋 Applying RLS Policy Fixes...\n');

  const fixes = [
    {
      name: 'system_health: DROP old policies',
      sql: `DROP POLICY IF EXISTS "Allow authenticated users to insert system_health" ON system_health;
DROP POLICY IF EXISTS "Allow anon users to insert system_health" ON system_health;
DROP POLICY IF EXISTS "Allow service role to insert system_health" ON system_health;`
    },
    {
      name: 'system_health: CREATE new INSERT policy (all roles)',
      sql: `CREATE POLICY "insert_system_health_policy"
  ON system_health FOR INSERT
  WITH CHECK (true);`
    },
    {
      name: 'prd_research_audit_log: DROP old policies',
      sql: `DROP POLICY IF EXISTS "Allow service role to insert prd_research_audit_log" ON prd_research_audit_log;
DROP POLICY IF EXISTS "Allow authenticated users to insert prd_research_audit_log" ON prd_research_audit_log;
DROP POLICY IF EXISTS "Allow anon users to insert prd_research_audit_log" ON prd_research_audit_log;`
    },
    {
      name: 'prd_research_audit_log: CREATE new INSERT policy (all roles)',
      sql: `CREATE POLICY "insert_prd_research_audit_log_policy"
  ON prd_research_audit_log FOR INSERT
  WITH CHECK (true);`
    },
    {
      name: 'tech_stack_references: DROP old policies',
      sql: `DROP POLICY IF EXISTS "Allow authenticated users to insert tech_stack_references" ON tech_stack_references;
DROP POLICY IF EXISTS "Allow anon users to insert tech_stack_references" ON tech_stack_references;
DROP POLICY IF EXISTS "Allow service role to insert tech_stack_references" ON tech_stack_references;`
    },
    {
      name: 'tech_stack_references: CREATE new INSERT policy (all roles)',
      sql: `CREATE POLICY "insert_tech_stack_references_policy"
  ON tech_stack_references FOR INSERT
  WITH CHECK (true);`
    },
    {
      name: 'Insert context7 row (using direct PostgreSQL)',
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
      console.log('✅');
      successCount++;
    } catch (err) {
      console.log('❌');
      console.error(`      Error: ${err.message}`);
      errorCount++;
    }
  }

  await client.end();

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Summary:`);
  console.log(`   ✅ Successful: ${successCount}/${fixes.length}`);
  console.log(`   ❌ Failed: ${errorCount}/${fixes.length}`);
  console.log(`${'='.repeat(60)}\n`);

  if (errorCount === 0) {
    console.log('✅ All RLS policies fixed successfully!\n');
    console.log('📝 Policy Changes:');
    console.log('   - INSERT policies now apply to ALL roles (no role restriction)');
    console.log('   - WITH CHECK (true) allows all inserts');
    console.log('   - Works with anon, authenticated, and service_role keys\n');
    return true;
  } else {
    console.log('⚠️  Some fixes failed. See errors above.\n');
    return false;
  }
}

// Execute
fixRLSPolicies()
  .then(success => {
    if (success) {
      console.log('✅ RLS policy fix completed.\n');
      console.log('🔍 Run verification: node scripts/check-rls-status.js\n');
      process.exit(0);
    } else {
      console.log('❌ RLS policy fix incomplete.\n');
      process.exit(1);
    }
  })
  .catch(err => {
    console.error('\n❌ Fatal error:', err.message);
    console.error(err.stack);
    process.exit(1);
  });

#!/usr/bin/env node
/**
 * Check all existing RLS policies on the three problematic tables
 */

import { createDatabaseClient } from './lib/supabase-connection.js';

async function checkPolicies() {
  const client = await createDatabaseClient('engineer', { verify: true, verbose: true });

  const tables = ['system_health', 'prd_research_audit_log', 'tech_stack_references'];

  for (const table of tables) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📋 Policies for table: ${table}`);
    console.log(`${'='.repeat(60)}\n`);

    // Check if RLS is enabled
    const rlsCheck = await client.query(`
      SELECT relname, relrowsecurity, relforcerowsecurity
      FROM pg_class
      WHERE relname = $1
    `, [table]);

    if (rlsCheck.rows.length > 0) {
      const rls = rlsCheck.rows[0];
      console.log(`RLS Enabled: ${rls.relrowsecurity ? '✅ YES' : '❌ NO'}`);
      console.log(`Force RLS: ${rls.relforcerowsecurity ? '✅ YES' : '❌ NO'}\n`);
    }

    // Get all policies
    const policies = await client.query(`
      SELECT
        schemaname,
        tablename,
        policyname,
        permissive,
        roles,
        cmd,
        qual,
        with_check
      FROM pg_policies
      WHERE tablename = $1
      ORDER BY policyname
    `, [table]);

    if (policies.rows.length === 0) {
      console.log('⚠️  No policies found\n');
    } else {
      policies.rows.forEach((policy, idx) => {
        console.log(`Policy ${idx + 1}: ${policy.policyname}`);
        console.log(`   Command: ${policy.cmd}`);
        console.log(`   Roles: ${policy.roles}`);
        console.log(`   Permissive: ${policy.permissive}`);
        console.log(`   USING: ${policy.qual || '(none)'}`);
        console.log(`   WITH CHECK: ${policy.with_check || '(none)'}`);
        console.log('');
      });
    }
  }

  await client.end();
}

checkPolicies().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});

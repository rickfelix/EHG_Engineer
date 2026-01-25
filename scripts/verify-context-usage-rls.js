#!/usr/bin/env node
/**
 * Verify RLS on Context Usage Tables
 * Purpose: Detailed verification of RLS policies on context_usage tables
 */

import { createDatabaseClient } from './lib/supabase-connection.js';

async function verifyRLS() {
  console.log('\n🔍 Verifying RLS on Context Usage Tables...\n');

  let client;
  try {
    // Connect to database
    client = await createDatabaseClient('engineer', {
      verify: true,
      verbose: false
    });

    // Query RLS status and policies
    const query = `
      SELECT
        c.relname AS table_name,
        c.relrowsecurity AS rls_enabled,
        (
          SELECT json_agg(json_build_object(
            'policy_name', policyname,
            'command', cmd,
            'roles', roles,
            'qual', qual,
            'with_check', with_check
          ))
          FROM pg_policies p
          WHERE p.tablename = c.relname
            AND p.schemaname = 'public'
        ) AS policies
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname IN ('context_usage_log', 'context_usage_daily')
      ORDER BY c.relname;
    `;

    const { rows } = await client.query(query);

    if (rows.length === 0) {
      console.error('❌ No context_usage tables found!\n');
      return false;
    }

    let allPassed = true;

    rows.forEach(row => {
      console.log(`📋 Table: ${row.table_name}`);
      console.log(`   RLS Enabled: ${row.rls_enabled ? '✅ Yes' : '❌ No'}`);

      if (!row.rls_enabled) {
        allPassed = false;
      }

      if (row.policies && row.policies.length > 0) {
        console.log(`   Policies: ${row.policies.length}`);
        row.policies.forEach(policy => {
          console.log(`     - ${policy.policy_name}`);
          console.log(`       Command: ${policy.command}`);
          console.log(`       Roles: ${policy.roles}`);
        });
      } else {
        console.log('   ❌ No policies defined!');
        allPassed = false;
      }
      console.log('');
    });

    if (allPassed) {
      console.log('✅ VERIFICATION PASSED: All context_usage tables have RLS enabled with policies\n');
      return true;
    } else {
      console.error('❌ VERIFICATION FAILED: Some tables missing RLS or policies\n');
      return false;
    }

  } catch (_error) {
    console.error('\n❌ Verification failed:', error.message);
    console.error('Stack:', error.stack);
    return false;
  } finally {
    if (client) {
      await client.end();
    }
  }
}

// Run verification
verifyRLS()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });

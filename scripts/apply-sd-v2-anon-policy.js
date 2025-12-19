#!/usr/bin/env node

/**
 * Apply RLS policy migration for strategic_directives_v2
 * Migration: 20251218_fix_strategic_directives_v2_anon_policy.sql
 */

import { readFileSync } from 'fs';
import { createDatabaseClient, executeSQLFile } from '../lib/supabase-connection.js';

async function main() {
  console.log('🔧 Applying strategic_directives_v2 anon policy migration...\n');

  const client = await createDatabaseClient('engineer');

  try {
    // Read migration file
    const migrationPath = '/mnt/c/_EHG/EHG_Engineer/database/migrations/20251218_fix_strategic_directives_v2_anon_policy.sql';
    const sqlContent = readFileSync(migrationPath, 'utf8');

    console.log('📄 Migration file loaded');
    console.log('📊 Executing migration statements...\n');

    // Execute migration
    const result = await executeSQLFile(client, sqlContent, { transaction: true });

    if (result.success) {
      console.log('✅ Migration applied successfully');
      console.log(`   Statements executed: ${result.totalStatements}\n`);

      // Display results
      result.results.forEach((r, idx) => {
        if (r.success) {
          console.log(`   ${idx + 1}. ✅ ${r.statement}`);
        } else {
          console.log(`   ${idx + 1}. ❌ ${r.statement}`);
          console.log(`      Error: ${r.error}`);
        }
      });
    } else {
      console.error('❌ Migration failed:', result.error);
      process.exit(1);
    }

    // Verify policies
    console.log('\n🔍 Verifying RLS policies...\n');
    const verifyResult = await client.query(`
      SELECT policyname, roles, cmd
      FROM pg_policies
      WHERE tablename = 'strategic_directives_v2'
      ORDER BY policyname
    `);

    if (verifyResult.rows.length === 0) {
      console.warn('⚠️  No policies found for strategic_directives_v2');
    } else {
      console.log('📋 Current RLS policies for strategic_directives_v2:');
      verifyResult.rows.forEach(row => {
        console.log(`   - ${row.policyname}`);
        console.log(`     Role: ${row.roles}`);
        console.log(`     Command: ${row.cmd}\n`);
      });
    }

  } catch (error) {
    console.error('💥 Error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();

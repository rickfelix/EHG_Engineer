#!/usr/bin/env node
/**
 * Apply RLS Hotfix Migration
 * Purpose: Enable RLS on context_usage tables
 * Migration: database/migrations/20251227_context_usage_rls_hotfix.sql
 */

import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createDatabaseClient, splitPostgreSQLStatements } from './lib/supabase-connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function applyMigration() {
  console.log('\n🔧 Applying RLS Hotfix Migration...\n');

  let client;
  try {
    // Read migration file
    const migrationPath = join(__dirname, '..', 'database', 'migrations', '20251227_context_usage_rls_hotfix.sql');
    console.log(`📄 Reading migration: ${migrationPath}`);
    const sql = await readFile(migrationPath, 'utf-8');

    // Connect to database
    console.log('🔌 Connecting to database...');
    client = await createDatabaseClient('engineer', {
      verify: true,
      verbose: false
    });
    console.log('✅ Connected to database\n');

    // Split SQL into statements
    const statements = splitPostgreSQLStatements(sql);
    console.log(`📝 Found ${statements.length} SQL statements\n`);

    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      const preview = stmt.substring(0, 60).replace(/\n/g, ' ');
      console.log(`[${i + 1}/${statements.length}] Executing: ${preview}...`);

      try {
        const result = await client.query(stmt);

        // Check for NOTICE messages
        if (result.rows && result.rows.length > 0) {
          console.log(`    Result: ${JSON.stringify(result.rows)}`);
        }
        console.log('    ✅ Success');
      } catch (error) {
        console.error(`    ❌ Error: ${error.message}`);
        throw error;
      }
    }

    console.log('\n🎉 Migration applied successfully!\n');

    // Verify RLS is enabled
    console.log('🔍 Verifying RLS status...\n');
    const verifyQuery = `
      SELECT
        c.relname AS table_name,
        c.relrowsecurity AS rls_enabled,
        (
          SELECT COUNT(*)
          FROM pg_policies p
          WHERE p.tablename = c.relname
            AND p.schemaname = 'public'
        ) AS policy_count
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname IN ('context_usage_log', 'context_usage_daily')
      ORDER BY c.relname;
    `;

    const { rows } = await client.query(verifyQuery);

    let allGood = true;
    rows.forEach(row => {
      const status = row.rls_enabled ? '✅' : '❌';
      console.log(`${status} ${row.table_name}:`);
      console.log(`    RLS Enabled: ${row.rls_enabled}`);
      console.log(`    Policies: ${row.policy_count}`);

      if (!row.rls_enabled || row.policy_count === 0) {
        allGood = false;
      }
    });

    console.log('');
    if (allGood) {
      console.log('✅ VERIFICATION PASSED: RLS enabled on all context_usage tables\n');
      return true;
    } else {
      console.error('❌ VERIFICATION FAILED: Some tables missing RLS or policies\n');
      return false;
    }

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error('\nStack trace:', error.stack);
    return false;
  } finally {
    if (client) {
      await client.end();
      console.log('🔌 Database connection closed\n');
    }
  }
}

// Run migration
applyMigration()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });

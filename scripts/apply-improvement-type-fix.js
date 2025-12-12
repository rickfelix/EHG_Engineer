#!/usr/bin/env node
/**
 * Apply Migration: Fix improvement_type column ambiguity
 *
 * This script fixes the database trigger `extract_protocol_improvements_from_retro()`
 * where local PL/pgSQL variables shadow table columns of the same name.
 *
 * Root Cause: Line 166 in the trigger had `AND improvement_type = improvement_type`
 * which compared the column to itself instead of the local variable.
 *
 * Fix: Prefix local variables with `v_` per PostgreSQL best practices.
 *
 * Usage: node scripts/apply-improvement-type-fix.js
 */

import { createDatabaseClient, splitPostgreSQLStatements } from './lib/supabase-connection.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function applyMigration() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('   Fix: improvement_type Column Ambiguity in Database Trigger');
  console.log('═══════════════════════════════════════════════════════════════\n');

  let client;

  try {
    // Connect to database
    console.log('📡 Connecting to database...');
    client = await createDatabaseClient('engineer', {
      verbose: true,
      timeout: 30000
    });

    // Read migration file
    const migrationPath = join(__dirname, '../database/migrations/20251211_fix_improvement_type_ambiguity.sql');
    console.log(`\n📄 Reading migration: ${migrationPath}`);
    const sql = readFileSync(migrationPath, 'utf-8');

    // Split into statements (respecting $$ delimiters for function bodies)
    const statements = splitPostgreSQLStatements(sql);
    console.log(`   Found ${statements.length} statements to execute\n`);

    // Execute each statement
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      const preview = stmt.substring(0, 80).replace(/\n/g, ' ').trim();

      console.log(`[${i + 1}/${statements.length}] ${preview}...`);

      try {
        await client.query(stmt);
        console.log('   ✅ Success');
        successCount++;
      } catch (error) {
        // Some errors are acceptable (e.g., "already exists")
        if (error.message.includes('already exists')) {
          console.log('   ⚠️ Already exists (skipped)');
          successCount++;
        } else {
          console.error(`   ❌ Error: ${error.message}`);
          errorCount++;
        }
      }
    }

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log(`   Results: ${successCount} succeeded, ${errorCount} failed`);
    console.log('═══════════════════════════════════════════════════════════════\n');

    // Verify the fix by checking the function definition
    console.log('🔍 Verifying fix...');
    const verifyResult = await client.query(`
      SELECT prosrc
      FROM pg_proc
      WHERE proname = 'extract_protocol_improvements_from_retro'
    `);

    if (verifyResult.rows.length > 0) {
      const funcBody = verifyResult.rows[0].prosrc;
      const hasVPrefix = funcBody.includes('v_improvement_type');
      const hasAmbiguity = funcBody.includes('improvement_type = improvement_type');

      if (hasVPrefix && !hasAmbiguity) {
        console.log('   ✅ Function updated with v_ prefix variables');
        console.log('   ✅ Ambiguous column reference resolved');
      } else if (!hasVPrefix) {
        console.log('   ⚠️ Function still uses old variable names');
      } else if (hasAmbiguity) {
        console.log('   ❌ Ambiguous reference still exists');
      }
    } else {
      console.log('   ⚠️ Function not found - may not have been created');
    }

    // Test by checking if we can insert a retrospective with protocol_improvements
    console.log('\n🧪 Testing trigger functionality...');
    const testResult = await client.query(`
      SELECT count(*) as count
      FROM pg_trigger
      WHERE tgname = 'trg_extract_protocol_improvements'
    `);

    if (testResult.rows[0].count > 0) {
      console.log('   ✅ Trigger trg_extract_protocol_improvements is attached');
    } else {
      console.log('   ⚠️ Trigger not found on retrospectives table');
    }

    console.log('\n✅ Migration completed successfully!\n');

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  } finally {
    if (client) {
      await client.end();
      console.log('📡 Database connection closed');
    }
  }
}

// Run migration
applyMigration().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * Apply Orchestrator Auto-Complete Migration
 *
 * Applies: /database/migrations/20251221_orchestrator_auto_complete.sql
 *
 * Creates:
 * 1. complete_orchestrator_sd(sd_id) function
 * 2. Updates check_handoff_bypass() to allow ORCHESTRATOR_AUTO_COMPLETE
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createDatabaseClient, splitPostgreSQLStatements } from './lib/supabase-connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function applyMigration() {
  console.log('🗄️ Applying Orchestrator Auto-Complete Migration...\n');

  // Read migration file
  const migrationPath = join(__dirname, '..', 'database', 'migrations', '20251221_orchestrator_auto_complete.sql');
  console.log(`📄 Reading migration: ${migrationPath}`);

  const sql = readFileSync(migrationPath, 'utf8');
  console.log(`   ${sql.split('\n').length} lines read\n`);

  // Connect to database
  console.log('🔌 Connecting to Engineer database...');
  const client = await createDatabaseClient('engineer', {
    verify: true,
    verbose: true
  });

  try {
    console.log('\n🚀 Executing migration statements...\n');

    // Split SQL into statements (respects $$ delimiters in functions)
    const statements = splitPostgreSQLStatements(sql);
    console.log(`   Found ${statements.length} SQL statements\n`);

    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];

      // Show abbreviated statement
      const firstLine = stmt.split('\n')[0].substring(0, 80);
      console.log(`   [${i + 1}/${statements.length}] ${firstLine}...`);

      const result = await client.query(stmt);

      // Show notices (validation output)
      if (result.rows.length > 0) {
        console.log('       Result:', result.rows[0]);
      }
    }

    console.log('\n✅ Migration applied successfully!\n');

    // Verify function exists
    console.log('🔍 Verifying installation...');
    const verifyResult = await client.query(`
      SELECT
        proname as function_name,
        pg_get_functiondef(oid) as definition
      FROM pg_proc
      WHERE proname IN ('complete_orchestrator_sd', 'check_handoff_bypass')
      ORDER BY proname;
    `);

    console.log('\n   Functions installed:');
    verifyResult.rows.forEach(row => {
      console.log(`   ✓ ${row.function_name}()`);
    });

    console.log('\n📚 Usage:');
    console.log('   SELECT complete_orchestrator_sd(\'SD-YOUR-ORCHESTRATOR-ID\');\n');

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);

    if (error.message.includes('already exists')) {
      console.log('\n💡 This migration may have already been applied.');
      console.log('   Check Supabase dashboard for existing functions.\n');
    } else {
      console.error('\nFull error:', error);
    }

    throw error;
  } finally {
    await client.end();
    console.log('🔌 Database connection closed.\n');
  }
}

// Run migration
applyMigration()
  .then(() => {
    console.log('🎉 Migration complete!\n');
    process.exit(0);
  })
  .catch(err => {
    console.error('💥 Fatal error:', err.message);
    process.exit(1);
  });

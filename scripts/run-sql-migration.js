#!/usr/bin/env node
/**
 * Execute SQL Migration Script
 * Usage: node scripts/run-sql-migration.js <migration-file>
 */

import { readFileSync } from 'fs';
import { createDatabaseClient, splitPostgreSQLStatements } from './lib/supabase-connection.js';

const migrationFile = process.argv[2];

if (!migrationFile) {
  console.error('❌ Error: Migration file path required');
  console.error('Usage: node scripts/run-sql-migration.js <migration-file>');
  process.exit(1);
}

async function executeMigration() {
  console.log(`\n🚀 Executing migration: ${migrationFile}\n`);

  let client;
  try {
    // Read migration file
    const migrationSQL = readFileSync(migrationFile, 'utf-8');
    console.log(`📄 Migration file loaded (${migrationSQL.length} characters)\n`);

    // Create database client for EHG_Engineer
    console.log('🔌 Connecting to database...');
    client = await createDatabaseClient('engineer', {
      verify: true,
      verbose: true
    });

    // Split SQL statements
    const statements = splitPostgreSQLStatements(migrationSQL);
    console.log(`\n📊 Found ${statements.length} SQL statements\n`);

    // Execute each statement
    let successCount = 0;
    let skipCount = 0;
    const errors = [];

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      const preview = statement.substring(0, 80).replace(/\n/g, ' ') + '...';

      try {
        console.log(`[${i + 1}/${statements.length}] Executing: ${preview}`);
        const result = await client.query(statement);

        if (result.command === 'CREATE' || result.command === 'ALTER' || result.command === 'INSERT') {
          console.log(`   ✅ Success: ${result.command}`);
          successCount++;
        } else if (result.command === 'COMMENT' || result.command === 'GRANT') {
          console.log(`   ℹ️  ${result.command} applied`);
          successCount++;
        } else {
          console.log(`   ✅ Executed (${result.rowCount || 0} rows affected)`);
          successCount++;
        }
      } catch (error) {
        // Check if error is due to "already exists" - this is OK for IF NOT EXISTS
        if (error.message.includes('already exists') ||
            error.message.includes('already enabled') ||
            error.message.includes('duplicate key value violates unique constraint')) {
          console.log(`   ⚠️  Skipped: ${error.message.split('\n')[0]}`);
          skipCount++;
        } else {
          console.error(`   ❌ Error: ${error.message.split('\n')[0]}`);
          errors.push({
            statement: preview,
            error: error.message
          });
        }
      }
    }

    // Summary
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Migration Summary');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`✅ Successful: ${successCount}`);
    console.log(`⚠️  Skipped (already exists): ${skipCount}`);
    console.log(`❌ Errors: ${errors.length}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    if (errors.length > 0) {
      console.error('❌ Migration completed with errors:\n');
      errors.forEach((err, idx) => {
        console.error(`Error ${idx + 1}:`);
        console.error(`  Statement: ${err.statement}`);
        console.error(`  Error: ${err.error}\n`);
      });
      process.exit(1);
    } else {
      console.log('✅ Migration completed successfully!\n');
      // QF-20260527-008: removed the leaked-template post-verify block that
      // queried hardcoded objects from an unrelated historical migration
      // (tech_stack_references, prd_research_audit_log, system_health,
      // user_stories.implementation_context, product_requirements_v2.research_confidence_score,
      // cleanup_expired_tech_stack_references). It reported false-positive
      // "verified" output for every migration. Per-migration invariants now
      // live inside the SQL itself via DO blocks with RAISE EXCEPTION — see
      // database/migrations/20260527_cleanup_non_venture_l2_violators.sql
      // and database/migrations/20260527_validate_active_rich_check.sql for
      // the canonical pattern.
    }

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error('\n🔧 Error details:');
    console.error(error);
    process.exit(1);
  } finally {
    if (client) {
      await client.end();
      console.log('🔌 Database connection closed\n');
    }
  }
}

executeMigration();

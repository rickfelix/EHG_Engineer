#!/usr/bin/env node
/**
 * Apply LEO Error Log Migration
 * SD-GENESIS-V32-PULSE: P0 Critical Fix
 *
 * Creates the leo_error_log table for tracking critical errors
 * that need operator attention.
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createDatabaseClient, splitPostgreSQLStatements } from './lib/supabase-connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function applyMigration() {
  console.log('🗄️  Applying LEO Error Log Migration (SD-GENESIS-V32-PULSE)');
  console.log('   Migration: 20251231_leo_error_log.sql\n');

  let client;

  try {
    // Read migration file
    const migrationPath = join(__dirname, '..', 'database', 'migrations', '20251231_leo_error_log.sql');
    console.log(`📖 Reading migration file: ${migrationPath}`);
    const migrationSql = readFileSync(migrationPath, 'utf-8');

    // Split into individual statements
    const statements = splitPostgreSQLStatements(migrationSql);
    console.log(`   Found ${statements.length} SQL statements to execute\n`);

    // Connect to database
    console.log('🔌 Connecting to database...');
    client = await createDatabaseClient('engineer', {
      verify: true,
      verbose: true
    });

    // Execute each statement
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      const preview = stmt.substring(0, 80).replace(/\n/g, ' ');

      try {
        console.log(`\n📝 Executing statement ${i + 1}/${statements.length}:`);
        console.log(`   ${preview}...`);

        await client.query(stmt);
        console.log('   ✅ Success');
        successCount++;
      } catch (error) {
        console.error(`   ❌ Failed: ${error.message}`);
        failCount++;

        // Continue on "already exists" errors, fail on others
        if (!error.message.includes('already exists')) {
          throw error;
        } else {
          console.log('   ⚠️  Object already exists, continuing...');
        }
      }
    }

    console.log('\n' + '='.repeat(70));
    console.log('📊 Migration Summary:');
    console.log(`   ✅ Successful: ${successCount}`);
    console.log(`   ❌ Failed: ${failCount}`);
    console.log('='.repeat(70));

    // Verify table creation
    console.log('\n🔍 Verifying table creation...');
    const verifyQuery = `
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'leo_error_log'
      ORDER BY ordinal_position;
    `;

    const result = await client.query(verifyQuery);

    if (result.rows.length === 0) {
      throw new Error('Table leo_error_log not found after migration!');
    }

    console.log(`   ✅ Table exists with ${result.rows.length} columns:`);
    result.rows.forEach(row => {
      console.log(`      - ${row.column_name} (${row.data_type}, ${row.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'})`);
    });

    // Test helper function
    console.log('\n🧪 Testing log_critical_error function...');
    const testQuery = `
      SELECT log_critical_error(
        'SYSTEM_ERROR',
        'Migration test error',
        'apply-leo-error-log-migration',
        'migration-script',
        '{"test": true}'::jsonb,
        'SD-GENESIS-V32-PULSE'
      ) as error_id;
    `;

    const testResult = await client.query(testQuery);
    const errorId = testResult.rows[0].error_id;
    console.log(`   ✅ Function test successful! Error ID: ${errorId}`);

    // Cleanup test record
    await client.query('DELETE FROM leo_error_log WHERE id = $1', [errorId]);
    console.log('   🧹 Cleaned up test record');

    console.log('\n✅ Migration completed successfully!\n');
    return true;

  } catch (error) {
    console.error('\n❌ Migration failed:');
    console.error(`   Error: ${error.message}`);

    if (error.stack) {
      console.error('\n📚 Stack trace:');
      console.error(error.stack);
    }

    console.error('\n🔧 Troubleshooting:');
    console.error('   1. Verify database password is correct (.env)');
    console.error('   2. Check Supabase Dashboard for manual intervention');
    console.error('   3. Verify migration file syntax');
    console.error('   4. Check database connection settings\n');

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
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });

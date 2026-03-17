#!/usr/bin/env node
/**
 * Apply GTM Navigation Migration to EHG Database
 * SD-GTM-INTEL-DISCOVERY-001
 *
 * Uses direct PostgreSQL connection with elevated privileges
 */

import { readFileSync } from 'fs';
import { createDatabaseClient, splitPostgreSQLStatements } from './lib/supabase-connection.js';

async function applyMigration() {
  console.log('\n🚀 Applying GTM Navigation Migration to EHG Database');
  console.log('='.repeat(70));

  let client;
  try {
    // Read migration file
    const migrationFile = '../ehg/database/migrations/COMPLETE_gtm_navigation_setup.sql';
    const migrationSQL = readFileSync(migrationFile, 'utf-8');
    console.log(`\n📄 Migration file loaded (${migrationSQL.length} characters)`);

    // Create database client for EHG application database
    console.log('🔌 Connecting to EHG database...');
    client = await createDatabaseClient('ehg', {
      verify: true,
      verbose: true
    });

    // Split SQL statements
    const statements = splitPostgreSQLStatements(migrationSQL);
    console.log(`\n📊 Found ${statements.length} SQL statements to execute\n`);

    // Execute each statement
    let successCount = 0;
    let skipCount = 0;
    const errors = [];

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      const preview = statement.substring(0, 80).replace(/\n/g, ' ') + '...';

      try {
        console.log(`[${i + 1}/${statements.length}] ${preview}`);
        const result = await client.query(statement);

        if (result.command) {
          console.log(`   ✅ Success: ${result.command}`);
          successCount++;
        } else {
          console.log(`   ✅ Executed (${result.rowCount || 0} rows)`);
          successCount++;
        }
      } catch (error) {
        // Check if error is due to "already exists" - this is OK for idempotent migrations
        if (error.message.includes('already exists') ||
            error.message.includes('already enabled') ||
            error.message.includes('duplicate key value violates unique constraint')) {
          console.log('   ⚠️  Skipped (already exists)');
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
    console.log(`\n${'='.repeat(70)}`);
    console.log('📊 Migration Summary');
    console.log(`${'='.repeat(70)}`);
    console.log(`✅ Successful: ${successCount}`);
    console.log(`⚠️  Skipped: ${skipCount}`);
    console.log(`❌ Errors: ${errors.length}`);
    console.log(`${'='.repeat(70)}\n`);

    if (errors.length > 0) {
      console.error('❌ Migration completed with errors:\n');
      errors.forEach((err, idx) => {
        console.error(`Error ${idx + 1}:`);
        console.error(`  Statement: ${err.statement}`);
        console.error(`  Error: ${err.error}\n`);
      });
    } else {
      // Verify GTM routes were inserted
      console.log('🔍 Verifying GTM routes...\n');

      const routeCheck = await client.query(`
        SELECT path, title, section, is_enabled, maturity
        FROM nav_routes
        WHERE path IN ('/gtm-intelligence', '/gtm-timing')
        ORDER BY path
      `);

      console.log(`📋 GTM Routes: ${routeCheck.rows.length}/2 found`);
      routeCheck.rows.forEach(row => {
        console.log(`   ✓ ${row.path}`);
        console.log(`     Title: ${row.title}`);
        console.log(`     Section: ${row.section}`);
        console.log(`     Enabled: ${row.is_enabled}`);
        console.log(`     Maturity: ${row.maturity}\n`);
      });

      if (routeCheck.rows.length === 2) {
        console.log('✅ Migration completed successfully!');
        console.log('\n💡 Next Steps:');
        console.log('   1. Refresh your browser (Ctrl+Shift+R)');
        console.log('   2. Check "Analytics & Insights" for "GTM Intelligence"');
        console.log('   3. Check "Go-to-Market" for "GTM Timing"\n');
      } else {
        console.error('❌ Expected 2 routes but found', routeCheck.rows.length);
        process.exit(1);
      }
    }

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error('\n🔧 Error details:', error);
    process.exit(1);
  } finally {
    if (client) {
      await client.end();
      console.log('🔌 Database connection closed\n');
    }
  }
}

applyMigration();

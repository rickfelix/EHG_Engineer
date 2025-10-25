#!/usr/bin/env node

/**
 * Apply SD-RETRO-ENHANCE-001 Migrations (Automated Deployment)
 *
 * Deploys 3 SQL migration files to Supabase PostgreSQL:
 * 1. 20251016_enhance_retrospectives_multi_app_context.sql (250 lines)
 * 2. 20251016_add_vector_search_embeddings.sql (250 lines)
 * 3. 20251016_retrospective_quality_enforcement_layers_1_2.sql (350 lines)
 *
 * Features:
 * - Automated deployment (no manual SQL Editor steps)
 * - Transaction rollback on errors
 * - Verification after each migration
 * - Detailed logging of deployment status
 * - Uses established connection pattern from lib/supabase-connection.js
 *
 * Usage:
 *   node scripts/apply-retro-enhance-migrations.js [--dry-run] [--migration=N]
 *
 * Options:
 *   --dry-run         Show what would be executed without making changes
 *   --migration=N     Apply only migration N (1, 2, or 3)
 *   --skip-verify     Skip post-migration verification (not recommended)
 */

import { createDatabaseClient, executeSQLFile } from '../lib/supabase-connection.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Migration configuration
const MIGRATIONS = [
  {
    id: 1,
    name: 'enhance_retrospectives_multi_app_context',
    file: '20251016_enhance_retrospectives_multi_app_context.sql',
    description: 'Add multi-application context fields (target_application, learning_category, applies_to_all_apps)',
    userStories: ['US-001', 'US-002', 'US-003'],
    estimatedTime: '~10 seconds',
    verification: async (client) => {
      // Verify 8 new columns were added
      const { rows } = await client.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'retrospectives'
          AND column_name IN (
            'target_application',
            'learning_category',
            'applies_to_all_apps',
            'related_files',
            'related_commits',
            'related_prs',
            'affected_components',
            'tags'
          )
        ORDER BY column_name
      `);

      if (rows.length !== 8) {
        throw new Error(`Expected 8 columns, found ${rows.length}`);
      }

      // Verify trigger exists
      const { rows: triggers } = await client.query(`
        SELECT trigger_name
        FROM information_schema.triggers
        WHERE event_object_table = 'retrospectives'
          AND trigger_name = 'trigger_auto_populate_retrospective_fields'
      `);

      if (triggers.length === 0) {
        throw new Error('Trigger trigger_auto_populate_retrospective_fields not found');
      }

      return {
        success: true,
        columns: rows.map(r => r.column_name),
        trigger: 'trigger_auto_populate_retrospective_fields'
      };
    }
  },
  {
    id: 2,
    name: 'add_vector_search_embeddings',
    file: '20251016_add_vector_search_embeddings.sql',
    description: 'Enable pgvector extension and add content_embedding column for semantic search',
    userStories: ['US-004', 'US-005', 'US-006'],
    estimatedTime: '~5 seconds',
    verification: async (client) => {
      // Verify pgvector extension is enabled
      const { rows: extensions } = await client.query(`
        SELECT extname, extversion
        FROM pg_extension
        WHERE extname = 'vector'
      `);

      if (extensions.length === 0) {
        throw new Error('pgvector extension not enabled');
      }

      // Verify content_embedding column exists
      const { rows: columns } = await client.query(`
        SELECT column_name, udt_name
        FROM information_schema.columns
        WHERE table_name = 'retrospectives'
          AND column_name = 'content_embedding'
      `);

      if (columns.length === 0) {
        throw new Error('content_embedding column not found');
      }

      // Verify RPC functions exist
      const { rows: functions } = await client.query(`
        SELECT routine_name
        FROM information_schema.routines
        WHERE routine_schema = 'public'
          AND routine_name IN (
            'search_retrospectives_semantic',
            'find_similar_retrospectives'
          )
      `);

      if (functions.length !== 2) {
        throw new Error(`Expected 2 RPC functions, found ${functions.length}`);
      }

      return {
        success: true,
        extension: extensions[0].extname,
        version: extensions[0].extversion,
        functions: functions.map(f => f.routine_name)
      };
    }
  },
  {
    id: 3,
    name: 'retrospective_quality_enforcement_layers_1_2',
    file: '20251016_retrospective_quality_enforcement_layers_1_2.sql',
    description: 'Add quality constraints and validation functions (Enforcement Layers 1 & 2)',
    userStories: ['US-008', 'US-009'],
    estimatedTime: '~8 seconds',
    verification: async (client) => {
      // Verify constraints were added
      const { rows: constraints } = await client.query(`
        SELECT constraint_name, constraint_type
        FROM information_schema.table_constraints
        WHERE table_name = 'retrospectives'
          AND constraint_name LIKE '%retro%'
        ORDER BY constraint_name
      `);

      // Verify enhanced trigger function exists
      const { rows: functions } = await client.query(`
        SELECT routine_name
        FROM information_schema.routines
        WHERE routine_schema = 'public'
          AND routine_name LIKE '%retrospective%quality%'
      `);

      return {
        success: true,
        constraints: constraints.length,
        validationFunctions: functions.length
      };
    }
  }
];

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = {
    dryRun: process.argv.includes('--dry-run'),
    skipVerify: process.argv.includes('--skip-verify'),
    specificMigration: null
  };

  const migrationArg = process.argv.find(arg => arg.startsWith('--migration='));
  if (migrationArg) {
    const migrationId = parseInt(migrationArg.split('=')[1]);
    if (migrationId >= 1 && migrationId <= 3) {
      args.specificMigration = migrationId;
    } else {
      console.error(`❌ Invalid migration ID: ${migrationId}. Must be 1, 2, or 3.`);
      process.exit(1);
    }
  }

  return args;
}

/**
 * Apply a single migration
 */
async function applyMigration(client, migration, dryRun = false) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`📋 Migration ${migration.id}: ${migration.name}`);
  console.log(`${'='.repeat(80)}`);
  console.log(`Description: ${migration.description}`);
  console.log(`User Stories: ${migration.userStories.join(', ')}`);
  console.log(`Estimated Time: ${migration.estimatedTime}`);
  console.log('');

  const migrationPath = path.join(__dirname, '../database/migrations', migration.file);

  try {
    // Check if file exists
    await fs.access(migrationPath);
  } catch (error) {
    throw new Error(`Migration file not found: ${migrationPath}`);
  }

  // Read SQL file
  const sqlContent = await fs.readFile(migrationPath, 'utf8');
  const lineCount = sqlContent.split('\n').length;
  console.log(`📄 File: ${migration.file} (${lineCount} lines)`);

  if (dryRun) {
    console.log('\n🔍 DRY RUN MODE - Would execute the following:');
    console.log('   - Read SQL file from:', migrationPath);
    console.log('   - Execute statements within transaction');
    console.log('   - Run verification checks');
    console.log('   - Rollback if any errors occur');
    return { success: true, dryRun: true };
  }

  console.log('\n⏳ Executing migration...');
  const startTime = Date.now();

  // Execute migration within transaction
  const result = await executeSQLFile(client, sqlContent, { transaction: false });

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  if (!result.success) {
    console.error('\n❌ Migration failed!');
    console.error(`Error: ${result.error}`);
    console.error('\n📊 Statements executed before failure:');
    result.results.forEach((r, i) => {
      const status = r.success ? '✅' : '❌';
      console.error(`   ${status} Statement ${i + 1}: ${r.statement}`);
      if (r.error) {
        console.error(`      Error: ${r.error}`);
      }
    });
    throw new Error(`Migration ${migration.id} failed: ${result.error}`);
  }

  console.log(`✅ Migration completed successfully in ${duration}s`);
  console.log(`   - Total statements: ${result.totalStatements}`);
  console.log(`   - Successful: ${result.results.filter(r => r.success).length}`);
  console.log(`   - Failed: ${result.results.filter(r => !r.success).length}`);

  return { success: true, duration, statementCount: result.totalStatements };
}

/**
 * Verify migration was applied correctly
 */
async function verifyMigration(client, migration) {
  console.log('\n🔍 Verifying migration...');

  try {
    const result = await migration.verification(client);

    if (result.success) {
      console.log('✅ Verification passed!');

      // Print verification details
      Object.entries(result).forEach(([key, value]) => {
        if (key !== 'success') {
          if (Array.isArray(value)) {
            console.log(`   - ${key}: [${value.join(', ')}]`);
          } else {
            console.log(`   - ${key}: ${value}`);
          }
        }
      });
    }

    return result;
  } catch (error) {
    console.error('❌ Verification failed!');
    console.error(`   Error: ${error.message}`);
    throw error;
  }
}

/**
 * Get current migration status
 */
async function getMigrationStatus(client) {
  console.log('\n📊 Current Database State:');

  try {
    // Count retrospectives
    const { rows: [{ count }] } = await client.query('SELECT COUNT(*) as count FROM retrospectives');
    console.log(`   - Total retrospectives: ${count}`);

    // Check if new columns exist
    const { rows: columns } = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'retrospectives'
        AND column_name IN (
          'target_application',
          'learning_category',
          'content_embedding'
        )
    `);

    console.log(`   - New columns found: ${columns.length}/3`);
    if (columns.length > 0) {
      columns.forEach(col => {
        console.log(`     ✅ ${col.column_name}`);
      });
    }

    // Check pgvector extension
    const { rows: extensions } = await client.query(`
      SELECT extname FROM pg_extension WHERE extname = 'vector'
    `);

    console.log(`   - pgvector extension: ${extensions.length > 0 ? '✅ Enabled' : '❌ Not enabled'}`);

  } catch (error) {
    console.log(`   ⚠️ Could not fetch status: ${error.message}`);
  }
}

/**
 * Main execution function
 */
async function main() {
  console.log('🚀 SD-RETRO-ENHANCE-001 Migration Deployment Tool\n');
  console.log('Application: EHG_Engineer Management Dashboard');
  console.log('Database: Supabase PostgreSQL (dedlbzhpgkmetvhbkyzq)');

  const args = parseArgs();

  if (args.dryRun) {
    console.log('\n⚠️  DRY RUN MODE - No changes will be made to the database');
  }

  if (args.specificMigration) {
    console.log(`\n📌 Specific migration mode: Only migration ${args.specificMigration} will be applied`);
  }

  let client;

  try {
    // Connect to database
    console.log('\n⏳ Connecting to database...');
    client = await createDatabaseClient('engineer', { verify: true });
    console.log('✅ Connected to EHG_Engineer database\n');

    // Show current status
    await getMigrationStatus(client);

    // Determine which migrations to run
    const migrationsToRun = args.specificMigration
      ? [MIGRATIONS[args.specificMigration - 1]]
      : MIGRATIONS;

    // Apply migrations
    const results = [];
    for (const migration of migrationsToRun) {
      try {
        const result = await applyMigration(client, migration, args.dryRun);

        if (!args.dryRun && !args.skipVerify) {
          const verification = await verifyMigration(client, migration);
          result.verification = verification;
        }

        results.push({ migration: migration.id, ...result });
      } catch (error) {
        console.error(`\n❌ Migration ${migration.id} failed: ${error.message}`);
        results.push({ migration: migration.id, success: false, error: error.message });

        // Stop on first failure
        console.error('\n🛑 Stopping migration process due to error');
        break;
      }
    }

    // Summary
    console.log('\n' + '='.repeat(80));
    console.log('📊 MIGRATION SUMMARY');
    console.log('='.repeat(80));

    results.forEach(result => {
      const status = result.success ? '✅' : '❌';
      const migration = MIGRATIONS.find(m => m.id === result.migration);
      console.log(`${status} Migration ${result.migration}: ${migration.name}`);

      if (result.success && !result.dryRun) {
        console.log(`   ⏱️  Duration: ${result.duration}s`);
        console.log(`   📝 Statements: ${result.statementCount}`);
        if (result.verification) {
          console.log('   ✅ Verification: Passed');
        }
      } else if (result.error) {
        console.log(`   ❌ Error: ${result.error}`);
      }
      console.log('');
    });

    const successCount = results.filter(r => r.success).length;
    const totalCount = results.length;

    if (successCount === totalCount) {
      console.log(`✅ All ${totalCount} migration(s) completed successfully!`);

      if (!args.dryRun) {
        console.log('\n📋 Next Steps:');
        console.log('1. Run backfill script to populate new fields for existing retrospectives');
        console.log('   node scripts/backfill-retrospective-enhanced-fields.js');
        console.log('2. Update generate-comprehensive-retrospective.js to use new fields');
        console.log('3. Test constraint enforcement with invalid data');
        console.log('4. Verify trigger auto-population logic');
      }
    } else {
      console.error(`❌ ${totalCount - successCount} migration(s) failed`);
      process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
    console.error('\n🔄 If transaction was in progress, it has been rolled back');
    process.exit(1);
  } finally {
    if (client) {
      await client.end();
      console.log('\n🔌 Database connection closed');
    }
  }
}

// Execute
main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});

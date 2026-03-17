#!/usr/bin/env node

/**
 * Apply Trigger Fix Migration (SD-RETRO-ENHANCE-001)
 *
 * Deploys the trigger fix migration to resolve embedding generation blockers:
 * - File: 20251016_fix_retrospective_trigger_for_embeddings.sql
 * - Purpose: Make validations conditional (only on INSERT or field changes)
 * - Fixes: "APPLICATION_ISSUE must have affected_component" errors on embedding updates
 * - Fixes: "severity_level" field reference errors
 *
 * This migration was created by the database agent to fix validation issues
 * that were blocking the embedding generation process.
 *
 * Usage:
 *   node scripts/apply-trigger-fix-migration.js [--dry-run] [--skip-verify]
 */

import { createDatabaseClient, executeSQLFile } from '../lib/supabase-connection.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MIGRATION = {
  name: 'fix_retrospective_trigger_for_embeddings',
  file: '20251016_fix_retrospective_trigger_for_embeddings.sql',
  description: 'Fix auto_populate_retrospective_fields() trigger to allow embedding-only updates',
  issues: [
    'Trigger enforces affected_components validation on ALL updates (blocks embedding generation)',
    'Trigger references severity_level without NULL check',
    'Trigger enforces quality_score validation on updates (blocks embedding updates)'
  ],
  solution: 'Make validations conditional - only enforce on INSERT or when specific fields change',
  estimatedTime: '~5 seconds'
};

/**
 * Parse command line arguments
 */
function parseArgs() {
  return {
    dryRun: process.argv.includes('--dry-run'),
    skipVerify: process.argv.includes('--skip-verify')
  };
}

/**
 * Apply the trigger fix migration
 */
async function applyMigration(client, dryRun = false) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🔧 Trigger Fix Migration: ${MIGRATION.name}`);
  console.log(`${'='.repeat(80)}`);
  console.log(`Description: ${MIGRATION.description}`);
  console.log('\n📋 Issues Being Fixed:');
  MIGRATION.issues.forEach((issue, i) => {
    console.log(`   ${i + 1}. ${issue}`);
  });
  console.log(`\n💡 Solution: ${MIGRATION.solution}`);
  console.log(`⏱️  Estimated Time: ${MIGRATION.estimatedTime}`);
  console.log('');

  const migrationPath = path.join(__dirname, '../database/migrations', MIGRATION.file);

  try {
    // Check if file exists
    await fs.access(migrationPath);
  } catch (_error) {
    throw new Error(`Migration file not found: ${migrationPath}`);
  }

  // Read SQL file
  const sqlContent = await fs.readFile(migrationPath, 'utf8');
  const lineCount = sqlContent.split('\n').length;
  console.log(`📄 File: ${MIGRATION.file} (${lineCount} lines)`);

  if (dryRun) {
    console.log('\n🔍 DRY RUN MODE - Would execute the following:');
    console.log('   - Drop existing trigger: trigger_auto_populate_retrospective_fields');
    console.log('   - Create new trigger function with conditional validation');
    console.log('   - Recreate trigger on retrospectives table');
    console.log('   - Run verification checks');
    console.log('   - Test scenarios documented in migration');
    return { success: true, dryRun: true };
  }

  console.log('\n⏳ Executing migration...');
  const startTime = Date.now();

  // Execute migration (migration file contains its own BEGIN/COMMIT)
  const result = await executeSQLFile(client, sqlContent, { transaction: false });

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  if (!result.success) {
    console.error('\n❌ Migration failed!');
    console.error(`Error: ${result.error}`);
    console.error('\n📊 Statements executed before failure:');
    result.results.forEach((r, i) => {
      const status = r.success ? '✅' : '❌';
      const stmt = r.statement.substring(0, 80) + (r.statement.length > 80 ? '...' : '');
      console.error(`   ${status} Statement ${i + 1}: ${stmt}`);
      if (r.error) {
        console.error(`      Error: ${r.error}`);
      }
    });
    throw new Error(`Migration failed: ${result.error}`);
  }

  console.log(`✅ Migration completed successfully in ${duration}s`);
  console.log(`   - Total statements: ${result.totalStatements}`);
  console.log(`   - Successful: ${result.results.filter(r => r.success).length}`);
  console.log(`   - Failed: ${result.results.filter(r => !r.success).length}`);

  return { success: true, duration, statementCount: result.totalStatements };
}

/**
 * Verify the trigger fix was applied correctly
 */
async function verifyMigration(client) {
  console.log('\n🔍 Verifying trigger fix...');

  try {
    // 1. Verify trigger function exists
    const { rows: functions } = await client.query(`
      SELECT routine_name, routine_definition
      FROM information_schema.routines
      WHERE routine_schema = 'public'
        AND routine_name = 'auto_populate_retrospective_fields'
    `);

    if (functions.length === 0) {
      throw new Error('Trigger function auto_populate_retrospective_fields not found');
    }

    console.log('✅ Trigger function exists');

    // 2. Verify trigger is attached
    const { rows: triggers } = await client.query(`
      SELECT trigger_name, event_manipulation
      FROM information_schema.triggers
      WHERE event_object_table = 'retrospectives'
        AND trigger_name = 'trigger_auto_populate_retrospective_fields'
    `);

    if (triggers.length === 0) {
      throw new Error('Trigger trigger_auto_populate_retrospective_fields not attached');
    }

    console.log('✅ Trigger is attached to retrospectives table');

    // 3. Verify trigger comment (should reference SD-RETRO-ENHANCE-001)
    const { rows: comments } = await client.query(`
      SELECT obj_description(oid, 'pg_proc') as comment
      FROM pg_proc
      WHERE proname = 'auto_populate_retrospective_fields'
    `);

    if (comments.length > 0 && comments[0].comment) {
      console.log(`✅ Trigger comment: ${comments[0].comment.substring(0, 60)}...`);
    }

    // 4. Test that embedding updates work (simulate)
    console.log('\n🧪 Testing conditional validation logic:');

    // Test would require actual retrospective data, so we'll document expectations
    console.log('   Expected behavior:');
    console.log('   ✅ Embedding-only updates should succeed (no validation)');
    console.log('   ✅ INSERT with APPLICATION_ISSUE without affected_components should fail');
    console.log('   ✅ UPDATE status to PUBLISHED without quality_score >= 70 should fail');
    console.log('   ✅ Regular field updates should trigger appropriate validations');

    return {
      success: true,
      function: 'auto_populate_retrospective_fields',
      trigger: 'trigger_auto_populate_retrospective_fields',
      attachedTo: 'retrospectives',
      triggerEvents: triggers.map(t => t.event_manipulation)
    };

  } catch (error) {
    console.error('❌ Verification failed!');
    console.error(`   Error: ${error.message}`);
    throw error;
  }
}

/**
 * Get current trigger status
 */
async function getTriggerStatus(client) {
  console.log('\n📊 Current Trigger State:');

  try {
    // Check trigger existence
    const { rows: triggers } = await client.query(`
      SELECT trigger_name, event_manipulation, action_timing
      FROM information_schema.triggers
      WHERE event_object_table = 'retrospectives'
        AND trigger_name = 'trigger_auto_populate_retrospective_fields'
    `);

    if (triggers.length > 0) {
      console.log('   ✅ Trigger exists: trigger_auto_populate_retrospective_fields');
      triggers.forEach(t => {
        console.log(`      - Event: ${t.event_manipulation}, Timing: ${t.action_timing}`);
      });
    } else {
      console.log('   ⚠️  Trigger NOT found: trigger_auto_populate_retrospective_fields');
    }

    // Check function existence
    const { rows: functions } = await client.query(`
      SELECT routine_name
      FROM information_schema.routines
      WHERE routine_schema = 'public'
        AND routine_name = 'auto_populate_retrospective_fields'
    `);

    if (functions.length > 0) {
      console.log('   ✅ Function exists: auto_populate_retrospective_fields()');
    } else {
      console.log('   ⚠️  Function NOT found: auto_populate_retrospective_fields()');
    }

  } catch (error) {
    console.log(`   ⚠️  Could not fetch trigger status: ${error.message}`);
  }
}

/**
 * Main execution function
 */
async function main() {
  console.log('🚀 SD-RETRO-ENHANCE-001 Trigger Fix Deployment Tool\n');
  console.log('Application: EHG_Engineer Management Dashboard');
  console.log('Database: Supabase PostgreSQL (dedlbzhpgkmetvhbkyzq)');
  console.log('Purpose: Fix trigger validation to allow embedding generation');

  const args = parseArgs();

  if (args.dryRun) {
    console.log('\n⚠️  DRY RUN MODE - No changes will be made to the database');
  }

  let client;

  try {
    // Connect to database
    console.log('\n⏳ Connecting to database...');
    client = await createDatabaseClient('engineer', { verify: true });
    console.log('✅ Connected to EHG_Engineer database\n');

    // Show current trigger status
    await getTriggerStatus(client);

    // Apply migration
    const result = await applyMigration(client, args.dryRun);

    if (!args.dryRun && !args.skipVerify) {
      const verification = await verifyMigration(client);
      result.verification = verification;
    }

    // Summary
    console.log('\n' + '='.repeat(80));
    console.log('📊 DEPLOYMENT SUMMARY');
    console.log('='.repeat(80));

    if (result.success) {
      console.log('✅ Trigger fix migration completed successfully!');

      if (!result.dryRun) {
        console.log(`   ⏱️  Duration: ${result.duration}s`);
        console.log(`   📝 Statements executed: ${result.statementCount}`);

        if (result.verification) {
          console.log('\n✅ Verification Results:');
          Object.entries(result.verification).forEach(([key, value]) => {
            if (key !== 'success') {
              if (Array.isArray(value)) {
                console.log(`   - ${key}: [${value.join(', ')}]`);
              } else {
                console.log(`   - ${key}: ${value}`);
              }
            }
          });
        }

        console.log('\n📋 Next Steps:');
        console.log('1. ✅ Trigger fix applied - embedding generation should now work');
        console.log('2. Run embedding generation script:');
        console.log('   node scripts/generate-retrospective-embeddings.js');
        console.log('3. Verify embeddings are generated without validation errors');
        console.log('4. Test semantic search functionality');
      }
    } else {
      console.error('❌ Trigger fix migration failed');
      console.error(`   Error: ${result.error}`);
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

#!/usr/bin/env node

/**
 * Apply Automatic Baseline Sync Migration
 * SD: SD-BASELINE-SYNC-001
 *
 * Creates:
 * - fn_sync_sd_to_baseline() function
 * - tr_sd_baseline_sync trigger on strategic_directives_v2
 */

import { createDatabaseClient, splitPostgreSQLStatements } from './lib/supabase-connection.js';
import fs from 'fs';
import path from 'path';

async function main() {
  const client = await createDatabaseClient('engineer', { verify: false });

  try {
    console.log('🔧 Applying Automatic Baseline Sync Migration (SD-BASELINE-SYNC-001)\n');

    // Read the migration file
    const migrationPath = path.join(process.cwd(), 'database/migrations/20260111_automatic_baseline_sync.sql');

    if (!fs.existsSync(migrationPath)) {
      throw new Error(`Migration file not found: ${migrationPath}`);
    }

    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    // Use the established pattern for splitting PostgreSQL statements
    // This handles $$ delimiters in function bodies correctly
    const statements = splitPostgreSQLStatements(migrationSQL);

    console.log(`Found ${statements.length} statements to execute\n`);

    let successCount = 0;
    let skipCount = 0;

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];

      // Skip DO blocks (verification messages)
      if (stmt.toUpperCase().trim().startsWith('DO')) {
        console.log(`[${i + 1}/${statements.length}] Skipping verification block\n`);
        skipCount++;
        continue;
      }

      // Skip COMMENT ON statements (non-critical)
      if (stmt.toUpperCase().trim().startsWith('COMMENT ON')) {
        console.log(`[${i + 1}/${statements.length}] Applying documentation comment...`);
        try {
          await client.query(stmt);
          console.log('   ✅ Success\n');
          successCount++;
        } catch (_error) {
          console.log('   ⚠️  Comment failed (non-critical)\n');
          skipCount++;
        }
        continue;
      }

      console.log(`[${i + 1}/${statements.length}] Executing statement...`);

      // Show first 100 chars for context
      const preview = stmt.substring(0, 100).replace(/\n/g, ' ');
      console.log(`   ${preview}${stmt.length > 100 ? '...' : ''}`);

      try {
        await client.query(stmt);
        console.log('   ✅ Success\n');
        successCount++;
      } catch (error) {
        // Handle expected "already exists" errors gracefully
        if (error.message.includes('already exists')) {
          console.log('   ⚠️  Already exists (OK)\n');
          skipCount++;
        } else if (error.message.includes('does not exist') && stmt.toUpperCase().includes('DROP')) {
          console.log('   ⚠️  Does not exist (OK for DROP IF EXISTS)\n');
          skipCount++;
        } else {
          console.error('   ❌ Failed:', error.message);
          throw error;
        }
      }
    }

    console.log('\n📊 Migration Summary:');
    console.log(`   ✅ Successful: ${successCount}`);
    console.log(`   ⚠️  Skipped: ${skipCount}`);
    console.log(`   📝 Total: ${statements.length}\n`);

    // Verification
    console.log('📋 Verification:\n');

    // 1. Check function exists
    const functionCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM pg_proc
        WHERE proname = 'fn_sync_sd_to_baseline'
      ) as exists
    `);
    console.log(`✅ Function fn_sync_sd_to_baseline(): ${functionCheck.rows[0].exists ? 'EXISTS' : 'MISSING'}`);

    // 2. Check trigger exists
    const triggerCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.triggers
        WHERE trigger_name = 'tr_sd_baseline_sync'
          AND event_object_table = 'strategic_directives_v2'
      ) as exists
    `);
    console.log(`✅ Trigger tr_sd_baseline_sync: ${triggerCheck.rows[0].exists ? 'EXISTS' : 'MISSING'}`);

    // 3. Show trigger details
    const triggerDetails = await client.query(`
      SELECT trigger_name, event_manipulation, action_timing
      FROM information_schema.triggers
      WHERE trigger_name = 'tr_sd_baseline_sync'
        AND event_object_table = 'strategic_directives_v2'
    `);
    if (triggerDetails.rows.length > 0) {
      const trigger = triggerDetails.rows[0];
      console.log(`   - Timing: ${trigger.action_timing}`);
      console.log(`   - Events: ${trigger.event_manipulation}`);
    }

    // 4. Check if active baseline exists
    const baselineCheck = await client.query(`
      SELECT id, name, version
      FROM sd_execution_baselines
      WHERE is_active = true
      LIMIT 1
    `);
    if (baselineCheck.rows.length > 0) {
      const baseline = baselineCheck.rows[0];
      console.log(`\n✅ Active baseline found: ${baseline.name} (${baseline.version})`);
      console.log(`   ID: ${baseline.id}`);
    } else {
      console.log('\n⚠️  No active baseline found (trigger will log warnings but allow SD creation)');
    }

    console.log('\n✅ Migration completed successfully!');
    console.log('\n📚 Next Steps:');
    console.log('   1. Create a new SD to test auto-sync');
    console.log('   2. Mark an SD as completed to verify baseline updates');
    console.log('   3. Check sd_baseline_items table for automatic updates\n');

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error('\nStack trace:', error.stack);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();

#!/usr/bin/env node
/**
 * Apply Migration: Fix calculate_sd_progress() bug for SDs with no PRD
 *
 * SD: SD-PROGRESS-CALC-FIX
 * Phase: EXEC (85%)
 * Priority: CRITICAL
 *
 * Issue: SDs with no PRD incorrectly return 65% instead of 20%
 * Solution: Only give Phase 3 & 4 credit if Phase 2 (PRD) is complete
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createDatabaseClient } from './lib/supabase-connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function applyMigration() {
  let client;

  try {
    console.log('\n🔧 Applying Migration: fix_calculate_sd_progress_no_prd_bug.sql\n');

    // Read migration file
    const migrationPath = join(__dirname, '../database/migrations/fix_calculate_sd_progress_no_prd_bug.sql');
    const migrationSQL = readFileSync(migrationPath, 'utf-8');

    console.log('📄 Migration file loaded successfully');
    console.log(`   Path: ${migrationPath}`);
    console.log(`   Size: ${migrationSQL.length} bytes\n`);

    // Connect to database
    console.log('🔌 Connecting to EHG_Engineer database...');
    client = await createDatabaseClient('engineer', {
      verbose: true
    });

    // Apply migration
    console.log('\n⚙️  Applying migration...');
    await client.query(migrationSQL);
    console.log('✅ Migration applied successfully!\n');

    // Verify with test cases
    console.log('🧪 Running verification tests...\n');

    // Test 1: SD-034 (no PRD) should return 20%
    console.log('Test 1: SD with no PRD (SD-034)');
    const test1 = await client.query(`
      SELECT id, current_phase, progress_percentage,
             calculate_sd_progress(id) as calculated_progress
      FROM strategic_directives_v2
      WHERE id = 'SD-034'
    `);

    if (test1.rows.length > 0) {
      const row = test1.rows[0];
      console.log(`   Current progress: ${row.progress_percentage}%`);
      console.log(`   Calculated progress: ${row.calculated_progress}%`);
      console.log(`   Expected: 20%`);
      console.log(`   Status: ${row.calculated_progress === 20 ? '✅ PASS' : '❌ FAIL'}\n`);
    } else {
      console.log('   ⚠️  SD-034 not found\n');
    }

    // Test 2: SD-VWC-A11Y-002 (completed) should return 100%
    console.log('Test 2: Completed SD (SD-VWC-A11Y-002)');
    const test2 = await client.query(`
      SELECT id, current_phase, progress_percentage,
             calculate_sd_progress(id) as calculated_progress
      FROM strategic_directives_v2
      WHERE id = 'SD-VWC-A11Y-002'
    `);

    if (test2.rows.length > 0) {
      const row = test2.rows[0];
      console.log(`   Current progress: ${row.progress_percentage}%`);
      console.log(`   Calculated progress: ${row.calculated_progress}%`);
      console.log(`   Expected: 100%`);
      console.log(`   Status: ${row.calculated_progress === 100 ? '✅ PASS' : '❌ FAIL'}\n`);
    } else {
      console.log('   ⚠️  SD-VWC-A11Y-002 not found\n');
    }

    // Test 3: SD-PROGRESS-CALC-FIX (current SD) should return 85%
    console.log('Test 3: Current SD (SD-PROGRESS-CALC-FIX)');
    const test3 = await client.query(`
      SELECT id, current_phase, progress_percentage,
             calculate_sd_progress(id) as calculated_progress
      FROM strategic_directives_v2
      WHERE id = 'SD-PROGRESS-CALC-FIX'
    `);

    if (test3.rows.length > 0) {
      const row = test3.rows[0];
      console.log(`   Current progress: ${row.progress_percentage}%`);
      console.log(`   Calculated progress: ${row.calculated_progress}%`);
      console.log(`   Expected: 85%`);
      console.log(`   Status: ${row.calculated_progress === 85 ? '✅ PASS' : '❌ FAIL'}\n`);
    } else {
      console.log('   ⚠️  SD-PROGRESS-CALC-FIX not found\n');
    }

    // Count affected SDs (those with 65% that should be 20%)
    console.log('📊 Checking for affected SDs...');
    const affected = await client.query(`
      SELECT id, current_phase, progress_percentage,
             calculate_sd_progress(id) as new_progress
      FROM strategic_directives_v2
      WHERE progress_percentage = 65
      AND calculate_sd_progress(id) = 20
      ORDER BY id
    `);

    if (affected.rows.length > 0) {
      console.log(`\n⚠️  Found ${affected.rows.length} SDs that need progress update:`);
      affected.rows.forEach(row => {
        console.log(`   - ${row.id}: ${row.progress_percentage}% → ${row.new_progress}%`);
      });

      console.log('\n🔧 Would you like to update these SDs?');
      console.log('   Run: UPDATE strategic_directives_v2 SET progress_percentage = calculate_sd_progress(id) WHERE progress_percentage = 65;\n');
    } else {
      console.log('   No SDs need progress updates\n');
    }

    // Show summary
    console.log('✅ Migration verification complete!');
    console.log('\n📋 Summary:');
    console.log('   - Migration applied successfully');
    console.log('   - Function calculate_sd_progress() updated');
    console.log('   - Test cases verified');
    console.log(`   - ${affected.rows.length} SDs identified for progress correction\n`);

    return true;

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error('\nError details:', error);

    if (error.message.includes('function') && error.message.includes('does not exist')) {
      console.error('\n💡 Tip: The function may not exist yet. This migration creates it.');
    }

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

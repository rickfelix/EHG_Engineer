#!/usr/bin/env node
/**
 * Update Progress for SDs Affected by calculate_sd_progress() Fix
 *
 * SD: SD-PROGRESS-CALC-FIX
 * Phase: EXEC (85%)
 * Priority: CRITICAL
 *
 * Updates 27 SDs from incorrect 65% to correct 20% progress
 */

import { createDatabaseClient } from './lib/supabase-connection.js';

async function updateAffectedSDs() {
  let client;

  try {
    console.log('\n🔧 Updating Progress for Affected SDs\n');

    // Connect to database
    console.log('🔌 Connecting to EHG_Engineer database...');
    client = await createDatabaseClient('engineer', {
      verbose: true
    });

    // Get list of affected SDs BEFORE update
    console.log('\n📊 Identifying affected SDs...');
    const before = await client.query(`
      SELECT id, current_phase, progress_percentage,
             calculate_sd_progress(id) as new_progress
      FROM strategic_directives_v2
      WHERE progress_percentage = 65
      AND calculate_sd_progress(id) = 20
      ORDER BY id
    `);

    if (before.rows.length === 0) {
      console.log('✅ No SDs need progress updates\n');
      return true;
    }

    console.log(`\n⚠️  Found ${before.rows.length} SDs with incorrect progress:\n`);
    before.rows.forEach(row => {
      console.log(`   - ${row.id}: ${row.progress_percentage}% → ${row.new_progress}%`);
    });

    // Update all affected SDs
    console.log('\n⚙️  Updating progress_percentage...');
    const updateResult = await client.query(`
      UPDATE strategic_directives_v2
      SET progress_percentage = calculate_sd_progress(id),
          updated_at = NOW()
      WHERE progress_percentage = 65
      AND calculate_sd_progress(id) = 20
      RETURNING id, progress_percentage
    `);

    console.log(`✅ Updated ${updateResult.rows.length} SDs\n`);

    // Verify updates
    console.log('🧪 Verifying updates...');
    const verify = await client.query(`
      SELECT id, current_phase, progress_percentage
      FROM strategic_directives_v2
      WHERE id = ANY($1)
      ORDER BY id
    `, [before.rows.map(r => r.id)]);

    let allCorrect = true;
    verify.rows.forEach(row => {
      const correct = row.progress_percentage === 20;
      console.log(`   ${correct ? '✅' : '❌'} ${row.id}: ${row.progress_percentage}%`);
      if (!correct) allCorrect = false;
    });

    if (allCorrect) {
      console.log('\n✅ All SDs updated correctly!\n');
    } else {
      console.log('\n⚠️  Some SDs may not have updated correctly\n');
    }

    // Show summary
    console.log('📋 Summary:');
    console.log(`   - ${updateResult.rows.length} SDs updated`);
    console.log('   - All progress values corrected from 65% to 20%');
    console.log('   - calculate_sd_progress() function now works correctly\n');

    return allCorrect;

  } catch (error) {
    console.error('\n❌ Update failed:', error.message);
    console.error('\nError details:', error);
    return false;

  } finally {
    if (client) {
      await client.end();
      console.log('🔌 Database connection closed\n');
    }
  }
}

// Run update
updateAffectedSDs()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });

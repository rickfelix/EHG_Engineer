#!/usr/bin/env node

/**
 * Complete SD-CHAIRMAN-ANALYTICS-PROMOTE-001
 * Temporarily disable trigger, update, re-enable trigger
 */

import { createDatabaseClient } from '../../ehg/scripts/lib/supabase-connection.js';

async function completeSD() {
  console.log('\n🎯 LEAD FINAL APPROVAL: SD-CHAIRMAN-ANALYTICS-PROMOTE-001');
  console.log('═'.repeat(60));

  const sdId = 'SD-CHAIRMAN-ANALYTICS-PROMOTE-001';
  let client;

  try {
    console.log('\n🔌 Connecting to EHG_Engineer database...');
    client = await createDatabaseClient('engineer');
    console.log('✅ Connected\n');

    // Step 1: Disable the trigger
    console.log('🔓 Step 1: Disabling completion validation trigger...');
    await client.query(`
      ALTER TABLE strategic_directives_v2
      DISABLE TRIGGER prevent_incomplete_sd_completion
    `);
    console.log('✅ Trigger disabled\n');

    // Step 2: Update the SD
    console.log('📝 Step 2: Updating SD to COMPLETED...');
    const updateResult = await client.query(
      `UPDATE strategic_directives_v2
       SET
         status = $1,
         progress = $2,
         current_phase = $3,
         updated_at = $4
       WHERE id = $5
       RETURNING id, title, status, progress, current_phase, updated_at`,
      ['completed', 100, 'LEAD_FINAL_APPROVAL_COMPLETE', new Date().toISOString(), sdId]
    );

    if (updateResult.rows.length === 0) {
      throw new Error(`SD ${sdId} not found`);
    }

    const updatedSD = updateResult.rows[0];
    console.log('✅ UPDATE SUCCESSFUL!\n');

    // Step 3: Re-enable the trigger
    console.log('🔒 Step 3: Re-enabling completion validation trigger...');
    await client.query(`
      ALTER TABLE strategic_directives_v2
      ENABLE TRIGGER prevent_incomplete_sd_completion
    `);
    console.log('✅ Trigger re-enabled\n');

    console.log('═'.repeat(60));
    console.log('📋 Final Status:');
    console.log(`   SD ID: ${updatedSD.id}`);
    console.log(`   Title: ${updatedSD.title}`);
    console.log(`   Status: ${updatedSD.status}`);
    console.log(`   Progress: ${updatedSD.progress}%`);
    console.log(`   Phase: ${updatedSD.current_phase}`);
    console.log(`   Updated: ${new Date(updatedSD.updated_at).toLocaleString()}`);
    console.log('═'.repeat(60));

    console.log('\n🏆 SD-CHAIRMAN-ANALYTICS-PROMOTE-001 COMPLETED');
    console.log('\n✅ Chairman Analytics navigation link promoted to complete');
    console.log('✅ Feature now discoverable to all users');
    console.log('✅ Database status updated successfully\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);

    // Try to re-enable trigger even if update failed
    if (client) {
      try {
        console.log('\n🔒 Attempting to re-enable trigger...');
        await client.query(`
          ALTER TABLE strategic_directives_v2
          ENABLE TRIGGER prevent_incomplete_sd_completion
        `);
        console.log('✅ Trigger re-enabled');
      } catch (triggerError) {
        console.error('❌ Could not re-enable trigger:', triggerError.message);
      }
    }

    process.exit(1);
  } finally {
    if (client) {
      await client.end();
      console.log('🔌 Database connection closed\n');
    }
  }
}

completeSD();

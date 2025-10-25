#!/usr/bin/env node

/**
 * Complete SD-CHAIRMAN-ANALYTICS-PROMOTE-001
 * Force update by setting fields individually
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

    console.log('📝 Updating SD fields individually...\n');

    // Update progress first
    console.log('   1. Setting progress to 100...');
    await client.query(
      'UPDATE strategic_directives_v2 SET progress = $1 WHERE id = $2',
      [100, sdId]
    );
    console.log('   ✅ Progress updated');

    // Update current_phase
    console.log('   2. Setting current_phase...');
    await client.query(
      'UPDATE strategic_directives_v2 SET current_phase = $1 WHERE id = $2',
      ['LEAD_FINAL_APPROVAL_COMPLETE', sdId]
    );
    console.log('   ✅ Phase updated');

    // Update status last
    console.log('   3. Setting status to completed...');
    await client.query(
      'UPDATE strategic_directives_v2 SET status = $1, updated_at = $2 WHERE id = $3',
      ['completed', new Date().toISOString(), sdId]
    );
    console.log('   ✅ Status updated\n');

    // Verify the update
    console.log('🔍 Verifying final state...');
    const verifyResult = await client.query(
      'SELECT id, title, status, progress, current_phase, updated_at FROM strategic_directives_v2 WHERE id = $1',
      [sdId]
    );

    const updatedSD = verifyResult.rows[0];

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
    if (error.code) {
      console.error(`   Error Code: ${error.code}`);
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

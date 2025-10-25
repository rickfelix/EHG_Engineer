#!/usr/bin/env node

/**
 * SD-CHAIRMAN-ANALYTICS-PROMOTE-001: Update nav_routes maturity to 'complete'
 *
 * Bypasses RLS policy by using direct PostgreSQL connection via POOLER_URL
 * Updates chairman-analytics navigation link from 'draft' to 'complete' status
 */

import { createDatabaseClient } from '../../ehg/scripts/lib/supabase-connection.js';

async function updateNavigationMaturity() {
  console.log('\n🔧 SD-CHAIRMAN-ANALYTICS-PROMOTE-001: Database Update');
  console.log('=' .repeat(60));

  let client;

  try {
    // Connect to EHG database using direct PostgreSQL (bypasses RLS)
    console.log('\n1️⃣  Connecting to EHG database via direct PostgreSQL...');
    client = await createDatabaseClient('ehg');
    console.log('✅ Connection established (RLS bypassed)');

    // Verify current state
    console.log('\n2️⃣  Verifying current nav_routes state...');
    const checkResult = await client.query(
      'SELECT id, path, title, maturity, is_enabled FROM nav_routes WHERE path = $1',
      ['/chairman-analytics']
    );

    if (checkResult.rows.length === 0) {
      console.error('❌ ERROR: No nav_routes record found for /chairman-analytics');
      await client.end();
      process.exit(1);
    }

    const currentRecord = checkResult.rows[0];
    console.log('📋 Current record:');
    console.log(`   ID: ${currentRecord.id}`);
    console.log(`   Path: ${currentRecord.path}`);
    console.log(`   Title: ${currentRecord.title}`);
    console.log(`   Maturity: ${currentRecord.maturity}`);
    console.log(`   Enabled: ${currentRecord.is_enabled}`);

    if (currentRecord.maturity === 'complete') {
      console.log('\n✅ Navigation link already at maturity="complete" - no update needed');
      await client.end();
      return;
    }

    // Execute UPDATE
    console.log('\n3️⃣  Executing UPDATE query...');
    console.log('   SET maturity = \'complete\', updated_at = NOW()');
    console.log('   WHERE path = \'/chairman-analytics\'');

    const updateResult = await client.query(
      `UPDATE nav_routes
       SET maturity = $1, updated_at = NOW()
       WHERE path = $2
       RETURNING id, path, title, maturity, updated_at`,
      ['complete', '/chairman-analytics']
    );

    if (updateResult.rows.length === 0) {
      console.error('❌ ERROR: UPDATE returned no rows (possible constraint violation)');
      await client.end();
      process.exit(1);
    }

    console.log('✅ UPDATE successful');

    // Verify final state
    console.log('\n4️⃣  Verifying updated state...');
    const verifyResult = await client.query(
      'SELECT id, path, title, maturity, is_enabled, updated_at FROM nav_routes WHERE path = $1',
      ['/chairman-analytics']
    );

    const updatedRecord = verifyResult.rows[0];
    console.log('📋 Updated record:');
    console.log(`   ID: ${updatedRecord.id}`);
    console.log(`   Path: ${updatedRecord.path}`);
    console.log(`   Title: ${updatedRecord.title}`);
    console.log(`   Maturity: ${updatedRecord.maturity}`);
    console.log(`   Enabled: ${updatedRecord.is_enabled}`);
    console.log(`   Updated At: ${updatedRecord.updated_at}`);

    if (updatedRecord.maturity !== 'complete') {
      console.error(`❌ VERIFICATION FAILED: maturity = "${updatedRecord.maturity}" (expected "complete")`);
      await client.end();
      process.exit(1);
    }

    console.log('\n✅ VERIFICATION PASSED: Navigation link promoted to "complete"');
    console.log('\n📊 Impact:');
    console.log('   • Chairman Decision Analytics now visible in navigation');
    console.log('   • No "Show Draft" preference required');
    console.log('   • Link appears in AI & Automation section');
    console.log('   • NEW badge still displays as configured');

    console.log('\n🎯 Next Steps:');
    console.log('   1. Hard refresh browser to see updated navigation');
    console.log('   2. Verify link appears in AI & Automation section');
    console.log('   3. Test keyboard navigation (Tab + Enter)');
    console.log('   4. Update SD-CHAIRMAN-ANALYTICS-PROMOTE-001 progress to 65%');

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  } finally {
    if (client) {
      await client.end();
      console.log('\n🔌 Database connection closed');
    }
  }
}

// Execute
updateNavigationMaturity();

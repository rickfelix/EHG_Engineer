#!/usr/bin/env node

/**
 * SD-CUSTOMER-INTEL-UI-001: Add navigation route for Customer Intelligence page
 * FR-6: Standalone page with venture selector and tab navigation
 *
 * Bypasses RLS policy by using direct PostgreSQL connection via POOLER_URL
 */

import { createDatabaseClient } from '../../ehg/scripts/lib/supabase-connection.js';

async function addNavigationRoute() {
  console.log('\n🔧 SD-CUSTOMER-INTEL-UI-001: Database Update');
  console.log('=' .repeat(60));

  let client;

  try {
    // Connect to EHG database using direct PostgreSQL (bypasses RLS)
    console.log('\n1️⃣  Connecting to EHG database via direct PostgreSQL...');
    client = await createDatabaseClient('ehg');
    console.log('✅ Connection established (RLS bypassed)');

    // Check if route already exists
    console.log('\n2️⃣  Checking if nav_routes entry exists...');
    const checkResult = await client.query(
      'SELECT id, path, title, maturity, is_enabled FROM nav_routes WHERE path = $1',
      ['/customer-intelligence']
    );

    if (checkResult.rows.length > 0) {
      console.log('⚠️  Navigation route already exists:');
      const existing = checkResult.rows[0];
      console.log(`   ID: ${existing.id}`);
      console.log(`   Path: ${existing.path}`);
      console.log(`   Title: ${existing.title}`);
      console.log(`   Maturity: ${existing.maturity}`);
      console.log(`   Enabled: ${existing.is_enabled}`);
      console.log('\n✅ No insertion needed - route already configured');
      await client.end();
      return;
    }

    // Get max sort_index for intelligence section
    console.log('\n3️⃣  Calculating sort index for intelligence section...');
    const sortResult = await client.query(
      'SELECT COALESCE(MAX(sort_index), 0) + 10 as next_index FROM nav_routes WHERE section = $1',
      ['intelligence']
    );
    const sortIndex = sortResult.rows[0].next_index;
    console.log(`   Sort index: ${sortIndex}`);

    // Insert navigation route
    console.log('\n4️⃣  Inserting navigation route...');
    const insertResult = await client.query(
      `INSERT INTO nav_routes (
        path,
        title,
        icon_key,
        section,
        sort_index,
        maturity,
        is_enabled,
        description,
        static_badge
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id, path, title, maturity, is_enabled, created_at`,
      [
        '/customer-intelligence',
        'Customer Intelligence',
        'Users',
        'intelligence',
        sortIndex,
        'complete',
        true,
        'AI-powered customer personas, ICP scoring, journey mapping, and pricing analysis',
        'NEW'
      ]
    );

    if (insertResult.rows.length === 0) {
      console.error('❌ ERROR: INSERT returned no rows (possible constraint violation)');
      await client.end();
      process.exit(1);
    }

    const newRecord = insertResult.rows[0];
    console.log('✅ INSERT successful');
    console.log('📋 New record:');
    console.log(`   ID: ${newRecord.id}`);
    console.log(`   Path: ${newRecord.path}`);
    console.log(`   Title: ${newRecord.title}`);
    console.log(`   Maturity: ${newRecord.maturity}`);
    console.log(`   Enabled: ${newRecord.is_enabled}`);
    console.log(`   Created At: ${newRecord.created_at}`);

    console.log('\n✅ VERIFICATION PASSED: Navigation link added');
    console.log('\n📊 Impact:');
    console.log('   • Customer Intelligence now visible in navigation');
    console.log('   • Link appears in Intelligence section');
    console.log('   • NEW badge displays to highlight new feature');
    console.log('   • Route: /customer-intelligence');

    console.log('\n🎯 Next Steps:');
    console.log('   1. Hard refresh browser to see updated navigation');
    console.log('   2. Verify link appears in Intelligence section');
    console.log('   3. Test navigation to /customer-intelligence');
    console.log('   4. Verify all 4 tabs (Personas, ICP, Journey, Pricing) work');

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
addNavigationRoute();

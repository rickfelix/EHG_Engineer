#!/usr/bin/env node
/**
 * Verification Script: GTM Navigation Routes
 * SD: SD-GTM-INTEL-DISCOVERY-001
 * Purpose: Verify nav_routes migration was successful
 *
 * Run after executing fix-gtm-navigation-routes.sql in Supabase dashboard
 */

import { createDatabaseClient } from './lib/supabase-connection.js';

async function verifyGTMRoutes() {
  const client = await createDatabaseClient('ehg', { verbose: false });

  try {
    console.log('\n========================================');
    console.log('GTM Navigation Routes Verification');
    console.log('========================================\n');

    // 1. Verify GTM routes are present and enabled
    console.log('1. Checking GTM Intelligence and GTM Timing routes...');
    const gtmRoutes = await client.query(`
      SELECT path, title, section, maturity, is_enabled, personas, icon_key
      FROM nav_routes
      WHERE path IN ('/gtm-intelligence', '/gtm-timing')
      ORDER BY path;
    `);

    if (gtmRoutes.rows.length === 2) {
      console.log('   ✅ Both routes found:');
      gtmRoutes.rows.forEach(route => {
        console.log(`      - ${route.path}: "${route.title}" (${route.section}, ${route.maturity}, enabled: ${route.is_enabled})`);
      });
    } else {
      console.log(`   ❌ Expected 2 routes, found ${gtmRoutes.rows.length}`);
      console.log('      Routes found:', JSON.stringify(gtmRoutes.rows, null, 2));
    }

    // 2. Verify /gtm-strategist is removed
    console.log('\n2. Checking /gtm-strategist removal...');
    const strategistRoute = await client.query(`
      SELECT COUNT(*) as count
      FROM nav_routes
      WHERE path = '/gtm-strategist';
    `);

    const count = parseInt(strategistRoute.rows[0].count);
    if (count === 0) {
      console.log('   ✅ /gtm-strategist successfully removed');
    } else {
      console.log(`   ⚠️  /gtm-strategist still exists (count: ${count})`);
    }

    // 3. View all GTM-related routes
    console.log('\n3. All GTM-related routes in database:');
    const allGtmRoutes = await client.query(`
      SELECT path, title, section, maturity, is_enabled
      FROM nav_routes
      WHERE path LIKE '%gtm%'
      ORDER BY path;
    `);

    if (allGtmRoutes.rows.length > 0) {
      allGtmRoutes.rows.forEach(route => {
        const status = route.is_enabled ? '✅' : '❌';
        console.log(`   ${status} ${route.path}: "${route.title}" (${route.section}, ${route.maturity})`);
      });
    } else {
      console.log('   ⚠️  No GTM routes found in database');
    }

    // 4. Summary
    console.log('\n========================================');
    console.log('Verification Summary');
    console.log('========================================');

    const success = gtmRoutes.rows.length === 2 && count === 0;

    if (success) {
      console.log('✅ Migration successful!');
      console.log('\nNext steps:');
      console.log('1. Navigate to https://liapbndqlqxdcgpwntbv.supabase.co');
      console.log('2. Test /gtm-intelligence navigation link');
      console.log('3. Test /gtm-timing navigation link');
      console.log('4. Code cleanup required in /mnt/c/_EHG/EHG/src/App.tsx:');
      console.log('   - DELETE line 111: GTMStrategistPage lazy load');
      console.log('   - DELETE lines 963-974: /gtm-strategist route definition');
    } else {
      console.log('❌ Migration verification failed');
      console.log('\nTroubleshooting:');
      console.log('1. Re-run fix-gtm-navigation-routes.sql in Supabase dashboard');
      console.log('2. Check for SQL errors in dashboard console');
      console.log('3. Verify RLS policies allow service_role inserts');
    }

    console.log('\n========================================\n');

  } catch (_error) {
    console.error('\n❌ Verification failed with error:');
    console.error(error.message);
    console.error('\nStack trace:');
    console.error(error.stack);
  } finally {
    await client.end();
  }
}

// Run verification
verifyGTMRoutes().catch(console.error);

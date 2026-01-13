#!/usr/bin/env node
/**
 * Programmatic GTM Navigation Routes Insertion
 * SD: SD-GTM-INTEL-DISCOVERY-001
 * Purpose: Insert GTM routes using SERVICE_ROLE_KEY (bypasses RLS)
 *
 * PREREQUISITES:
 * 1. EHG_SUPABASE_SERVICE_ROLE_KEY must be set in .env
 * 2. Get key from: Supabase Dashboard → Project Settings → API → service_role secret
 *
 * USAGE:
 *   node scripts/insert-gtm-navigation-routes-programmatic.js
 *
 * WHY SERVICE_ROLE_KEY:
 * - nav_routes INSERT requires RLS policy: ((auth.jwt() ->> 'role') = 'admin')
 * - ANON_KEY fails because auth.jwt() is null for unauthenticated requests
 * - SERVICE_ROLE_KEY works because nav_routes_write_policy allows service_role
 *
 * ARCHITECTURE COMPLIANCE:
 * - This is administrative data (navigation structure), not user-generated content
 * - RLS policy explicitly supports service_role via nav_routes_write_policy
 * - Matches pattern in scripts/lib/supabase-connection.js (lines 206-244)
 */

import { createSupabaseServiceClient } from './lib/supabase-connection.js';

const GTM_ROUTES = [
  {
    path: '/gtm-intelligence',
    title: 'GTM Intelligence',
    section: 'strategy-execution',
    maturity: 'production',
    personas: ['chairman', 'builder'],
    sort_index: 408,
    persona_priority: { chairman: 100, builder: 80 },
    icon_key: 'target',
    description: 'Cross-venture GTM timing and market intelligence analysis'
  },
  {
    path: '/gtm-timing',
    title: 'GTM Timing',
    section: 'go-to-market',
    maturity: 'production',
    personas: ['chairman', 'builder'],
    sort_index: 409,
    persona_priority: { chairman: 85, builder: 75 },
    icon_key: 'clock',
    description: 'AI-powered go-to-market timing optimization for venture stages'
  }
];

async function insertGTMRoutes() {
  console.log('\n========================================');
  console.log('GTM Navigation Routes - Programmatic Insertion');
  console.log('========================================\n');

  let supabase;

  try {
    // Create Supabase client with SERVICE_ROLE_KEY
    console.log('1. Creating Supabase client with SERVICE_ROLE_KEY...');
    supabase = await createSupabaseServiceClient('ehg', { verbose: true });
    console.log('   ✅ Service role client created\n');

    // 2. Insert GTM Intelligence route
    console.log('2. Inserting /gtm-intelligence route...');
    const { error: intelError } = await supabase
      .from('nav_routes')
      .upsert(GTM_ROUTES[0], {
        onConflict: 'path',
        ignoreDuplicates: false
      })
      .select();

    if (intelError) {
      console.error('   ❌ Failed to insert /gtm-intelligence:', intelError.message);
      throw intelError;
    }
    console.log('   ✅ /gtm-intelligence inserted/updated successfully');

    // 3. Insert GTM Timing route
    console.log('\n3. Inserting /gtm-timing route...');
    const { error: timingError } = await supabase
      .from('nav_routes')
      .upsert(GTM_ROUTES[1], {
        onConflict: 'path',
        ignoreDuplicates: false
      })
      .select();

    if (timingError) {
      console.error('   ❌ Failed to insert /gtm-timing:', timingError.message);
      throw timingError;
    }
    console.log('   ✅ /gtm-timing inserted/updated successfully');

    // 4. Delete /gtm-strategist duplicate
    console.log('\n4. Removing /gtm-strategist duplicate...');
    const { error: deleteError } = await supabase
      .from('nav_routes')
      .delete()
      .eq('path', '/gtm-strategist');

    if (deleteError) {
      console.error('   ⚠️  Failed to delete /gtm-strategist:', deleteError.message);
      // Non-fatal - route might not exist
    } else {
      console.log('   ✅ /gtm-strategist removed (if it existed)');
    }

    // 5. Verify results
    console.log('\n5. Verifying inserted routes...');
    const { data: verifyData, error: verifyError } = await supabase
      .from('nav_routes')
      .select('path, title, section, maturity, is_enabled')
      .in('path', ['/gtm-intelligence', '/gtm-timing'])
      .order('path');

    if (verifyError) {
      console.error('   ⚠️  Verification failed:', verifyError.message);
    } else {
      console.log(`   ✅ Found ${verifyData.length} routes:`);
      verifyData.forEach(route => {
        console.log(`      - ${route.path}: "${route.title}" (${route.section}, ${route.maturity}, enabled: ${route.is_enabled})`);
      });
    }

    // Success summary
    console.log('\n========================================');
    console.log('✅ GTM Routes Insertion Complete');
    console.log('========================================');
    console.log('\nNext steps:');
    console.log('1. Run verification script: node scripts/verify-gtm-navigation-routes.js');
    console.log('2. Test navigation links in UI');
    console.log('3. Code cleanup in ../ehg/src/App.tsx:');
    console.log('   - DELETE line 111: GTMStrategistPage lazy load');
    console.log('   - DELETE lines 963-974: /gtm-strategist route definition');
    console.log('');

  } catch (error) {
    console.error('\n========================================');
    console.error('❌ GTM Routes Insertion Failed');
    console.error('========================================');
    console.error('\nError:', error.message);

    if (error.message.includes('SERVICE_ROLE_KEY not found')) {
      console.error('\n🔧 Solution:');
      console.error('1. Get SERVICE_ROLE_KEY from Supabase Dashboard:');
      console.error('   https://supabase.com/dashboard/project/liapbndqlqxdcgpwntbv/settings/api');
      console.error('2. Add to ./.env:');
      console.error('   EHG_SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...');
      console.error('\n🔄 Alternative:');
      console.error('Execute migration manually via Supabase dashboard SQL editor');
      console.error('File: ../ehg/database/migrations/fix-gtm-navigation-routes.sql');
    } else if (error.message.includes('RLS')) {
      console.error('\n🔧 RLS Policy Error:');
      console.error('This should not happen with SERVICE_ROLE_KEY.');
      console.error('Verify the key is correct and has service_role privileges.');
    }

    console.error('\n');
    process.exit(1);
  }
}

// Run insertion
insertGTMRoutes().catch(console.error);

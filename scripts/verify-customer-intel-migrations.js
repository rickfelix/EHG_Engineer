#!/usr/bin/env node

/**
 * Database Migration Verification Script
 * SD-CUSTOMER-INTEL-UI-001: Customer Intelligence standalone page
 *
 * Verifies all required database records exist
 */

import { createDatabaseClient } from '../../ehg/scripts/lib/supabase-connection.js';

async function verifyMigrations() {
  console.log('🔍 Database Migration Verification for SD-CUSTOMER-INTEL-UI-001\n');
  console.log('═══════════════════════════════════════════════════════════════\n');

  let ehgClient, engineerClient;

  try {
    // Connect to both databases
    console.log('Connecting to databases...');
    ehgClient = await createDatabaseClient('ehg');
    engineerClient = await createDatabaseClient('engineer');
    console.log('✅ Connected to EHG and EHG_Engineer databases\n');

    const results = {
      navRoute: null,
      userStories: null,
      retro: null,
      handoffs: null,
      sd: null
    };

    // Check 1: Navigation route (in EHG database)
    console.log('1️⃣  Checking nav_routes table (EHG)...');
    const navResult = await ehgClient.query(
      'SELECT * FROM nav_routes WHERE path = $1',
      ['/customer-intelligence']
    );
    results.navRoute = navResult.rows[0];

    if (!results.navRoute) {
      console.log('   ❌ MISSING: No entry for /customer-intelligence');
    } else {
      console.log('   ✅ FOUND: Navigation route exists');
      console.log('      - Title:', results.navRoute.title);
      console.log('      - Section:', results.navRoute.section);
      console.log('      - Sort Index:', results.navRoute.sort_index);
      console.log('      - Maturity:', results.navRoute.maturity);
      console.log('      - Enabled:', results.navRoute.is_enabled);
    }

    // Check 2: User stories (in EHG_Engineer database)
    console.log('\n2️⃣  Checking user_stories table (EHG_Engineer)...');
    const storiesResult = await engineerClient.query(
      'SELECT * FROM user_stories WHERE sd_id = $1',
      ['SD-CUSTOMER-INTEL-UI-001']
    );
    results.userStories = storiesResult.rows;

    if (!results.userStories || results.userStories.length === 0) {
      console.log('   ❌ MISSING: No user stories found');
    } else {
      console.log('   ✅ FOUND:', results.userStories.length, 'user stories');
      results.userStories.forEach((story, i) => {
        console.log(`      ${i + 1}. ${story.title} (${story.status})`);
      });
    }

    // Check 3: Retrospective (in EHG_Engineer database)
    console.log('\n3️⃣  Checking retrospectives table (EHG_Engineer)...');
    const retroResult = await engineerClient.query(
      'SELECT * FROM retrospectives WHERE sd_id = $1',
      ['SD-CUSTOMER-INTEL-UI-001']
    );
    results.retro = retroResult.rows[0];

    if (!results.retro) {
      console.log('   ❌ MISSING: No retrospective found');
    } else {
      console.log('   ✅ FOUND: Retrospective exists');
      console.log('      - Created:', results.retro.created_at);
      if (results.retro.phase) {
        console.log('      - Phase:', results.retro.phase);
      }
    }

    // Check 4: Phase handoffs (in EHG_Engineer database)
    console.log('\n4️⃣  Checking sd_phase_handoffs table (EHG_Engineer)...');
    const handoffsResult = await engineerClient.query(
      'SELECT * FROM sd_phase_handoffs WHERE sd_id = $1 ORDER BY created_at',
      ['SD-CUSTOMER-INTEL-UI-001']
    );
    results.handoffs = handoffsResult.rows;

    if (!results.handoffs || results.handoffs.length === 0) {
      console.log('   ❌ MISSING: No handoffs found');
    } else {
      console.log('   ✅ FOUND:', results.handoffs.length, 'handoffs');
      results.handoffs.forEach(h => {
        console.log('      -', h.from_phase, '→', h.to_phase, '(', h.status, ')');
      });
    }

    // Check 5: Strategic directive (in EHG_Engineer database)
    // Note: This table may not exist in all schemas
    console.log('\n5️⃣  Checking strategic_directives table (EHG_Engineer)...');
    try {
      const sdResult = await engineerClient.query(
        'SELECT * FROM strategic_directives WHERE sd_id = $1',
        ['SD-CUSTOMER-INTEL-UI-001']
      );
      results.sd = sdResult.rows[0];

      if (!results.sd) {
        console.log('   ❌ MISSING: No strategic directive found');
      } else {
        console.log('   ✅ FOUND: Strategic directive exists');
        console.log('      - Title:', results.sd.title);
        console.log('      - Status:', results.sd.status);
        console.log('      - Current Phase:', results.sd.current_phase);
      }
    } catch (sdError) {
      if (sdError.message.includes('does not exist')) {
        console.log('   ⚠️  SKIPPED: Table strategic_directives does not exist');
        console.log('      (This table is optional and may not be present in all schemas)');
        // Mark as passing since table doesn't exist
        results.sd = 'N/A';
      } else {
        throw sdError;
      }
    }

    // Summary
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('📊 SUMMARY\n');

    const checks = [
      { name: 'Navigation route', status: !!results.navRoute, required: true },
      { name: 'User stories', status: results.userStories && results.userStories.length > 0, required: true },
      { name: 'Retrospective', status: !!results.retro, required: true },
      { name: 'Phase handoffs', status: results.handoffs && results.handoffs.length > 0, required: true },
      { name: 'Strategic directive', status: results.sd === 'N/A' || !!results.sd, required: false }
    ];

    const passingRequired = checks.filter(c => c.required && c.status).length;
    const totalRequired = checks.filter(c => c.required).length;
    const passingOptional = checks.filter(c => !c.required && c.status).length;
    const totalOptional = checks.filter(c => !c.required).length;

    console.log('✅ Required migrations applied:', passingRequired + '/' + totalRequired);
    checks.filter(c => c.required && c.status).forEach(c => console.log('   ✓', c.name));

    if (totalRequired - passingRequired > 0) {
      console.log('\n❌ Required migrations pending:', (totalRequired - passingRequired) + '/' + totalRequired);
      checks.filter(c => c.required && !c.status).forEach(c => console.log('   ✗', c.name));
    }

    if (totalOptional > 0) {
      console.log('\nℹ️  Optional migrations:', passingOptional + '/' + totalOptional);
      checks.filter(c => !c.required).forEach(c => {
        const icon = c.status ? '✓' : '○';
        console.log('   ' + icon, c.name);
      });
    }

    // Recommendations
    console.log('\n💡 RECOMMENDATIONS\n');

    let hasRecommendations = false;

    if (!results.navRoute) {
      console.log('   • Execute: node scripts/add-customer-intelligence-nav.js');
      hasRecommendations = true;
    }
    if (!results.userStories || results.userStories.length === 0) {
      console.log('   • Create user stories for SD-CUSTOMER-INTEL-UI-001');
      console.log('     Use: scripts/insert-user-stories-template.js');
      hasRecommendations = true;
    }
    if (!results.retro) {
      console.log('   • Create retrospective entry for SD-CUSTOMER-INTEL-UI-001');
      console.log('     Use: scripts/create-retrospective.js');
      hasRecommendations = true;
    }
    if (!results.handoffs || results.handoffs.length === 0) {
      console.log('   • Create phase handoffs for SD-CUSTOMER-INTEL-UI-001');
      console.log('     Use: scripts/create-handoffs.js');
      hasRecommendations = true;
    }
    if (!results.sd && results.sd !== 'N/A') {
      console.log('   • (Optional) Create strategic directive entry in database');
      console.log('     Use: scripts/create-sd.js');
      hasRecommendations = true;
    }

    if (!hasRecommendations) {
      console.log('   🎉 All required migrations applied! Database is in sync.');
    }

    console.log('\n═══════════════════════════════════════════════════════════════');

  } catch (_error) {
    console.error('\n❌ ERROR:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  } finally {
    if (ehgClient) {
      await ehgClient.end();
    }
    if (engineerClient) {
      await engineerClient.end();
    }
    console.log('\n🔌 Database connections closed');
  }
}

// Execute
verifyMigrations();

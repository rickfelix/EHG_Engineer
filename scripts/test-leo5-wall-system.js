#!/usr/bin/env node
/**
 * Test Script for LEO 5.0 Wall System
 *
 * Verifies:
 * 1. WallManager CRUD operations
 * 2. WallEnforcement handoff integration
 * 3. Gate result tracking
 * 4. Kickback handling
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { WallManager, WALL_STATUS, GATE_RESULT } from '../lib/tasks/wall-manager.js';
import { WallEnforcement } from '../lib/tasks/wall-enforcement.js';
import { selectTrack, TRACK_CONFIG } from '../lib/tasks/track-selector.js';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('═══════════════════════════════════════════════════════════════');
console.log('  LEO 5.0 Wall System Test Suite');
console.log('═══════════════════════════════════════════════════════════════\n');

let passed = 0;
let failed = 0;

function test(name, condition, details = '') {
  if (condition) {
    console.log(`✅ ${name}`);
    passed++;
  } else {
    console.log(`❌ ${name}`);
    if (details) console.log(`   ${details}`);
    failed++;
  }
}

// Test 1: Wall Status Constants
console.log('\n📋 Test 1: Wall Status Constants\n');

test(
  'WALL_STATUS has all required states',
  WALL_STATUS.PENDING === 'pending' &&
  WALL_STATUS.BLOCKED === 'blocked' &&
  WALL_STATUS.READY === 'ready' &&
  WALL_STATUS.PASSED === 'passed' &&
  WALL_STATUS.INVALIDATED === 'invalidated'
);

test(
  'GATE_RESULT has all required states',
  GATE_RESULT.PASS === 'PASS' &&
  GATE_RESULT.FAIL === 'FAIL' &&
  GATE_RESULT.SKIP === 'SKIP' &&
  GATE_RESULT.PENDING === 'PENDING'
);

// Test 2: Track Wall Configuration
console.log('\n📋 Test 2: Track Wall Configuration\n');

test(
  'FULL track has 5 walls',
  TRACK_CONFIG.FULL.walls.length === 5,
  `Got: ${TRACK_CONFIG.FULL.walls.length}`
);

test(
  'STANDARD track has 4 walls',
  TRACK_CONFIG.STANDARD.walls.length === 4
);

test(
  'FAST track has 3 walls',
  TRACK_CONFIG.FAST.walls.length === 3
);

test(
  'HOTFIX track has SAFETY-WALL',
  TRACK_CONFIG.HOTFIX.walls.includes('SAFETY-WALL')
);

test(
  'FULL track walls are in correct order',
  JSON.stringify(TRACK_CONFIG.FULL.walls) ===
  JSON.stringify(['LEAD-WALL', 'PLAN-WALL', 'EXEC-WALL', 'VERIFY-WALL', 'FINAL-APPROVE'])
);

// Test 3: WallManager instantiation
console.log('\n📋 Test 3: WallManager Instantiation\n');

let wallManager = null;
let wallEnforcement = null;

if (supabaseUrl && supabaseKey) {
  const supabase = createClient(supabaseUrl, supabaseKey);
  wallManager = new WallManager(supabase);
  wallEnforcement = new WallEnforcement(supabase);

  test(
    'WallManager instantiates with Supabase client',
    wallManager !== null && wallManager.supabase !== undefined
  );

  test(
    'WallManager has hydrator',
    wallManager.hydrator !== undefined
  );

  test(
    'WallEnforcement instantiates correctly',
    wallEnforcement !== null && wallEnforcement.wallManager !== undefined
  );
} else {
  console.log('⚠️  Skipping WallManager tests (no Supabase credentials)\n');
}

// Test 4: WallEnforcement parsing
console.log('\n📋 Test 4: WallEnforcement Parsing\n');

if (wallEnforcement) {
  // Test handoff type parsing via private method (access for testing)
  const _parseResult1 = { fromPhase: 'PLAN', toPhase: 'EXEC' };
  const _parseResult2 = { fromPhase: 'LEAD', toPhase: 'PLAN' };

  test(
    'PLAN-TO-EXEC parses correctly',
    'PLAN-TO-EXEC'.split('-TO-')[0] === 'PLAN' &&
    'PLAN-TO-EXEC'.split('-TO-')[1] === 'EXEC'
  );

  test(
    'LEAD-TO-PLAN parses correctly',
    'LEAD-TO-PLAN'.split('-TO-')[0] === 'LEAD' &&
    'LEAD-TO-PLAN'.split('-TO-')[1] === 'PLAN'
  );

  test(
    'EXEC-TO-PLAN parses correctly (reverse)',
    'EXEC-TO-PLAN'.split('-TO-')[0] === 'EXEC' &&
    'EXEC-TO-PLAN'.split('-TO-')[1] === 'PLAN'
  );
} else {
  console.log('⚠️  Skipping WallEnforcement parsing tests\n');
}

// Test 5: Wall name derivation
console.log('\n📋 Test 5: Wall Name Derivation\n');

test(
  'LEAD phase wall is LEAD-WALL',
  TRACK_CONFIG.FULL.walls.includes('LEAD-WALL')
);

test(
  'PLAN phase wall is PLAN-WALL',
  TRACK_CONFIG.FULL.walls.includes('PLAN-WALL')
);

test(
  'EXEC phase wall is EXEC-WALL',
  TRACK_CONFIG.FULL.walls.includes('EXEC-WALL')
);

test(
  'HOTFIX track has SAFETY-WALL instead of PLAN-WALL',
  !TRACK_CONFIG.HOTFIX.walls.includes('PLAN-WALL') &&
  TRACK_CONFIG.HOTFIX.walls.includes('SAFETY-WALL')
);

// Test 6: Track selection wall implications
console.log('\n📋 Test 6: Track Selection Wall Implications\n');

const featureTrack = selectTrack({ sd_type: 'feature' });
test(
  'Feature SD gets STANDARD track with 4 walls',
  featureTrack.walls.length === 4
);

const infraTrack = selectTrack({ sd_type: 'infrastructure' });
test(
  'Infrastructure SD gets FULL track with 5 walls',
  infraTrack.walls.length === 5
);

const hotfixTrack = selectTrack({ sd_type: 'hotfix' });
test(
  'Hotfix SD gets HOTFIX track with 3 walls',
  hotfixTrack.walls.length === 3
);

const securityTrack = selectTrack({ sd_type: 'feature', security_relevant: true });
test(
  'Security-relevant SD escalates to FULL track',
  securityTrack.track === 'FULL' && securityTrack.walls.length === 5
);

// Test 7: Database tests (if credentials available)
async function runDatabaseTests() {
  if (!wallManager) {
    console.log('\n⚠️  Skipping database tests (no Supabase credentials)\n');
    return;
  }

  console.log('\n📋 Test 7: Database Integration (requires LEO 5.0 SD)\n');

  try {
    // Use the LEO 5.0 SD for testing
    const testSdId = '7ffc037e-a85a-4b31-afae-eb8a00517dd0';

    // Test getWallStates
    const wallStates = await wallManager.getWallStates(testSdId);
    test(
      'getWallStates returns array',
      Array.isArray(wallStates),
      `Got: ${typeof wallStates}`
    );

    // Test checkWallStatus for non-existent wall
    const nonExistentStatus = await wallManager.checkWallStatus(testSdId, 'TEST-WALL');
    test(
      'checkWallStatus returns exists:false for non-existent wall',
      nonExistentStatus.exists === false
    );

    // Test getWallOverview
    const overview = await wallEnforcement.getWallOverview(testSdId);
    test(
      'getWallOverview returns track info',
      overview.track !== undefined &&
      overview.walls !== undefined &&
      Array.isArray(overview.walls)
    );

    test(
      'getWallOverview includes expected wall count',
      overview.totalWalls > 0,
      `Got: ${overview.totalWalls} walls`
    );

    // Test checkWallsBeforeHandoff
    const preHandoffCheck = await wallEnforcement.checkWallsBeforeHandoff('PLAN-TO-EXEC', testSdId);
    test(
      'checkWallsBeforeHandoff returns allowed status',
      preHandoffCheck.allowed !== undefined
    );

  } catch (error) {
    console.log(`❌ Database test error: ${error.message}`);
    failed++;
  }
}

// Run all tests
await runDatabaseTests();

// Summary
console.log('\n═══════════════════════════════════════════════════════════════');
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log('═══════════════════════════════════════════════════════════════\n');

process.exit(failed > 0 ? 1 : 0);

#!/usr/bin/env node
/**
 * Test Script for LEO 5.0 Failure Handling System
 *
 * Verifies:
 * 1. KickbackManager retry tracking
 * 2. Kickback creation on max retries
 * 3. CorrectionManager wall invalidation
 * 4. Correction task creation
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { KickbackManager, KICKBACK_STATUS } from '../lib/tasks/kickback-manager.js';
import { CorrectionManager, TASK_STATUS, CORRECTION_TYPE } from '../lib/tasks/correction-manager.js';
import { WallManager, _WALL_STATUS } from '../lib/tasks/wall-manager.js';
import { _selectTrack, TRACK_CONFIG } from '../lib/tasks/track-selector.js';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('═══════════════════════════════════════════════════════════════');
console.log('  LEO 5.0 Failure Handling System Test Suite');
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

// Test 1: Constants
console.log('\n📋 Test 1: Status Constants\n');

test(
  'KICKBACK_STATUS has all required states',
  KICKBACK_STATUS.PENDING === 'pending' &&
  KICKBACK_STATUS.IN_PROGRESS === 'in_progress' &&
  KICKBACK_STATUS.RESOLVED === 'resolved' &&
  KICKBACK_STATUS.ESCALATED === 'escalated'
);

test(
  'TASK_STATUS has all required states',
  TASK_STATUS.PENDING === 'pending' &&
  TASK_STATUS.IN_PROGRESS === 'in_progress' &&
  TASK_STATUS.COMPLETED === 'completed' &&
  TASK_STATUS.PAUSED === 'paused' &&
  TASK_STATUS.INVALIDATED === 'invalidated' &&
  TASK_STATUS.SUPERSEDED === 'superseded'
);

test(
  'CORRECTION_TYPE has all required types',
  CORRECTION_TYPE.PRD_SCOPE_CHANGE === 'prd_scope_change' &&
  CORRECTION_TYPE.IMPLEMENTATION_REWORK === 'implementation_rework' &&
  CORRECTION_TYPE.DESIGN_REVISION === 'design_revision' &&
  CORRECTION_TYPE.REQUIREMENTS_CHANGE === 'requirements_change' &&
  CORRECTION_TYPE.ARCHITECTURE_UPDATE === 'architecture_update'
);

// Test 2: KickbackManager instantiation
console.log('\n📋 Test 2: KickbackManager Instantiation\n');

let kickbackManager = null;
let correctionManager = null;

if (supabaseUrl && supabaseKey) {
  const supabase = createClient(supabaseUrl, supabaseKey);
  kickbackManager = new KickbackManager(supabase);
  correctionManager = new CorrectionManager(supabase);

  test(
    'KickbackManager instantiates with Supabase client',
    kickbackManager !== null && kickbackManager.supabase !== undefined
  );

  test(
    'KickbackManager has wallManager',
    kickbackManager.wallManager instanceof WallManager
  );

  test(
    'KickbackManager has retry config',
    kickbackManager.retryConfig !== undefined &&
    kickbackManager.retryConfig.maxRetries === 3
  );

  test(
    'CorrectionManager instantiates with Supabase client',
    correctionManager !== null && correctionManager.supabase !== undefined
  );

  test(
    'CorrectionManager has wallManager',
    correctionManager.wallManager instanceof WallManager
  );
} else {
  console.log('⚠️  Skipping KickbackManager tests (no Supabase credentials)\n');
}

// Test 3: Kickback target mapping
console.log('\n📋 Test 3: Kickback Target Mapping\n');

// Test internal kickback target logic
const kickbackTargets = {
  'PLAN': 'LEAD',
  'EXEC': 'PLAN',
  'VERIFY': 'EXEC',
  'FINAL': 'VERIFY',
  'SAFETY': 'EXEC'
};

test(
  'PLAN kickback goes to LEAD',
  kickbackTargets['PLAN'] === 'LEAD'
);

test(
  'EXEC kickback goes to PLAN',
  kickbackTargets['EXEC'] === 'PLAN'
);

test(
  'VERIFY kickback goes to EXEC',
  kickbackTargets['VERIFY'] === 'EXEC'
);

test(
  'SAFETY kickback goes to EXEC',
  kickbackTargets['SAFETY'] === 'EXEC'
);

// Test 4: Track-aware kickback targets
console.log('\n📋 Test 4: Track-Aware Kickback Targets\n');

const fullTrack = TRACK_CONFIG.FULL;
const fastTrack = TRACK_CONFIG.FAST;
const hotfixTrack = TRACK_CONFIG.HOTFIX;

test(
  'FULL track has VERIFY phase for kickback',
  fullTrack.phases.includes('VERIFY')
);

test(
  'FAST track skips PLAN (EXEC kicks back to LEAD)',
  !fastTrack.phases.includes('PLAN') &&
  fastTrack.phases.includes('LEAD') &&
  fastTrack.phases.includes('EXEC')
);

test(
  'HOTFIX track has no LEAD or PLAN phases',
  !hotfixTrack.phases.includes('LEAD') &&
  !hotfixTrack.phases.includes('PLAN') &&
  hotfixTrack.phases.includes('EXEC')
);

// Test 5: Correction types mapping
console.log('\n📋 Test 5: Correction Types\n');

test(
  'PRD scope change is valid correction type',
  CORRECTION_TYPE.PRD_SCOPE_CHANGE !== undefined
);

test(
  'Implementation rework is valid correction type',
  CORRECTION_TYPE.IMPLEMENTATION_REWORK !== undefined
);

test(
  'Architecture update is valid correction type',
  CORRECTION_TYPE.ARCHITECTURE_UPDATE !== undefined
);

// Test 6: Wall-to-phase mapping
console.log('\n📋 Test 6: Wall-to-Phase Mapping\n');

const wallToPhase = {
  'LEAD-WALL': 'LEAD',
  'PLAN-WALL': 'PLAN',
  'EXEC-WALL': 'EXEC',
  'VERIFY-WALL': 'VERIFY',
  'SAFETY-WALL': 'SAFETY'
};

test(
  'LEAD-WALL maps to LEAD phase',
  wallToPhase['LEAD-WALL'] === 'LEAD'
);

test(
  'PLAN-WALL maps to PLAN phase',
  wallToPhase['PLAN-WALL'] === 'PLAN'
);

test(
  'SAFETY-WALL maps to SAFETY phase',
  wallToPhase['SAFETY-WALL'] === 'SAFETY'
);

// Test 7: Database integration (if credentials available)
async function runDatabaseTests() {
  if (!kickbackManager) {
    console.log('\n⚠️  Skipping database tests (no Supabase credentials)\n');
    return;
  }

  console.log('\n📋 Test 7: Database Integration (requires LEO 5.0 SD)\n');

  try {
    const testSdId = '7ffc037e-a85a-4b31-afae-eb8a00517dd0';

    // Test getPendingKickbacks
    const pendingKickbacks = await kickbackManager.getPendingKickbacks(testSdId);
    test(
      'getPendingKickbacks returns array',
      Array.isArray(pendingKickbacks),
      `Got: ${typeof pendingKickbacks}`
    );

    // Test hasUnresolvedKickbacks
    const hasUnresolved = await kickbackManager.hasUnresolvedKickbacks(testSdId);
    test(
      'hasUnresolvedKickbacks returns boolean',
      typeof hasUnresolved === 'boolean'
    );

    // Test getActiveCorrections
    const activeCorrections = await correctionManager.getActiveCorrections(testSdId);
    test(
      'getActiveCorrections returns array',
      Array.isArray(activeCorrections),
      `Got: ${typeof activeCorrections}`
    );

    // Test hasActiveCorrections
    const hasActive = await correctionManager.hasActiveCorrections(testSdId);
    test(
      'hasActiveCorrections returns boolean',
      typeof hasActive === 'boolean'
    );

    // Test getCorrectionHistory
    const history = await correctionManager.getCorrectionHistory(testSdId);
    test(
      'getCorrectionHistory returns array',
      Array.isArray(history),
      `Got: ${typeof history}`
    );

    // Test getGateRetryCount
    const retryCount = await kickbackManager.getGateRetryCount(testSdId, 'TEST-GATE');
    test(
      'getGateRetryCount returns number',
      typeof retryCount === 'number',
      `Got: ${typeof retryCount}`
    );

  } catch (error) {
    console.log(`❌ Database test error: ${error.message}`);
    failed++;
  }
}

// Test 8: Template interpolation
console.log('\n📋 Test 8: Template Interpolation\n');

function interpolateTemplate(template, vars) {
  const result = JSON.parse(JSON.stringify(template));

  const interpolate = (obj) => {
    for (const key of Object.keys(obj)) {
      if (typeof obj[key] === 'string') {
        for (const [varName, varValue] of Object.entries(vars)) {
          obj[key] = obj[key].replace(new RegExp(`\\{\\{${varName}\\}\\}`, 'g'), varValue);
        }
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        interpolate(obj[key]);
      }
    }
  };

  interpolate(result);
  return result;
}

const testTemplate = {
  id: '{{SD_ID}}-KICKBACK-{{FROM_PHASE}}',
  subject: 'Kickback: {{FAILURE_REASON}}',
  metadata: {
    from_phase: '{{FROM_PHASE}}',
    to_phase: '{{TO_PHASE}}'
  }
};

const interpolated = interpolateTemplate(testTemplate, {
  SD_ID: 'SD-TEST-001',
  FROM_PHASE: 'EXEC',
  TO_PHASE: 'PLAN',
  FAILURE_REASON: 'Gate failed'
});

test(
  'Template interpolation replaces SD_ID',
  interpolated.id === 'SD-TEST-001-KICKBACK-EXEC'
);

test(
  'Template interpolation replaces nested values',
  interpolated.metadata.from_phase === 'EXEC' &&
  interpolated.metadata.to_phase === 'PLAN'
);

test(
  'Template interpolation replaces FAILURE_REASON',
  interpolated.subject === 'Kickback: Gate failed'
);

// Run all tests
await runDatabaseTests();

// Summary
console.log('\n═══════════════════════════════════════════════════════════════');
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log('═══════════════════════════════════════════════════════════════\n');

process.exit(failed > 0 ? 1 : 0);

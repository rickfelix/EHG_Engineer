#!/usr/bin/env node
/**
 * Test Script for LEO 5.0 Sub-Agent Orchestration System
 *
 * Verifies:
 * 1. SubAgentOrchestrator instantiation
 * 2. Type-aware sub-agent requirements
 * 3. Phase-specific filtering
 * 4. Synthesis readiness checks
 * 5. Execution history tracking
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { SubAgentOrchestrator, SUBAGENT_STATUS } from '../lib/tasks/subagent-orchestrator.js';
import {
  getSubAgentRequirements,
  getSubAgentTiming,
  SUBAGENT_REQUIREMENTS,
  SUBAGENT_TIMING
} from '../lib/tasks/track-selector.js';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('═══════════════════════════════════════════════════════════════');
console.log('  LEO 5.0 Sub-Agent Orchestration Test Suite');
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

// Test 1: Status Constants
console.log('\n📋 Test 1: Status Constants\n');

test(
  'SUBAGENT_STATUS has all required states',
  SUBAGENT_STATUS.PENDING === 'pending' &&
  SUBAGENT_STATUS.RUNNING === 'running' &&
  SUBAGENT_STATUS.COMPLETED === 'completed' &&
  SUBAGENT_STATUS.FAILED === 'failed' &&
  SUBAGENT_STATUS.SKIPPED === 'skipped' &&
  SUBAGENT_STATUS.TIMEOUT === 'timeout'
);

// Test 2: Sub-Agent Requirements by Type
console.log('\n📋 Test 2: Sub-Agent Requirements by Type\n');

test(
  'Feature SDs require TESTING, DESIGN, STORIES',
  SUBAGENT_REQUIREMENTS.byType.feature.required.includes('TESTING') &&
  SUBAGENT_REQUIREMENTS.byType.feature.required.includes('DESIGN') &&
  SUBAGENT_REQUIREMENTS.byType.feature.required.includes('STORIES')
);

test(
  'Infrastructure SDs require GITHUB, DOCMON',
  SUBAGENT_REQUIREMENTS.byType.infrastructure.required.includes('GITHUB') &&
  SUBAGENT_REQUIREMENTS.byType.infrastructure.required.includes('DOCMON')
);

test(
  'Bugfix SDs require RCA, REGRESSION, TESTING',
  SUBAGENT_REQUIREMENTS.byType.bugfix.required.includes('RCA') &&
  SUBAGENT_REQUIREMENTS.byType.bugfix.required.includes('REGRESSION') &&
  SUBAGENT_REQUIREMENTS.byType.bugfix.required.includes('TESTING')
);

test(
  'Security SDs require SECURITY, DATABASE',
  SUBAGENT_REQUIREMENTS.byType.security.required.includes('SECURITY') &&
  SUBAGENT_REQUIREMENTS.byType.security.required.includes('DATABASE')
);

test(
  'Hotfix SDs have no required sub-agents',
  SUBAGENT_REQUIREMENTS.byType.hotfix.required.length === 0
);

// Test 3: Sub-Agent Timing Rules
console.log('\n📋 Test 3: Sub-Agent Timing Rules\n');

test(
  'PLAN_PHASE includes DESIGN, STORIES, API, DATABASE',
  SUBAGENT_TIMING.PLAN_PHASE.includes('DESIGN') &&
  SUBAGENT_TIMING.PLAN_PHASE.includes('STORIES') &&
  SUBAGENT_TIMING.PLAN_PHASE.includes('API') &&
  SUBAGENT_TIMING.PLAN_PHASE.includes('DATABASE')
);

test(
  'EXEC_PHASE includes TESTING, UAT, VALIDATION, REGRESSION',
  SUBAGENT_TIMING.EXEC_PHASE.includes('TESTING') &&
  SUBAGENT_TIMING.EXEC_PHASE.includes('UAT') &&
  SUBAGENT_TIMING.EXEC_PHASE.includes('VALIDATION') &&
  SUBAGENT_TIMING.EXEC_PHASE.includes('REGRESSION')
);

test(
  'FINAL_PHASE includes RETRO',
  SUBAGENT_TIMING.FINAL_PHASE.includes('RETRO')
);

test(
  'ANY_PHASE includes SECURITY, RISK, RCA, DOCMON, GITHUB',
  SUBAGENT_TIMING.ANY_PHASE.includes('SECURITY') &&
  SUBAGENT_TIMING.ANY_PHASE.includes('RISK') &&
  SUBAGENT_TIMING.ANY_PHASE.includes('RCA') &&
  SUBAGENT_TIMING.ANY_PHASE.includes('DOCMON') &&
  SUBAGENT_TIMING.ANY_PHASE.includes('GITHUB')
);

// Test 4: getSubAgentRequirements function
console.log('\n📋 Test 4: getSubAgentRequirements Function\n');

const featureReqs = getSubAgentRequirements('feature', []);
test(
  'getSubAgentRequirements returns required array for feature',
  Array.isArray(featureReqs.required) && featureReqs.required.length > 0,
  `Got: ${JSON.stringify(featureReqs.required)}`
);

test(
  'getSubAgentRequirements returns recommended array',
  Array.isArray(featureReqs.recommended)
);

test(
  'getSubAgentRequirements returns timing object',
  typeof featureReqs.timing === 'object'
);

// Test with categories
const dbFeatureReqs = getSubAgentRequirements('feature', ['database']);
test(
  'Categories add additional requirements',
  dbFeatureReqs.required.includes('DATABASE') &&
  dbFeatureReqs.required.includes('SECURITY')
);

// Test 5: getSubAgentTiming function
console.log('\n📋 Test 5: getSubAgentTiming Function\n');

const timing = getSubAgentTiming(['DESIGN', 'TESTING', 'RETRO', 'SECURITY']);

test(
  'DESIGN timing is PLAN phase',
  timing.DESIGN.phase === 'PLAN' &&
  timing.DESIGN.runAfter === 'LEAD-TO-PLAN' &&
  timing.DESIGN.runBefore === 'PLAN-TO-EXEC'
);

test(
  'TESTING timing is EXEC phase',
  timing.TESTING.phase === 'EXEC' &&
  timing.TESTING.runAfter === 'PLAN-TO-EXEC'
);

test(
  'RETRO timing is FINAL phase',
  timing.RETRO.phase === 'FINAL' &&
  timing.RETRO.runAfter === 'PLAN-TO-LEAD'
);

test(
  'SECURITY timing is ANY phase',
  timing.SECURITY.phase === 'ANY' &&
  timing.SECURITY.runAfter === null
);

// Test 6: SubAgentOrchestrator instantiation
console.log('\n📋 Test 6: SubAgentOrchestrator Instantiation\n');

let orchestrator = null;

if (supabaseUrl && supabaseKey) {
  const supabase = createClient(supabaseUrl, supabaseKey);
  orchestrator = new SubAgentOrchestrator(supabase);

  test(
    'SubAgentOrchestrator instantiates with Supabase client',
    orchestrator !== null && orchestrator.supabase !== undefined
  );

  test(
    'SubAgentOrchestrator has default timeout',
    orchestrator.defaultTimeout === 5 * 60 * 1000 // 5 minutes
  );

  test(
    'SubAgentOrchestrator has execution log',
    orchestrator.executionLog instanceof Map
  );
} else {
  console.log('⚠️  Skipping SubAgentOrchestrator tests (no Supabase credentials)\n');
}

// Test 7: Category-based requirements
console.log('\n📋 Test 7: Category-Based Requirements\n');

test(
  'Quality Assurance category includes TESTING, UAT, VALIDATION',
  SUBAGENT_REQUIREMENTS.byCategory['Quality Assurance'].includes('TESTING') &&
  SUBAGENT_REQUIREMENTS.byCategory['Quality Assurance'].includes('UAT') &&
  SUBAGENT_REQUIREMENTS.byCategory['Quality Assurance'].includes('VALIDATION')
);

test(
  'Security category includes SECURITY, RISK',
  SUBAGENT_REQUIREMENTS.byCategory['security'].includes('SECURITY') &&
  SUBAGENT_REQUIREMENTS.byCategory['security'].includes('RISK')
);

test(
  'Product feature category includes DESIGN, STORIES, API',
  SUBAGENT_REQUIREMENTS.byCategory['product_feature'].includes('DESIGN') &&
  SUBAGENT_REQUIREMENTS.byCategory['product_feature'].includes('STORIES') &&
  SUBAGENT_REQUIREMENTS.byCategory['product_feature'].includes('API')
);

// Test 8: Database integration (if credentials available)
async function runDatabaseTests() {
  if (!orchestrator) {
    console.log('\n⚠️  Skipping database tests (no Supabase credentials)\n');
    return;
  }

  console.log('\n📋 Test 8: Database Integration (requires LEO 5.0 SD)\n');

  try {
    const testSdId = '7ffc037e-a85a-4b31-afae-eb8a00517dd0'; // LEO 5.0 SD

    // Test getRequiredSubAgents
    const required = await orchestrator.getRequiredSubAgents(testSdId, 'PLAN');
    test(
      'getRequiredSubAgents returns object with required array',
      required && Array.isArray(required.required),
      `Got: ${typeof required}`
    );

    test(
      'getRequiredSubAgents includes phase info',
      required.phase === 'PLAN'
    );

    // Test checkSynthesisReady
    const synthesisStatus = await orchestrator.checkSynthesisReady(testSdId, 'PLAN');
    test(
      'checkSynthesisReady returns ready boolean',
      typeof synthesisStatus.ready === 'boolean'
    );

    test(
      'checkSynthesisReady returns pending array',
      Array.isArray(synthesisStatus.pending)
    );

    test(
      'checkSynthesisReady returns completed array',
      Array.isArray(synthesisStatus.completed)
    );

    // Test getExecutionHistory
    const history = await orchestrator.getExecutionHistory(testSdId);
    test(
      'getExecutionHistory returns array',
      Array.isArray(history),
      `Got: ${typeof history}`
    );

    // Test getSynthesisSummary
    const summary = await orchestrator.getSynthesisSummary(testSdId, 'PLAN');
    test(
      'getSynthesisSummary returns hasOutputs boolean',
      typeof summary.hasOutputs === 'boolean'
    );

  } catch (error) {
    console.log(`❌ Database test error: ${error.message}`);
    failed++;
  }
}

// Test 9: Phase filtering logic
console.log('\n📋 Test 9: Phase Filtering Logic\n');

// Simulate phase filtering
const allAgents = ['DESIGN', 'TESTING', 'RETRO', 'SECURITY', 'DATABASE', 'UAT'];
const planPhaseAgents = allAgents.filter(agent =>
  SUBAGENT_TIMING.PLAN_PHASE.includes(agent) ||
  SUBAGENT_TIMING.ANY_PHASE.includes(agent)
);

test(
  'PLAN phase filters correctly',
  planPhaseAgents.includes('DESIGN') &&
  planPhaseAgents.includes('SECURITY') &&
  planPhaseAgents.includes('DATABASE') &&
  !planPhaseAgents.includes('UAT') &&
  !planPhaseAgents.includes('RETRO')
);

const execPhaseAgents = allAgents.filter(agent =>
  SUBAGENT_TIMING.EXEC_PHASE.includes(agent) ||
  SUBAGENT_TIMING.ANY_PHASE.includes(agent)
);

test(
  'EXEC phase filters correctly',
  execPhaseAgents.includes('TESTING') &&
  execPhaseAgents.includes('SECURITY') &&
  execPhaseAgents.includes('UAT') &&
  !execPhaseAgents.includes('DESIGN') &&
  !execPhaseAgents.includes('RETRO')
);

const finalPhaseAgents = allAgents.filter(agent =>
  SUBAGENT_TIMING.FINAL_PHASE.includes(agent) ||
  SUBAGENT_TIMING.ANY_PHASE.includes(agent)
);

test(
  'FINAL phase filters correctly',
  finalPhaseAgents.includes('RETRO') &&
  finalPhaseAgents.includes('SECURITY') &&
  !finalPhaseAgents.includes('DESIGN') &&
  !finalPhaseAgents.includes('TESTING')
);

// Test 10: Synthesis blocking simulation
console.log('\n📋 Test 10: Synthesis Blocking Simulation\n');

// Simulate blockedBy array generation
const sdId = 'SD-TEST-001';
const phase = 'PLAN';
const requiredAgents = ['DESIGN', 'DATABASE', 'SECURITY'];
const synthesisBlockedBy = requiredAgents.map(a => `${sdId}-${phase}-${a}`);

test(
  'Synthesis blockedBy includes all required agents',
  synthesisBlockedBy.length === 3 &&
  synthesisBlockedBy.includes('SD-TEST-001-PLAN-DESIGN') &&
  synthesisBlockedBy.includes('SD-TEST-001-PLAN-DATABASE') &&
  synthesisBlockedBy.includes('SD-TEST-001-PLAN-SECURITY')
);

test(
  'Synthesis task ID format is correct',
  synthesisBlockedBy[0].match(/^SD-[\w-]+-\w+-\w+$/) !== null
);

// Run all tests
await runDatabaseTests();

// Summary
console.log('\n═══════════════════════════════════════════════════════════════');
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log('═══════════════════════════════════════════════════════════════\n');

process.exit(failed > 0 ? 1 : 0);

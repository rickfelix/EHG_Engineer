#!/usr/bin/env node
/**
 * Enhanced QA Engineering Director v2.0 + BMAD Test Architecture Phase
 *
 * Intelligent testing automation based on SD-RECONNECT-009 retrospective learnings.
 *
 * REFACTORED: Modularized from 926 LOC to ~100 LOC (SD-LEO-REFAC-TESTING-INFRA-001)
 * Modules: config, health-checks, preflight-phase, test-planning-phase,
 *          test-execution-phase, verdict-utils, helpers
 *
 * Total Time Savings: 3-4 hours per SD
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Import from decomposed modules
import {
  DEFAULT_OPTIONS,
  executePreflightPhase,
  executeTestPlanningPhase,
  executeTestExecutionPhase,
  calculateFinalVerdict,
  generateSummary,
  generateRecommendations,
  storeResults
} from './qa-director/index.js';

dotenv.config();

/**
 * Main QA Engineering Director Execution
 *
 * 5-Phase Intelligent Testing Workflow:
 * 1. Pre-flight Checks (build, migrations, dependencies)
 * 2. Smart Test Planning (tier selection, infrastructure discovery)
 * 3. Test Execution (run appropriate test tiers)
 * 4. Evidence Collection (screenshots, logs, coverage)
 * 5. Verdict & Handoff (summary, recommendations, next steps)
 */
export async function executeQADirector(sd_id, options = {}) {
  const mergedOptions = { ...DEFAULT_OPTIONS, ...options };
  const { targetApp, smokeOnly } = mergedOptions;

  console.log('═══════════════════════════════════════════════════════════');
  console.log(`🎯 QA Engineering Director v2.0 - Starting for ${sd_id}`);
  console.log(`   Target App: ${targetApp}`);
  if (smokeOnly) {
    console.log('   ⚡ FAST MODE: Smoke tests only (~60s)');
  }
  console.log('═══════════════════════════════════════════════════════════\n');

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
  );

  // Fetch SD details
  const { data: sd, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq('id', sd_id)
    .single();

  if (sdError || !sd) {
    return { verdict: 'ERROR', error: 'Strategic Directive not found', sd_id };
  }

  const results = {
    sd_id,
    targetApp,
    timestamp: new Date().toISOString(),
    phases: {}
  };

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 1: PRE-FLIGHT CHECKS
  // ═══════════════════════════════════════════════════════════════════
  const preflightResult = await executePreflightPhase(supabase, sd_id, sd, mergedOptions);

  if (preflightResult.blocked) {
    return {
      ...results,
      verdict: 'BLOCKED',
      blocker: preflightResult.blocker,
      phases: { pre_flight: preflightResult.preFlightResults },
      recommendations: preflightResult.recommendations,
      instructions: preflightResult.instructions,
      error: preflightResult.error
    };
  }

  results.phases.pre_flight = preflightResult.preFlightResults;

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 2: SMART TEST PLANNING
  // ═══════════════════════════════════════════════════════════════════
  const testPlanResults = await executeTestPlanningPhase(supabase, sd_id, sd, mergedOptions);
  results.phases.test_planning = testPlanResults;

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 3: TEST EXECUTION
  // ═══════════════════════════════════════════════════════════════════
  const testExecutionResults = await executeTestExecutionPhase(
    testPlanResults.tier_selection,
    mergedOptions
  );
  results.phases.test_execution = testExecutionResults;

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 4: EVIDENCE COLLECTION
  // ═══════════════════════════════════════════════════════════════════
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📸 PHASE 4: EVIDENCE COLLECTION');
  console.log('───────────────────────────────────────────────────────────\n');

  const evidenceResults = {
    screenshots: [],
    logs: [],
    coverage: null,
    test_reports: []
  };

  console.log('   ℹ️  Evidence collection placeholder');
  console.log('   (Screenshots, logs, coverage reports)\n');

  results.phases.evidence = evidenceResults;

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 5: VERDICT & HANDOFF
  // ═══════════════════════════════════════════════════════════════════
  console.log('═══════════════════════════════════════════════════════════');
  console.log('✅ PHASE 5: VERDICT & HANDOFF');
  console.log('───────────────────────────────────────────────────────────\n');

  const finalVerdict = calculateFinalVerdict(results);

  console.log(`   Final Verdict: ${finalVerdict.verdict}`);
  console.log(`   Confidence: ${finalVerdict.confidence}%`);
  console.log(`   Time Saved: ${finalVerdict.time_saved}\n`);

  results.verdict = finalVerdict.verdict;
  results.confidence = finalVerdict.confidence;
  results.time_saved = finalVerdict.time_saved;
  results.summary = generateSummary(results);
  results.recommendations = generateRecommendations(results);

  // Store results in database
  await storeResults(supabase, sd_id, results);

  console.log('═══════════════════════════════════════════════════════════');
  console.log('🎉 QA Engineering Director v2.0 - Complete');
  console.log('═══════════════════════════════════════════════════════════\n');

  return results;
}

// ═══════════════════════════════════════════════════════════════════
// CLI EXECUTION
// ═══════════════════════════════════════════════════════════════════
if (import.meta.url === `file://${process.argv[1]}`) {
  const sd_id = process.argv[2];

  if (!sd_id) {
    console.error('Usage: node qa-engineering-director-enhanced.js <SD-ID>');
    process.exit(1);
  }

  const options = {
    targetApp: process.argv[3] || 'ehg',
    skipBuild: process.argv.includes('--skip-build'),
    skipMigrations: process.argv.includes('--skip-migrations'),
    autoExecuteMigrations: !process.argv.includes('--no-auto-migrations'),
    forceManualTests: process.argv.includes('--force-manual'),
    smokeOnly: process.argv.includes('--smoke-only'),
    skipTestPlanGeneration: process.argv.includes('--skip-test-plan')
  };

  executeQADirector(sd_id, options)
    .then(results => {
      console.log('\n📊 Final Results:');
      console.log(JSON.stringify(results.summary, null, 2));
      process.exit(results.verdict === 'PASS' ? 0 : 1);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

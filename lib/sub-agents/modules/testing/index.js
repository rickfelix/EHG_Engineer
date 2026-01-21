/**
 * TESTING Sub-Agent (QA Engineering Director v3.0 - Intelligence Enhanced)
 * LEO Protocol v4.2.0 - Sub-Agent Performance Enhancement
 *
 * Purpose: Mission-Critical Testing Automation - Comprehensive E2E validation
 * Code: TESTING
 * Priority: 5
 *
 * Philosophy: "Do it right, not fast." E2E testing is MANDATORY, not optional.
 *
 * v3.0 Enhancements (2025-11-21):
 * - Phase 0: Intelligent Test Analysis
 *   - Selector validation: Auto-detect mismatches before running tests
 *   - Navigation flow validation: Verify navigation paths exist
 *   - Component mapping: Ensure test-to-component alignment
 *   - Contextual error analysis: Smart fix suggestions
 *
 * Created: 2025-10-11 (SD-SUBAGENT-IMPROVE-001)
 * Updated: 2025-11-15 (SD-LEO-PROTOCOL-V4-4-0: Adaptive validation support)
 * Updated: 2025-11-21 (v3.0: Phase 1 Intelligence Module - SD-FOUND-DATA-003)
 *
 * Refactored: 2026-01-21 - Modularized into separate files for maintainability
 */

import dotenv from 'dotenv';
import {
  detectValidationMode,
  logValidationMode
} from '../../../utils/adaptive-validation.js';
import { createSupabaseServiceClient } from '../../../../scripts/lib/supabase-connection.js';

// Import modular functions
import { preflightChecks } from './preflight.js';
import { generateTestCases } from './test-generation.js';
import { executeE2ETests } from './e2e-execution.js';
import { collectEvidence } from './evidence-collection.js';
import { generateVerdict } from './verdict.js';

// Import orchestration helpers
import {
  runHandoffPreflightCheck,
  resolveBranchContext,
  fetchSemanticPatterns,
  buildEnhancedOptions,
  checkForSkippableSdType,
  initializeResults,
  runPhase0Intelligence,
  checkForFreshEvidence,
  buildCachedPhase3Results,
  processPhase3Results,
  verifyUserStories
} from './orchestration-helpers.js';

dotenv.config();
let supabase = null;

/**
 * Execute TESTING sub-agent
 * Implements QA Engineering Director v2.0 workflow
 *
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} subAgent - Sub-agent instructions (already loaded)
 * @param {Object} options - Execution options
 * @returns {Promise<Object>} Testing results
 */
export async function execute(sdId, subAgent, options = {}) {
  console.log(`\n[TESTING] Starting TESTING for ${sdId}...`);
  console.log('   QA Engineering Director v2.0 - Testing-First Edition');

  // Initialize Supabase client
  if (!supabase) {
    supabase = await createSupabaseServiceClient('engineer', { verbose: false });
  }

  // TIER 1.5: Handoff Preflight Check
  await runHandoffPreflightCheck(sdId);

  // LEO v4.4.3: Resolve feature branch for branch-aware test scanning
  const branchContext = await resolveBranchContext(sdId, supabase);

  // Fetch semantic patterns from user stories' e2e_test_path
  const semanticPatterns = await fetchSemanticPatterns(sdId, supabase);

  // Build enhanced options with branch context
  const enhancedOptions = buildEnhancedOptions(options, branchContext, semanticPatterns);

  // SD-LEO-PROTOCOL-V4-4-0: Detect validation mode
  const validationMode = await detectValidationMode(sdId, options);

  logValidationMode('TESTING', validationMode, {
    'Prospective': 'BLOCKED if --full-e2e flag missing',
    'Retrospective': 'CONDITIONAL_PASS if E2E tests exist and pass'
  });

  // PAT-DB-SD-E2E-001: Check for non-UI SD types that skip E2E
  const skipResult = await checkForSkippableSdType(sdId, validationMode, options, supabase);
  if (skipResult) {
    return skipResult;
  }

  // Initialize results structure
  const results = initializeResults(validationMode, options);

  try {
    // Phase 0: Intelligent Test Analysis
    console.log('\n[PHASE 0] Intelligent Test Analysis (v3.0 Enhanced)...');
    await runPhase0Intelligence(sdId, enhancedOptions, results);

    // Phase 1: Pre-flight Checks
    console.log('\n[PHASE 1] Pre-flight Checks...');
    const phase1 = await preflightChecks(sdId, options, supabase);
    results.findings.phase1_preflight = phase1;

    if (phase1.blocked) {
      results.verdict = 'BLOCKED';
      results.confidence = 100;
      results.critical_issues.push(...phase1.critical_issues);
      return results;
    }

    if (phase1.warnings.length > 0) {
      results.warnings.push(...phase1.warnings);
      if (results.confidence > 90) results.confidence = 90;
    }

    // Phase 2: Professional Test Case Generation
    console.log('\n[PHASE 2] Test Case Generation...');
    const phase2 = await generateTestCases(sdId, options, supabase);
    results.findings.phase2_test_generation = phase2;

    if (phase2.user_stories_count === 0) {
      console.log('   [WARN] No user stories found - cannot generate test cases');
      results.warnings.push({
        severity: 'HIGH',
        issue: 'No user stories found for SD',
        recommendation: 'Create user stories before testing (Product Requirements Expert)',
        note: 'E2E tests should map to user stories (100% coverage required)'
      });
      if (results.confidence > 70) results.confidence = 70;
    }

    // Phase 2.5: Check for fresh test evidence
    console.log('\n[PHASE 2.5] Checking for existing test evidence...');
    const { skipTestExecution, freshEvidence } = await checkForFreshEvidence(sdId, validationMode, results, supabase);

    if (!skipTestExecution) {
      console.log('   Proceeding with standard test execution');
    }

    // Phase 3: E2E Test Execution
    console.log('\n[PHASE 3] E2E Test Execution (MANDATORY)...');
    let phase3;

    if (skipTestExecution && freshEvidence) {
      phase3 = buildCachedPhase3Results(freshEvidence);
      console.log(`   [CACHE] Using cached evidence: ${phase3.tests_passed}/${phase3.tests_executed} tests passed`);
    } else {
      phase3 = await executeE2ETests(sdId, options, supabase);
    }
    results.findings.phase3_execution = phase3;

    processPhase3Results(phase3, results);

    // Phase 4: Evidence Collection
    console.log('\n[PHASE 4] Evidence Collection...');
    const phase4 = await collectEvidence(sdId, phase3);
    results.findings.phase4_evidence = phase4;

    // Phase 4.5: User Story Verification
    console.log('\n[PHASE 4.5] User Story Verification...');
    await verifyUserStories(sdId, results, supabase);

    // Phase 5: Verdict & Testing Learnings
    console.log('\n[PHASE 5] Verdict & Testing Learnings...');
    const phase5 = generateVerdict(results, validationMode);
    results.findings.phase5_verdict = phase5;

    results.verdict = phase5.verdict;
    results.confidence = phase5.confidence;
    results.recommendations = phase5.recommendations;

    if (phase5.justification) results.justification = phase5.justification;
    if (phase5.conditions) results.conditions = phase5.conditions;

    console.log(`\n[COMPLETE] TESTING Complete: ${results.verdict} (${results.confidence}% confidence)`);

    return results;

  } catch (error) {
    console.error('\n[ERROR] TESTING error:', error.message);
    results.verdict = 'FAIL';
    results.error = error.message;
    results.confidence = 0;
    results.critical_issues.push({
      severity: 'CRITICAL',
      issue: 'TESTING sub-agent execution failed',
      recommendation: 'Review error and retry',
      error: error.message
    });
    return results;
  }
}

// Re-export module functions for direct access if needed
export { preflightChecks } from './preflight.js';
export { generateTestCases } from './test-generation.js';
export { executeE2ETests } from './e2e-execution.js';
export { collectEvidence } from './evidence-collection.js';
export { generateVerdict } from './verdict.js';
export { suggestTroubleshootingTactics } from './troubleshooting.js';

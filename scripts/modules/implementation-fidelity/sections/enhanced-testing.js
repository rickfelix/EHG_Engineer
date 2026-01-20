/**
 * Section D: Enhanced Testing (25 points)
 * Part of SD-LEO-REFACTOR-IMPL-FIDELITY-001
 *
 * Phase-aware weighting: E2E tests are CRITICAL (20 pts increased from 15)
 */

import { existsSync } from 'fs';
import { readdir } from 'fs/promises';
import path from 'path';
import { getSDSearchTerms, gitLogForSD, detectImplementationRepo } from '../utils/index.js';

/**
 * Validate Enhanced Testing
 *
 * @param {string} sd_id - Strategic Directive ID
 * @param {Object} designAnalysis - Design analysis from PRD metadata
 * @param {Object} databaseAnalysis - Database analysis from PRD metadata
 * @param {Object} validation - Validation object to populate
 * @param {Object} supabase - Supabase client
 */
export async function validateEnhancedTesting(sd_id, designAnalysis, databaseAnalysis, validation, supabase) {
  let sectionScore = 0;
  const sectionDetails = {};

  console.log('\n   [D] Enhanced Testing...');

  // D1: Check for E2E tests (20 points - CRITICAL)
  console.log('\n   [D1] E2E Test Coverage & Execution (CRITICAL)...');

  try {
    const implementationRepo = await detectImplementationRepo(sd_id, supabase);

    const testDirs = [
      'tests/e2e',
      'tests/integration',
      'tests/unit',
      'e2e',
      'playwright/tests'
    ];

    let testFiles = [];
    for (const dir of testDirs) {
      const fullPath = path.join(implementationRepo, dir);
      if (existsSync(fullPath)) {
        const files = await readdir(fullPath, { recursive: true });
        const sdTests = files.filter(f =>
          typeof f === 'string' &&
          (f.includes(sd_id.toLowerCase()) ||
           f.includes(sd_id.replace('SD-', '').toLowerCase()) ||
           f.endsWith('.test.ts') ||
           f.endsWith('.test.js') ||
           f.endsWith('.spec.ts') ||
           f.endsWith('.spec.js'))
        );
        testFiles.push(...sdTests.map(f => path.join(dir, f)));
      }
    }

    if (testFiles.length > 0) {
      sectionScore += 20;
      sectionDetails.e2e_tests = testFiles;
      sectionDetails.e2e_test_count = testFiles.length;
      console.log(`   ✅ Found ${testFiles.length} E2E test file(s) (20/20)`);
    } else {
      validation.issues.push('[D1] CRITICAL: No E2E tests found for this SD');
      sectionScore += 0;
      console.log('   ❌ No E2E tests found - MANDATORY requirement (0/20)');
    }
  } catch (_error) {
    validation.issues.push('[D1] E2E test check failed - cannot verify');
    sectionScore += 0;
    console.log('   ❌ Cannot verify E2E tests - error (0/20)');
  }

  // D1b: Check TESTING sub-agent for unit test execution & pass status
  console.log('\n   [D1b] Unit Tests Executed & Passing (NON-NEGOTIABLE)...');

  if (validation.details.bugfix_mode) {
    console.log('   ℹ️  Bugfix SD - TESTING sub-agent check SKIPPED');
    console.log('   ℹ️  Bugfix SDs validated via git commit evidence');
    sectionDetails.unit_tests_verified = true;
    sectionDetails.testing_verdict = 'SKIPPED_BUGFIX';
    sectionScore += 15;
  } else {
    try {
      const { data: testingResults, error: testingError } = await supabase
        .from('sub_agent_execution_results')
        .select('verdict, metadata')
        .eq('sd_id', sd_id)
        .eq('sub_agent_code', 'TESTING')
        .order('created_at', { ascending: false })
        .limit(1);

      if (testingError) {
        validation.issues.push('[D1b] Cannot query TESTING sub-agent results');
        console.log('   ❌ Cannot query TESTING results (NON-NEGOTIABLE not verified)');
      } else if (!testingResults || testingResults.length === 0) {
        validation.warnings.push('[D1b] TESTING sub-agent has not been executed');
        console.log('   ⚠️  TESTING sub-agent not executed - cannot verify unit tests');
      } else {
        const testingResult = testingResults[0];

        if (testingResult.verdict === 'PASS') {
          sectionDetails.unit_tests_verified = true;
          sectionDetails.testing_verdict = 'PASS';
          console.log('   ✅ TESTING sub-agent verdict: PASS (unit tests passed)');
        } else if (testingResult.verdict === 'BLOCKED') {
          validation.issues.push('[D1b] CRITICAL: TESTING sub-agent verdict is BLOCKED (tests failed or did not run)');
          sectionDetails.unit_tests_verified = false;
          sectionDetails.testing_verdict = 'BLOCKED';
          console.log('   ❌ TESTING verdict: BLOCKED - unit/E2E tests failed (NON-NEGOTIABLE)');
        } else if (testingResult.verdict === 'CONDITIONAL_PASS') {
          validation.warnings.push('[D1b] TESTING sub-agent verdict is CONDITIONAL_PASS (tests may not have fully passed)');
          sectionDetails.unit_tests_verified = false;
          sectionDetails.testing_verdict = 'CONDITIONAL_PASS';
          console.log('   ⚠️  TESTING verdict: CONDITIONAL_PASS - review test results');
        } else {
          validation.warnings.push(`[D1b] Unexpected TESTING verdict: ${testingResult.verdict}`);
          console.log(`   ⚠️  TESTING verdict: ${testingResult.verdict}`);
        }
      }
    } catch (error) {
      validation.warnings.push(`[D1b] Error checking unit tests: ${error.message}`);
      console.log(`   ⚠️  Error checking unit tests: ${error.message}`);
    }
  }

  // D2: Check for database migration tests (2 points - MINOR)
  console.log('\n   [D2] Database Migration Tests...');

  const exemptSections = validation.details.gate2_exempt_sections || [];
  const isD2Exempt = exemptSections.includes('D2_migration_tests');

  if (isD2Exempt) {
    sectionScore += 2;
    sectionDetails.D2_exempt = true;
    console.log('   ✅ D2 exempt for this SD type - full credit (2/2)');
  } else {
    try {
      const searchTerms = await getSDSearchTerms(sd_id, supabase);
      const implementationRepo = await detectImplementationRepo(sd_id, supabase);
      const gitLog = await gitLogForSD(
        `git -C "${implementationRepo}" log --all --grep="\${TERM}" --name-only --pretty=format:""`,
        searchTerms,
        { timeout: 10000 }
      );

      const hasMigrationTests = gitLog.includes('migration') && gitLog.includes('test');

      if (hasMigrationTests) {
        sectionScore += 2;
        sectionDetails.migration_tests_found = true;
        console.log('   ✅ Migration tests found (2/2)');
      } else {
        validation.warnings.push('[D2] No migration tests detected');
        sectionScore += 1;
        console.log('   ⚠️  No migration tests detected (1/2)');
      }
    } catch (_error) {
      sectionScore += 1;
      console.log('   ⚠️  Cannot verify migration tests (1/2)');
    }
  }

  // D3: Check for test coverage metadata (3 points - MINOR)
  console.log('\n   [D3] Test Coverage Documentation...');

  const { data: handoffData } = await supabase
    .from('sd_phase_handoffs')
    .select('metadata')
    .eq('sd_id', sd_id)
    .eq('handoff_type', 'EXEC-TO-PLAN')
    .order('created_at', { ascending: false })
    .limit(1);

  if (handoffData?.[0]?.metadata) {
    const metadataStr = JSON.stringify(handoffData[0].metadata).toLowerCase();
    const hasCoverage = metadataStr.includes('test') ||
                        metadataStr.includes('coverage') ||
                        metadataStr.includes('e2e');

    if (hasCoverage) {
      sectionScore += 3;
      sectionDetails.test_coverage_documented = true;
      console.log('   ✅ Test coverage documented in handoff (3/3)');
    } else {
      validation.warnings.push('[D3] Test coverage not documented in handoff');
      sectionScore += 2;
      console.log('   ⚠️  Test coverage not documented (2/3)');
    }
  } else {
    sectionScore += 2;
    console.log('   ⚠️  No handoff metadata found (2/3)');
  }

  validation.score += sectionScore;
  validation.gate_scores.enhanced_testing = sectionScore;
  validation.details.enhanced_testing = sectionDetails;
  console.log(`\n   Section D Score: ${sectionScore}/25`);
}

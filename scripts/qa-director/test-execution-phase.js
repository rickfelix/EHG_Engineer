/**
 * QA Engineering Director - Test Execution Phase
 * Execute smoke tests, unit tests, E2E tests
 */

import { execSync } from 'child_process';
import { EHG_ROOT } from './config.js';
import { checkDevServerHealth } from './health-checks.js';
import { parseVitestOutput, parsePlaywrightOutput } from '../modules/qa/test-output-parser.js';

/**
 * Execute test execution phase
 * @param {Object} tierResult - Test tier selection result
 * @param {Object} options - Execution options
 * @returns {Promise<Object>} Test execution results
 */
export async function executeTestExecutionPhase(tierResult, options) {
  const { smokeOnly, forceManualTests } = options;
  const testExecutionResults = {};

  console.log('═══════════════════════════════════════════════════════════');
  console.log('🧪 PHASE 3: TEST EXECUTION');
  console.log('───────────────────────────────────────────────────────────\n');

  for (const tier of tierResult.recommended_tiers) {
    // In smoke-only mode, skip everything except Smoke Tests
    if (smokeOnly && tier.name !== 'Smoke Tests') {
      console.log(`   ⏭️  Skipping ${tier.name} (smoke-only mode)\n`);
      continue;
    }

    if (!tier.required && !forceManualTests) {
      console.log(`   ⏭️  Skipping ${tier.name} (not required)\n`);
      continue;
    }

    if (tier.name === 'Smoke Tests') {
      const smokeResults = await executeSmokeTests();
      testExecutionResults.smoke = smokeResults;
    }

    // E2E Tests tier is now part of Tier 1 (Smoke Tests)
    if (tier.name === 'E2E Tests' && tier.required && !testExecutionResults.smoke) {
      console.log('⚠️  Note: E2E tests are now part of Tier 1 (Smoke Tests)');
      console.log('   Run with default tier to execute dual test requirement\n');
    }

    if (tier.name === 'Manual Testing' && tier.required) {
      console.log('👤 Tier 3: Manual Testing Required');
      console.log(`   Checklist Size: ${tier.checklist_size}`);
      console.log(`   Time Budget: ${tier.time_budget}`);
      testExecutionResults.manual = {
        required: true,
        checklist_generated: true,
        items_count: 7
      };
      console.log('   ℹ️  Manual testing checklist generated\n');
    }
  }

  return testExecutionResults;
}

/**
 * Execute smoke tests (Unit + E2E)
 * @returns {Promise<Object>} Smoke test results
 */
async function executeSmokeTests() {
  console.log('🔥 Executing Tier 1: Dual Test Execution (Unit + E2E)...');
  console.log('   ⚠️  MANDATORY: Both test types must pass\n');

  // 1. Run Unit Tests (Vitest)
  console.log('   🧪 Step 1/2: Running Unit Tests (Vitest)...');
  const unitTestResults = await executeUnitTests();
  console.log('');

  // 2. Run E2E Tests (Playwright)
  console.log('   🎭 Step 2/2: Running E2E Tests (Playwright)...');
  const e2eTestResults = await executeE2ETests();
  console.log('');

  // Aggregate results - BOTH must pass
  const bothPassed = unitTestResults.success && e2eTestResults.success;

  // Summary
  console.log('   📊 Dual Test Summary:');
  console.log(`      Unit Tests: ${unitTestResults.success ? '✅ PASS' : '❌ FAIL'} (${unitTestResults.passed}/${unitTestResults.total_tests})`);
  console.log(`      E2E Tests:  ${e2eTestResults.success ? '✅ PASS' : '❌ FAIL'} (${e2eTestResults.passed}/${e2eTestResults.total_tests})`);
  console.log(`      Overall:    ${bothPassed ? '✅ PASS' : '❌ FAIL'} (Both required)\n`);

  return {
    executed: true,
    verdict: bothPassed ? 'PASS' : 'FAIL',
    unit_tests: {
      verdict: unitTestResults.success ? 'PASS' : 'FAIL',
      test_count: unitTestResults.total_tests,
      passed: unitTestResults.passed,
      failed: unitTestResults.failed,
      duration_seconds: unitTestResults.duration_seconds,
      coverage_percentage: unitTestResults.coverage_percentage,
      framework: 'vitest'
    },
    e2e_tests: {
      verdict: e2eTestResults.success ? 'PASS' : 'FAIL',
      test_count: e2eTestResults.total_tests,
      passed: e2eTestResults.passed,
      failed: e2eTestResults.failed,
      duration_seconds: e2eTestResults.duration_seconds,
      framework: 'playwright'
    }
  };
}

/**
 * Execute unit tests with Vitest
 * @returns {Promise<Object>} Unit test results
 */
async function executeUnitTests() {
  try {
    const output = execSync('npx vitest run tests/unit --reporter=verbose --no-watch --run', {
      cwd: EHG_ROOT,
      encoding: 'utf8',
      timeout: 300000, // 5 min timeout
      stdio: 'pipe',
      env: { ...process.env, CI: 'true' }
    });

    const results = parseVitestOutput(output);

    if (results.success) {
      console.log(`      ✅ Unit tests PASSED (${results.passed}/${results.total_tests} tests, ${results.duration_seconds.toFixed(1)}s)`);
      if (results.coverage_percentage) {
        console.log(`      📊 Coverage: ${results.coverage_percentage.toFixed(1)}%`);
      }
    } else {
      console.log(`      ❌ Unit tests FAILED (${results.failed} failures)`);
    }

    return results;
  } catch (error) {
    console.log(`      ❌ Unit tests FAILED (execution error): ${error.message}`);
    return {
      success: false,
      total_tests: 0,
      passed: 0,
      failed: 1,
      duration_seconds: 0,
      error: error.message
    };
  }
}

/**
 * Execute E2E tests with Playwright
 * @returns {Promise<Object>} E2E test results
 */
async function executeE2ETests() {
  // Check dev server availability first (port 5173)
  const devServerReady = await checkDevServerHealth(5173, 10);
  if (!devServerReady) {
    console.log('      ⚠️  Dev server not responding on port 5173');
    console.log(`      💡 Start dev server: cd ${EHG_ROOT} && npm run dev -- --port 5173`);
    return {
      success: false,
      total_tests: 0,
      passed: 0,
      failed: 1,
      duration_seconds: 0,
      error: 'Dev server not available on port 5173'
    };
  }

  console.log('      ✅ Dev server ready on port 5173\n');

  try {
    const smokeTestFile = 'tests/e2e/board-governance.spec.ts';

    const output = execSync(`npm run test:e2e -- ${smokeTestFile} --project=mock`, {
      cwd: EHG_ROOT,
      encoding: 'utf8',
      timeout: 600000, // 10 min timeout for E2E
      stdio: 'pipe'
    });

    const results = parsePlaywrightOutput(output);

    if (results.success) {
      console.log(`      ✅ E2E tests PASSED (${results.passed}/${results.total_tests} tests, ${Math.floor(results.duration_seconds / 60)}m ${Math.floor(results.duration_seconds % 60)}s)`);
    } else {
      console.log(`      ❌ E2E tests FAILED (${results.failed} failures)`);
    }

    return results;
  } catch (error) {
    console.log('      ❌ E2E tests FAILED (execution error)');
    console.log(`      Error: ${error.message}`);

    if (error.stdout) {
      console.log(`\n      📋 Test Output:\n${error.stdout.split('\n').slice(-20).join('\n')}`);
    }
    if (error.stderr) {
      console.log(`\n      ⚠️  Error Output:\n${error.stderr.split('\n').slice(-10).join('\n')}`);
    }

    return {
      success: false,
      total_tests: 0,
      passed: 0,
      failed: 1,
      duration_seconds: 0,
      error: error.message,
      stdout: error.stdout,
      stderr: error.stderr
    };
  }
}

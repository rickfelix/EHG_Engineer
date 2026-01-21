/**
 * Test Runner for Complete Quick-Fix
 * Part of quick-fix modularization
 */

import { execSync } from 'child_process';
import { TEST_TIMEOUT_UNIT, TEST_TIMEOUT_E2E } from './constants.js';

/**
 * Run tests programmatically and return results
 * @param {string} testType - 'unit' or 'e2e'
 * @param {object} options - Test options including testDir for target application
 * @returns {object} Test results with passed, output, exitCode
 */
export function runTests(testType, options = {}) {
  const testCommands = {
    unit: 'npm run test:unit',
    e2e: 'npm run test:e2e -- --grep="smoke" --reporter=list'
  };

  const timeouts = {
    unit: TEST_TIMEOUT_UNIT,
    e2e: TEST_TIMEOUT_E2E
  };

  const command = testCommands[testType];
  const timeout = timeouts[testType];
  const testDir = options.testDir || process.cwd();

  if (!command) {
    return { passed: false, output: `Unknown test type: ${testType}`, exitCode: 1 };
  }

  console.log(`   🧪 Running ${testType} tests...`);
  console.log(`      Command: ${command}`);
  console.log(`      Directory: ${testDir}`);
  console.log(`      Timeout: ${timeout / 1000}s\n`);

  try {
    const output = execSync(command, {
      encoding: 'utf-8',
      timeout,
      stdio: 'pipe',
      cwd: testDir
    });

    return {
      passed: true,
      output: output.substring(0, 2000),
      exitCode: 0,
      summary: extractTestSummary(output, testType)
    };
  } catch (err) {
    const output = err.stdout?.toString() || err.stderr?.toString() || err.message;

    if (err.killed || err.signal === 'SIGTERM') {
      return {
        passed: false,
        output: `Test timed out after ${timeout / 1000}s`,
        exitCode: 124,
        timedOut: true
      };
    }

    return {
      passed: false,
      output: output.substring(0, 2000),
      exitCode: err.status || 1,
      summary: extractTestSummary(output, testType)
    };
  }
}

/**
 * Extract test summary from output
 * @param {string} output - Test output
 * @param {string} testType - Type of test
 * @returns {object} Summary object
 */
export function extractTestSummary(output, testType) {
  const summary = { passed: 0, failed: 0, skipped: 0, total: 0 };

  if (testType === 'unit') {
    const testsMatch = output.match(/Tests:\s+(\d+)\s+passed(?:,\s+(\d+)\s+failed)?(?:,\s+(\d+)\s+skipped)?(?:,\s+(\d+)\s+total)?/i);
    if (testsMatch) {
      summary.passed = parseInt(testsMatch[1]) || 0;
      summary.failed = parseInt(testsMatch[2]) || 0;
      summary.skipped = parseInt(testsMatch[3]) || 0;
      summary.total = parseInt(testsMatch[4]) || summary.passed + summary.failed;
    }
  } else if (testType === 'e2e') {
    const passedMatch = output.match(/(\d+)\s+passed/i);
    const failedMatch = output.match(/(\d+)\s+failed/i);
    if (passedMatch) summary.passed = parseInt(passedMatch[1]);
    if (failedMatch) summary.failed = parseInt(failedMatch[1]);
    summary.total = summary.passed + summary.failed;
  }

  return summary;
}

/**
 * Run TypeScript verification
 * @param {string} testDir - Directory to run tsc in
 * @param {boolean} skip - Skip TypeScript check
 * @returns {object} Result with passed and output
 */
export function runTypeScriptCheck(testDir, skip = false) {
  if (skip) {
    console.log('   ⚠️  TypeScript check skipped (--skip-typecheck flag)\n');
    return { passed: true, skipped: true };
  }

  console.log('📘 TYPESCRIPT VERIFICATION\n');
  console.log('   🔍 Running TypeScript compiler check...');
  console.log('      Command: npx tsc --noEmit');
  console.log(`      Directory: ${testDir}`);
  console.log('      Timeout: 60s\n');

  try {
    execSync('npx tsc --noEmit', {
      encoding: 'utf-8',
      timeout: 60000,
      stdio: 'pipe',
      cwd: testDir
    });
    console.log('   ✅ TypeScript compilation PASSED\n');
    return { passed: true };
  } catch (err) {
    const output = err.stdout?.toString() || err.stderr?.toString() || err.message;
    console.log('   ❌ TypeScript compilation FAILED\n');

    if (output) {
      console.log('   📋 TypeScript Errors (truncated):');
      const lines = output.split('\n').slice(0, 20);
      lines.forEach(line => console.log(`      ${line}`));
      if (output.split('\n').length > 20) {
        console.log(`      ... and ${output.split('\n').length - 20} more lines`);
      }
    }

    return { passed: false, output };
  }
}

/**
 * Display test results summary
 * @param {object} unitResult - Unit test results
 * @param {object} e2eResult - E2E test results
 */
export function displayTestResults(unitResult, e2eResult) {
  if (unitResult) {
    if (unitResult.passed) {
      console.log('   ✅ Unit tests PASSED');
      if (unitResult.summary) {
        console.log(`      ${unitResult.summary.passed} passed, ${unitResult.summary.failed} failed`);
      }
    } else {
      console.log('   ❌ Unit tests FAILED');
      if (unitResult.timedOut) {
        console.log(`      Timed out after ${TEST_TIMEOUT_UNIT / 1000}s`);
      }
      if (unitResult.summary && unitResult.summary.failed > 0) {
        console.log(`      ${unitResult.summary.passed} passed, ${unitResult.summary.failed} failed`);
      }
      if (unitResult.output) {
        console.log('\n   📋 Test Output (truncated):');
        const lines = unitResult.output.split('\n').slice(-15);
        lines.forEach(line => console.log(`      ${line}`));
      }
    }
  }

  if (e2eResult) {
    if (e2eResult.passed) {
      console.log('   ✅ E2E tests PASSED');
      if (e2eResult.summary) {
        console.log(`      ${e2eResult.summary.passed} passed, ${e2eResult.summary.failed} failed`);
      }
    } else {
      console.log('   ❌ E2E tests FAILED');
      if (e2eResult.timedOut) {
        console.log(`      Timed out after ${TEST_TIMEOUT_E2E / 1000}s`);
      }
      if (e2eResult.summary && e2eResult.summary.failed > 0) {
        console.log(`      ${e2eResult.summary.passed} passed, ${e2eResult.summary.failed} failed`);
      }
      if (e2eResult.output) {
        console.log('\n   📋 Test Output (truncated):');
        const lines = e2eResult.output.split('\n').slice(-15);
        lines.forEach(line => console.log(`      ${line}`));
      }
    }
  }
}
